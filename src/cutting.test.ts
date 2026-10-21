import { describe, it, expect } from "vitest";
import { makePiece, makeProject, createEdgeBacksplash } from "./engine";
import { linearCut, polishedLength, togglePolishedEdge } from "./cutting";
import { restoreProject } from "./restore";
import { sampleBoundary } from "./cad-curves";
const rect = (
  length = "96",
  width = "25.5",
  annotation: [number, number] = [0, 0],
) => ({ ...makePiece("Island"), length, width, annotation });
describe("shared cutting edges", () => {
  it("does not treat overlapping identical schematics as adjacent stock", () => {
    const p = makeProject();
    p.pieces = [rect(), rect()];
    expect(linearCut(p).toNumber()).toBe(486);
  });

  it("counts a counter alone, separate splash, and attached splash", () => {
    const p = makeProject();
    p.pieces = [rect()];
    expect(linearCut(p).toNumber()).toBe(243);
    p.pieces.push(rect("96", "4", [0, 100]));
    expect(linearCut(p).toNumber()).toBe(443);
    p.pieces[1].annotation = [0, -8];
    expect(linearCut(p).toNumber()).toBe(347);
  });
  it("merges partial vertical overlaps and keeps gaps", () => {
    const p = makeProject();
    p.pieces = [rect("20", "30"), rect("4", "10", [40, 20])];
    expect(linearCut(p).toNumber()).toBe(118);
    p.pieces[1].annotation = [40.1, 20];
    expect(linearCut(p).toNumber()).toBe(128);
  });
  it("does not merge drawings with unrelated coordinate systems", () => {
    const p = makeProject();
    p.pieces = [
      { ...rect(), drawingId: "a" },
      { ...rect(), drawingId: "b" },
    ];
    expect(linearCut(p).toNumber()).toBe(486);
  });
  it("merges the shared edge of a generated backsplash", () => {
    const p = makeProject();
    p.pieces = [rect()];
    p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
    expect(linearCut(p).toNumber()).toBe(347);
  });
});
describe("polished edge length", () => {
  it("toggles edges across pieces and includes quantity", () => {
    let p = makeProject();
    p.pieces = [
      rect(),
      { ...makePiece("Backsplash"), length: "96", width: "4", quantity: 2 },
    ];
    p = togglePolishedEdge(p, p.pieces[0].id, 0);
    p = togglePolishedEdge(p, p.pieces[1].id, 0);
    expect(polishedLength(p).toNumber()).toBe(288);
    p = togglePolishedEdge(p, p.pieces[0].id, 0);
    expect(polishedLength(p).toNumber()).toBe(192);
    const restored = restoreProject(p);
    expect(polishedLength(restored).toNumber()).toBe(192);
  });
  it("uses true arc length rather than chord", () => {
    let p = makeProject();
    const boundary = [
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
        boundary,
        points: sampleBoundary(boundary),
        scale: "2",
        scaleConfirmed: true,
      },
    ];
    p = togglePolishedEdge(p, p.pieces[0].id, 1);
    expect(polishedLength(p).toNumber()).toBeCloseTo(10 * Math.PI);
  });
  it("rejects stale edge indices after topology changes", () => {
    let p = makeProject();
    p.pieces = [rect()];
    p = togglePolishedEdge(p, p.pieces[0].id, 0);
    p.pieces[0].polishedEdgeCount = 5;
    expect(() => polishedLength(p)).toThrow(/reselect/);
  });
});
