import { it, expect } from "vitest";
import {
  makeProject,
  makePiece,
  createEdgeBacksplash,
  refreshEdgeBacksplashes,
  validateEdgeBacksplashes,
  totals,
  issues,
  physicalEdges,
  measuredEdgeLength,
  sqft,
  fingerprint,
  isApproved,
} from "./engine";
import { sampleBoundary, type CadEdge } from "./cad-curves";
import { restoreProject } from "./restore";
import { linkedDrawingEdge } from "./annotations";
const projectWithCounter = () => {
  const p = makeProject();
  p.pieces = [{ ...makePiece("Island"), length: "96", width: "25 1/2" }];
  return p;
};
it("creates a separate 4-inch backsplash from a 96-inch edge", () => {
  const p = projectWithCounter();
  const panel = createEdgeBacksplash(p, p.pieces[0].id, 0, "4");
  p.pieces.push(panel);
  expect(panel.length).toBe("96");
  expect(panel.width).toBe("4");
  expect(sqft(totals(p).horizontal)).toBe("17.00");
  expect(sqft(totals(p).backsplash)).toBe("2.67");
});
it("supports fractional heights without a hidden default", () => {
  const p = projectWithCounter();
  expect(createEdgeBacksplash(p, p.pieces[0].id, 0, "5 1/2").width).toBe(
    "5 1/2",
  );
  for (const height of ["", "0", "-1"])
    expect(() => createEdgeBacksplash(p, p.pieces[0].id, 0, height)).toThrow();
});
it("uses arc length for a vertical panel along a curved edge", () => {
  const p = makeProject();
  const boundary: CadEdge[] = [
    {
      start: [-10, 0],
      end: [10, 0],
      center: [0, 0],
      radius: 10,
      sweep: Math.PI,
    },
    { start: [10, 0], end: [-10, 0] },
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
  expect(measuredEdgeLength(p.pieces[0], 0).toNumber()).toBeCloseTo(
    20 * Math.PI,
  );
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  expect(totals(p).backsplash.toNumber()).toBeCloseTo(80 * Math.PI);
  expect(linkedDrawingEdge(p, p.pieces[1])?.radius).toBe(10);
});
it("tracks parent dimension edits and blocks stale measurements", () => {
  let p = projectWithCounter();
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  p.pieces[0].length = "120";
  expect(() => validateEdgeBacksplashes(p)).toThrow(/out of date/);
  p = refreshEdgeBacksplashes(p);
  expect(p.pieces[1].length).toBe("120");
  expect(sqft(totals(p).backsplash)).toBe("3.33");
});
it("invalidates approval when a parent edge changes", () => {
  let p = projectWithCounter();
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  p.approved = { at: new Date().toISOString(), fingerprint: fingerprint(p) };
  expect(isApproved(p)).toBe(true);
  p.pieces[0].length = "120";
  p = refreshEdgeBacksplashes(p);
  expect(isApproved(p)).toBe(false);
});
it("blocks missing parents and changed edge topology instead of guessing", () => {
  let p = projectWithCounter();
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  p.pieces.splice(0, 1);
  p = refreshEdgeBacksplashes(p);
  expect(p.pieces[0].length).toBe("");
  expect(issues(p).join()).toMatch(/missing/);
  const q = projectWithCounter();
  q.pieces.push(createEdgeBacksplash(q, q.pieces[0].id, 0, "4"));
  q.pieces[0] = {
    ...q.pieces[0],
    shape: "L-shape",
    width: "60",
    left: "20",
    back: "20",
  };
  expect(() => validateEdgeBacksplashes(q)).toThrow(/outline has changed/);
});
it("prevents duplicate panels on the same source edge", () => {
  const p = projectWithCounter();
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  expect(() => createEdgeBacksplash(p, p.pieces[0].id, 0, "5")).toThrow(
    /already/,
  );
});
it("does not create panels from splashes or unverified polygon pixels", () => {
  const p = makeProject();
  p.pieces = [{ ...makePiece("Backsplash"), length: "96", width: "4" }];
  expect(() => createEdgeBacksplash(p, p.pieces[0].id, 0, "4")).toThrow();
  p.pieces = [
    {
      ...makePiece("Polygon"),
      points: [
        [0, 0],
        [96, 0],
        [96, 25],
        [0, 25],
      ],
      scale: "1",
    },
  ];
  expect(() => physicalEdges(p.pieces[0])).toThrow();
});
it("remaps source IDs through backup restore", () => {
  const p = projectWithCounter();
  p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
  const r = restoreProject(JSON.parse(JSON.stringify(p)));
  expect(r.pieces[1].edgeSource?.pieceId).toBe(r.pieces[0].id);
  expect(r.pieces[1].edgeSource?.pieceId).not.toBe(p.pieces[0].id);
  expect(sqft(totals(r).backsplash)).toBe("2.67");
});
