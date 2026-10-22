import { describe, it, expect } from "vitest";
import {
  type CadEdge,
  signedBoundaryArea,
  sampleBoundary,
  reverseEdge,
  validateBoundary,
} from "./cad-curves";
import { cadFaces } from "./cad-faces";
import {
  makePiece,
  makeProject,
  pieceArea,
  totals,
  issues,
  sqft,
} from "./engine";
import { restoreProject } from "./restore";
const semicircle: CadEdge[] = [
  { start: [-10, 0], end: [10, 0], center: [0, 0], radius: 10, sweep: Math.PI },
  { start: [10, 0], end: [-10, 0] },
];
const curvedPiece = () => ({
  ...makePiece("Polygon"),
  boundary: structuredClone(semicircle),
  points: sampleBoundary(semicircle),
  scale: "1",
  scaleConfirmed: true,
});
const rectangle = (x = 0, y = 0, w = 96, h = 25, color = 7): CadEdge[] => [
  { start: [x, y], end: [x + w, y], color },
  { start: [x + w, y], end: [x + w, y + h], color },
  { start: [x + w, y + h], end: [x, y + h], color },
  { start: [x, y + h], end: [x, y], color },
];
describe("analytical curved areas", () => {
  it("uses circular sector area instead of sampled chord area", () => {
    validateBoundary(semicircle);
    expect(signedBoundaryArea(semicircle).toNumber()).toBeCloseTo(
      Math.PI * 50,
      10,
    );
    expect(pieceArea(curvedPiece()).toNumber()).toBeCloseTo(Math.PI * 50, 10);
    expect(pieceArea({ ...curvedPiece(), scale: "2" }).toNumber()).toBeCloseTo(
      Math.PI * 200,
      10,
    );
  });
  it("handles clockwise orientation", () => {
    const reverse = semicircle.map(reverseEdge).reverse();
    expect(signedBoundaryArea(reverse).toNumber()).toBeCloseTo(
      -50 * Math.PI,
      10,
    );
  });
  it("rejects inconsistent arc metadata and discontinuous boundaries", () => {
    const bad = structuredClone(semicircle);
    bad[0].radius = 20;
    expect(() => validateBoundary(bad)).toThrow();
    const gap = structuredClone(semicircle);
    gap[1].start = [11, 0];
    expect(() => validateBoundary(gap)).toThrow();
  });
  it("blocks editing display samples without preserving curves", () => {
    const p = curvedPiece();
    p.points[0] = [0, 0];
    expect(() => pieceArea(p)).toThrow(/changed/);
  });
  it("keeps curved splash out of the countertop total", () => {
    const p = makeProject();
    p.pieces = [
      curvedPiece(),
      { ...curvedPiece(), surface: "backsplash", quantity: 2 },
    ];
    p.placement = "separate";
    p.placementConfirmed = true;
    const t = totals(p);
    expect(t.horizontal.toNumber()).toBeCloseTo(50 * Math.PI);
    expect(t.backsplash.toNumber()).toBeCloseTo(100 * Math.PI);
  });
  it("unions curved overlaps with an explicit estimate and preserves isolated analytical area", () => {
    const p = makeProject();
    p.placement = "shared";
    p.placementConfirmed = true;
    p.pieces = [curvedPiece()];
    expect(totals(p).horizontal.toNumber()).toBeCloseTo(50 * Math.PI);
    p.pieces.push({
      ...makePiece("Island"),
      length: "5",
      width: "5",
      annotation: [-10, -10],
    });
    expect(totals(p).horizontal.toNumber()).toBeCloseTo(50 * Math.PI, 2);
    expect(totals(p).approximate).toBe(true);
  });
  it("preserves curve metadata and surface category through unapproved backup restore", () => {
    const p = makeProject();
    p.pieces = [{ ...curvedPiece(), surface: "backsplash" }];
    const r = restoreProject(JSON.parse(JSON.stringify(p)));
    expect(r.pieces[0].surface).toBe("backsplash");
    expect(r.pieces[0].boundary).toEqual(p.pieces[0].boundary);
    expect(r.pieces[0].scaleConfirmed).toBe(false);
    expect(sqft(pieceArea({ ...r.pieces[0], scaleConfirmed: true }))).toBe(
      "1.09",
    );
  });
});
describe("CAD planar regions", () => {
  it("finds a surface with a subdivided edge", () => {
    const edges = rectangle();
    edges.splice(
      0,
      1,
      { start: [0, 0], end: [40, 0], color: 7 },
      { start: [40, 0], end: [96, 0], color: 7 },
    );
    const r = cadFaces(edges);
    expect(r.faces).toHaveLength(1);
    expect(Number(r.faces[0].area)).toBe(2400);
  });
  it("shares a white counter border with a red splash", () => {
    const r = cadFaces([
      ...rectangle(),
      { start: [0, 25], end: [0, 29], color: 1 },
      { start: [0, 29], end: [96, 29], color: 1 },
      { start: [96, 29], end: [96, 25], color: 1 },
    ]);
    expect(r.faces).toHaveLength(2);
    expect(r.faces.find((f) => f.surface === "backsplash")?.area).toBe("384");
    expect(r.faces.find((f) => f.surface === "horizontal")?.area).toBe("2400");
  });
  it("partitions a counter at an actual dividing seam", () => {
    const r = cadFaces([
      ...rectangle(),
      { start: [48, 0], end: [48, 25], color: 7 },
    ]);
    expect(r.faces).toHaveLength(2);
    expect(r.faces.map((f) => Number(f.area)).reduce((a, b) => a + b)).toBe(
      2400,
    );
  });
  it("merges overlapping duplicate segments without losing the face", () => {
    const edges = rectangle();
    edges.push({ start: [0, 0], end: [40, 0], color: 7 });
    const r = cadFaces(edges);
    expect(r.faces).toHaveLength(1);
    expect(r.duplicates).toBeGreaterThan(0);
    expect(Number(r.faces[0].area)).toBe(2400);
  });
  it("cleans numerical dust but does not bridge actual gaps", () => {
    const edges = rectangle();
    edges[0].start = [1e-10, 0];
    expect(cadFaces(edges).faces).toHaveLength(1);
    edges[0].start = [0.001, 0];
    expect(cadFaces(edges).faces).toHaveLength(0);
  });
  it("finds a semicircle from an arc and a chord", () => {
    const r = cadFaces(semicircle);
    expect(r.faces).toHaveLength(1);
    expect(Number(r.faces[0].area)).toBeCloseTo(Math.PI * 50, 10);
  });
  it("does not let a dangling construction line remove a valid face", () => {
    const r = cadFaces([
      ...rectangle(),
      { start: [0, 0], end: [10, 10], color: 7 },
    ]);
    expect(r.faces).toHaveLength(1);
    expect(Number(r.faces[0].area)).toBe(2400);
    expect(r.open).toBe(1);
  });
});
