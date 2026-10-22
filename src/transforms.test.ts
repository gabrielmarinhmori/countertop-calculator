import { describe, it, expect } from "vitest";
import {
  makeProject,
  makePiece,
  pieceArea,
  physicalEdges,
  category,
  createEdgeBacksplash,
} from "./engine";
import { drawingEdges } from "./annotations";
import { transformPieces, nudgePieces, snappedDelta } from "./transforms";
import { polishedLength, linearCut } from "./cutting";
import { sampleBoundary } from "./cad-curves";
import { restoreProject } from "./restore";
const rect = () => ({
  ...makePiece("Island"),
  length: "96",
  width: "25.5",
  annotation: [0, 0] as [number, number],
});
describe("rigid drawing transformations", () => {
  it("moves and rotates a group without changing dimensions, area or polished length", () => {
    const p = makeProject();
    p.pieces = [
      { ...rect(), polishedEdges: [0], polishedEdgeCount: 4 },
      { ...rect(), annotation: [250, 0] },
    ];
    const q = transformPieces(
      p,
      p.pieces.map((p) => p.id),
      [20, 30],
      90,
    );
    expect(q.pieces.map(pieceArea).map((a) => a.toNumber())).toEqual([
      2448, 2448,
    ]);
    expect(polishedLength(q).toNumber()).toBe(96);
    expect(
      drawingEdges(q.pieces[1])[0].start[1] -
        drawingEdges(q.pieces[0])[0].start[1],
    ).toBeCloseTo(250);
    expect(p.pieces[0].annotation).toEqual([0, 0]);
    expect(restoreProject(q).pieces[0].rotation).toBe(90);
    expect(physicalEdges(q.pieces[0])[0].end[0]).toBeCloseTo(0);
    expect(physicalEdges(q.pieces[0])[0].end[1]).toBeCloseTo(96);
  });
  it("preserves exact arc area and edge indexing across rotation and translation", () => {
    const p = makeProject(),
      boundary = [
        { start: [0, 0] as [number, number], end: [10, 0] as [number, number] },
        {
          start: [10, 0] as [number, number],
          end: [0, 0] as [number, number],
          center: [5, 0] as [number, number],
          radius: 5,
          sweep: Math.PI,
        },
      ];
    p.pieces = [
      {
        ...makePiece("Polygon"),
        points: sampleBoundary(boundary),
        boundary,
        scale: "2",
        scaleConfirmed: true,
        polishedEdges: [1],
        polishedEdgeCount: 2,
      },
    ];
    const q = transformPieces(p, [p.pieces[0].id], [35, 20], 37);
    expect(pieceArea(q.pieces[0]).toNumber()).toBeCloseTo(
      pieceArea(p.pieces[0]).toNumber(),
      8,
    );
    expect(polishedLength(q).toNumber()).toBeCloseTo(10 * Math.PI, 8);
    expect(q.pieces[0].scaleConfirmed).toBe(true);
  });
  it("nudges by actual inches at a CAD scale", () => {
    const p = makeProject();
    p.pieces = [
      {
        ...makePiece("Polygon"),
        points: [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10],
        ],
        scale: "0.25",
        scaleConfirmed: true,
      },
    ];
    const q = nudgePieces(p, [p.pieces[0].id], [1, 2]);
    expect(q.pieces[0].points[0]).toEqual([4, 8]);
  });
  it("moves linked splashes with the source but detaches a splash moved alone", () => {
    const p = makeProject();
    p.pieces = [rect()];
    p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
    const both = transformPieces(
      p,
      p.pieces.map((p) => p.id),
      [40, 10],
    );
    expect(both.pieces[1].edgeSource).toBeDefined();
    expect(linearCut(both).toNumber()).toBeCloseTo(linearCut(p).toNumber());
    const detached = transformPieces(p, [p.pieces[1].id], [0, -50]);
    expect(detached.pieces[1].edgeSource).toBeUndefined();
    expect(category(detached.pieces[1])).toBe("backsplash");
    expect(pieceArea(detached.pieces[1]).toNumber()).toBe(384);
    const joined = transformPieces(detached, [p.pieces[1].id], [0, 50]);
    expect(linearCut(joined).toNumber()).toBeCloseTo(linearCut(p).toNumber());
  });
  it("snaps a group to nearby boundaries and leaves distant geometry alone", () => {
    const p = makeProject();
    p.pieces = [rect(), { ...rect(), annotation: [210, 0] }];
    expect(snappedDelta(p, [p.pieces[1].id], [-15, 0], 5)).toEqual([-18, 0]);
    expect(snappedDelta(p, [p.pieces[1].id], [50, 50], 5)).toEqual([50, 50]);
  });
});
