import { sampleBoundary } from "./cad-curves";
import { it, expect } from "vitest";
import {
  makeProject,
  makePiece,
  pieceArea,
  createEdgeBacksplash,
} from "./engine";
import { normalizeDrawingScales } from "./drawing-scale";
import { drawingEdges, linkedDrawingPanel } from "./annotations";
import { slabBounds } from "./drawing-slabs";
import { slabUsage } from "./slab-usage";
import { nudgePieces } from "./transforms";
import { copyPieces, pastePieces } from "./piece-clipboard";
const rect = () => ({
  ...makePiece("Island"),
  length: "100",
  width: "50",
  annotation: [0, 0] as [number, number],
});
it("repairs legacy manual pieces to match stock scale without changing their physical area", () => {
  const p = makeProject();
  p.pieces = [rect()];
  p.drawingSlabs = [
    {
      id: "stock",
      drawingId: "",
      length: "100",
      width: "50",
      scale: 0.1,
      x: 0,
      y: 0,
    },
  ];
  const q = normalizeDrawingScales(p);
  const bounds = slabBounds(q.drawingSlabs![0]);
  expect(drawingEdges(q.pieces[0])[0].end[0]).toBe(bounds.width);
  expect(bounds.width).toBe(1000);
  expect(pieceArea(q.pieces[0]).toNumber()).toBe(5000);
  expect(slabUsage(q, q.drawingSlabs![0]).usedPercent.toNumber()).toBe(100);
  expect(normalizeDrawingScales(q)).toBe(q);
  expect(nudgePieces(q, [q.pieces[0].id], [1, 0]).pieces[0].annotation[0]).toBe(
    10,
  );
});
it("uses a stored DXF scale even after imported pieces have been deleted", () => {
  const p = makeProject();
  p.drawings = [
    {
      id: "cad",
      name: "CAD",
      data: "",
      width: 1000,
      height: 500,
      scale: 0.125,
      kind: "dxf",
    },
  ];
  p.pieces = [{ ...rect(), drawingId: "cad" }];
  const q = normalizeDrawingScales(p);
  expect(drawingEdges(q.pieces[0])[0].end[0]).toBe(800);
  q.pieces.push(createEdgeBacksplash(q, q.pieces[0].id, 0, "4"));
  const panel = linkedDrawingPanel(q, q.pieces[1])!;
  expect(Math.abs(panel.boundary[1].end[1] - panel.boundary[1].start[1])).toBe(
    32,
  );
});
it("copy/paste remaps linked panels, preserves measurements and uses target scale", () => {
  let p = makeProject();
  p.pieces = [rect()];
  p = normalizeDrawingScales(p);
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  const clip = copyPieces(p, [p.pieces[0].id]);
  expect(clip.pieces).toHaveLength(2);
  const target = makeProject();
  target.drawingSlabs = [
    {
      id: "stock",
      drawingId: "",
      length: "100",
      width: "50",
      scale: 0.1,
      x: 0,
      y: 0,
    },
  ];
  const pasted = pastePieces(target, clip, "");
  expect(pasted.project.pieces[1].edgeSource!.pieceId).toBe(
    pasted.project.pieces[0].id,
  );
  expect(pasted.project.pieces[0].id).not.toBe(p.pieces[0].id);
  expect(pieceArea(pasted.project.pieces[0]).toNumber()).toBe(5000);
  const e = drawingEdges(pasted.project.pieces[0])[0];
  expect(e.end[0] - e.start[0]).toBe(1000);
});
it("copying a linked panel alone creates an independent measured copy", () => {
  let p = makeProject();
  p.pieces = [rect()];
  p = normalizeDrawingScales(p);
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  const result = pastePieces(p, copyPieces(p, [p.pieces[1].id]), "");
  const piece = result.project.pieces.at(-1)!;
  expect(piece.edgeSource).toBeUndefined();
  expect(piece.surface).toBe("backsplash");
  expect(pieceArea(piece).toNumber()).toBe(400);
  expect(p.pieces).toHaveLength(2);
});

it("persists an inferred legacy CAD scale when stock or pieces are later removed", () => {
  const p = makeProject();
  p.drawings = [
    { id: "old-cad", name: "Old DXF", data: "", width: 1000, height: 500 },
  ];
  p.drawingSlabs = [
    {
      id: "stock",
      drawingId: "old-cad",
      length: "100",
      width: "50",
      scale: 0.1,
      x: 0,
      y: 0,
    },
  ];
  const migrated = normalizeDrawingScales(p);
  expect(migrated.drawings[0].scale).toBe(0.1);
  const q = normalizeDrawingScales({
    ...migrated,
    drawingSlabs: [],
    pieces: [{ ...rect(), drawingId: "old-cad" }],
  });
  expect(q.pieces[0].displayScale).toBe(0.1);
});
it("pastes CAD arcs at another scale without changing analytic area or polished edge indices", () => {
  const p = makeProject();
  const boundary = [
    {
      start: [-5, 0] as [number, number],
      end: [5, 0] as [number, number],
      center: [0, 0] as [number, number],
      radius: 5,
      sweep: Math.PI,
    },
    { start: [5, 0] as [number, number], end: [-5, 0] as [number, number] },
  ];
  p.pieces = [
    {
      ...makePiece("Polygon"),
      scale: "0.1",
      scaleConfirmed: true,
      boundary,
      points: sampleBoundary(boundary),
      polishedEdges: [0],
      polishedEdgeCount: 2,
    },
  ];
  const q = pastePieces(
    makeProject(),
    copyPieces(p, [p.pieces[0].id]),
    "",
  ).project;
  expect(pieceArea(q.pieces[0]).toNumber()).toBeCloseTo(
    pieceArea(p.pieces[0]).toNumber(),
    10,
  );
  expect(q.pieces[0].boundary![0].radius).toBe(1);
  expect(q.pieces[0].polishedEdges).toEqual([0]);
});

it("copies a slab with its dimensions, name and lock at the destination scale", () => {
  const source = {
    id: "stock",
    name: "Quartz",
    drawingId: "a",
    length: "100",
    width: "50",
    scale: 0.1,
    x: 0,
    y: 0,
    locked: true,
  };
  const result = pastePieces(
    makeProject(),
    { pieces: [], slabs: [source] },
    "",
  );
  const s = result.project.drawingSlabs![0];
  expect(s.scale).toBe(0.5);
  expect(s.length).toBe("100");
  expect(s.locked).toBe(true);
  expect(s.name).toBe("Quartz copy");
  expect(result.slabIds).toHaveLength(1);
});
