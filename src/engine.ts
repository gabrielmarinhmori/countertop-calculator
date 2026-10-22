import type { SlabSettings } from "./slab-planner";
import {
  type CadEdge,
  transformBoundary,
  validateBoundary,
  sampleBoundary,
  signedBoundaryArea,
} from "./cad-curves";
import Decimal from "decimal.js";
import polygonClipping from "polygon-clipping";
export type Point = [number, number];
export type Shape =
  | "Straight"
  | "L-shape"
  | "U-shape"
  | "Island"
  | "Peninsula"
  | "Polygon"
  | "Backsplash"
  | "Waterfall";
export interface Piece {
  id: string;
  name: string;
  shape: Shape;
  length: string;
  width: string;
  left: string;
  right: string;
  back: string;
  quantity: number;
  x: string;
  y: string;
  points: Point[];
  scale: string;
  scaleConfirmed: boolean;
  defaultUsed: boolean;
  defaultConfirmed: boolean;
  drawingId: string;
  annotation: Point;
  rotation?: number;
  surface?: "horizontal" | "backsplash" | "waterfall";
  boundary?: CadEdge[];
  polishedEdges?: number[];
  polishedEdgeCount?: number;
  edgeSource?: { pieceId: string; edgeIndex: number; edgeCount: number };
}
export interface Drawing {
  kind?: "dxf";
  id: string;
  name: string;
  data: string;
  width: number;
  height: number;
}
export interface Project {
  id: string;
  name: string;
  updated: string;
  pieces: Piece[];
  drawings: Drawing[];
  placement: "unresolved" | "separate" | "shared";
  placementConfirmed: boolean;
  approved?: { at: string; fingerprint: string };
  slabSettings?: SlabSettings;
}
export function inches(raw: string): Decimal {
  const s = raw
    .trim()
    .replace(/[″“”"’]\s*$/, "")
    .trim();
  let value: Decimal;
  const mixed = s.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = new Decimal(mixed[3]);
    const numerator = new Decimal(mixed[2]);
    if (
      denominator.isZero() ||
      numerator.gte(denominator) ||
      numerator.isZero()
    )
      throw Error("Use a proper, nonzero fraction.");
    value = new Decimal(mixed[1] || 0).plus(numerator.div(denominator));
  } else {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))
      throw Error("Enter positive inches, e.g. 25 1/2.");
    value = new Decimal(s);
  }
  if (!value.isFinite() || !value.gt(0))
    throw Error("Dimensions must be greater than zero.");
  return value;
}
export function dimension(raw: string): string {
  const n = inches(raw);
  const whole = n.floor();
  const f = n.minus(whole).times(16);
  if (f.isInteger()) {
    let a = f.toNumber(),
      b = 16;
    while (a && a % 2 === 0) {
      a /= 2;
      b /= 2;
    }
    return `${whole.isZero() && a ? "" : whole.toString()}${a ? `${whole.isZero() ? "" : " "}${a}/${b}` : ""}″`;
  }
  return `${n.toString()}″`;
}
export const sqft = (area: Decimal.Value) =>
  new Decimal(area).div(144).toFixed(2);
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function on(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-9 &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function polygonArea(points: Point[]): Decimal {
  if (
    points.length < 3 ||
    points.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))
  )
    throw Error("A polygon needs at least three finite points.");
  for (let i = 0; i < points.length; i++) {
    if (
      points[i][0] === points[(i + 1) % points.length][0] &&
      points[i][1] === points[(i + 1) % points.length][1]
    )
      throw Error("Duplicate polygon vertices.");
    const prev = points[(i + points.length - 1) % points.length],
      next = points[(i + 1) % points.length];
    if (
      Math.abs(cross(prev, points[i], next)) < 1e-9 &&
      on(prev, points[i], next)
    )
      throw Error("Polygon edges backtrack.");
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (
        intersects(
          points[i],
          points[(i + 1) % points.length],
          points[j],
          points[(j + 1) % points.length],
        )
      )
        throw Error("Polygon edges intersect.");
    }
  }
  let sum = new Decimal(0);
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    sum = sum.plus(
      new Decimal(p[0]).times(q[1]).minus(new Decimal(q[0]).times(p[1])),
    );
  });
  if (sum.isZero()) throw Error("Polygon has no area.");
  return sum.abs().div(2);
}
export function geometry(p: Piece): Point[] {
  if (p.shape === "Polygon") {
    if (!p.scaleConfirmed)
      throw Error("Confirm a measured drawing scale for this polygon.");
    const scale = inches(p.scale).toNumber();
    if (p.boundary) {
      validateBoundary(p.boundary);
      const expected = sampleBoundary(p.boundary);
      if (
        expected.length !== p.points.length ||
        expected.some(
          (point, i) =>
            Math.hypot(point[0] - p.points[i][0], point[1] - p.points[i][1]) >
            1e-6,
        )
      )
        throw Error(
          "CAD curve geometry was changed. Reimport the source drawing.",
        );
    }
    polygonArea(p.points);
    return p.points.map(([x, y]) => [x * scale, y * scale]);
  }
  const l = inches(p.length).toNumber(),
    w = inches(p.width).toNumber();
  if (p.shape === "L-shape") {
    const a = inches(p.left).toNumber(),
      b = inches(p.back).toNumber();
    if (a >= l || b >= w)
      throw Error("Leg depths must be smaller than the outside dimensions.");
    return [
      [0, 0],
      [l, 0],
      [l, b],
      [a, b],
      [a, w],
      [0, w],
    ];
  }
  if (p.shape === "U-shape") {
    const a = inches(p.left).toNumber(),
      b = inches(p.back).toNumber(),
      c = inches(p.right).toNumber();
    if (a + c >= l || b >= w)
      throw Error("U-shape opening must have positive width and depth.");
    return [
      [0, 0],
      [l, 0],
      [l, w],
      [l - c, w],
      [l - c, b],
      [a, b],
      [a, w],
      [0, w],
    ];
  }
  return [
    [0, 0],
    [l, 0],
    [l, w],
    [0, w],
  ];
}
export const category = (p: Piece) =>
  p.surface ??
  (p.shape === "Backsplash"
    ? "backsplash"
    : p.shape === "Waterfall"
      ? "waterfall"
      : "horizontal");
export function pieceArea(p: Piece) {
  if (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 1000)
    throw Error("Quantity must be an integer from 1 to 1000.");
  if (category(p) === "horizontal" && p.quantity !== 1)
    throw Error("Add horizontal surfaces as individual pieces.");
  const physical = geometry(p);
  return (
    p.boundary
      ? signedBoundaryArea(p.boundary).abs().times(inches(p.scale).pow(2))
      : polygonArea(physical)
  ).times(p.quantity);
}
export function totals(project: Project) {
  validateEdgeBacksplashes(project);
  let horizontal = new Decimal(0),
    backsplash = new Decimal(0),
    waterfall = new Decimal(0);
  const horizontalPieces = project.pieces.filter(
    (p) => category(p) === "horizontal",
  );
  for (const p of project.pieces) {
    const a = pieceArea(p);
    if (category(p) === "backsplash") backsplash = backsplash.plus(a);
    else if (category(p) === "waterfall") waterfall = waterfall.plus(a);
    else horizontal = horizontal.plus(a);
  }
  const curved = horizontalPieces.some((p) =>
    p.boundary?.some((e) => e.center),
  );
  if (project.placement === "shared" && curved && horizontalPieces.length > 1)
    throw Error(
      "Shared overlap union with curved countertops is not supported. Verify that surfaces do not overlap and select separate surfaces, or revise the CAD layout.",
    );
  if (project.placement === "shared" && horizontalPieces.length && !curved) {
    const polygons = horizontalPieces.map((p) => {
      if (!/^-?\d+(?:\.\d+)?$/.test(p.x) || !/^-?\d+(?:\.\d+)?$/.test(p.y))
        throw Error("Shared positions require signed decimal inches.");
      if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y)))
        throw Error("Physical origins must be finite.");
      const pts = orientedGeometry(p).map(
        ([x, y]) => [x + Number(p.x), y + Number(p.y)] as Point,
      );
      return [[...pts, pts[0]]];
    });
    const union = polygonClipping.union(polygons[0], ...polygons.slice(1));
    horizontal = new Decimal(0);
    for (const poly of union)
      poly.forEach((ring, i) => {
        const a = polygonArea(ring.slice(0, -1) as Point[]);
        horizontal = i === 0 ? horizontal.plus(a) : horizontal.minus(a);
      });
  }
  return {
    horizontal,
    backsplash,
    waterfall,
    combined: horizontal.plus(backsplash).plus(waterfall),
  };
}
export function fingerprint(p: Project) {
  return JSON.stringify({
    name: p.name,
    pieces: p.pieces,
    drawings: p.drawings,
    placement: p.placement,
    placementConfirmed: p.placementConfirmed,
  });
}
export function issues(p: Project): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push("Enter a project name.");
  if (!p.pieces.length) errors.push("Add at least one piece.");
  for (const piece of p.pieces) {
    try {
      pieceArea(piece);
    } catch (e) {
      errors.push(`${piece.name}: ${(e as Error).message}`);
    }
    if (piece.defaultUsed && !piece.defaultConfirmed)
      errors.push(`${piece.name}: confirm the assumed 25 1/2-inch depth.`);
    if (!piece.name.trim()) errors.push("Every piece needs a name.");
  }
  if (
    p.pieces.filter((x) => category(x) === "horizontal").length > 1 &&
    (p.placement === "unresolved" || !p.placementConfirmed)
  )
    errors.push(
      "Confirm separate physical surfaces or verified shared positions.",
    );
  try {
    totals(p);
  } catch (e) {
    if (!errors.some((s) => s.endsWith((e as Error).message)))
      errors.push((e as Error).message);
  }
  return errors;
}
export const isApproved = (p: Project) =>
  !!p.approved &&
  p.approved.fingerprint === fingerprint(p) &&
  issues(p).length === 0;
export function makePiece(shape: Shape, drawingId = ""): Piece {
  const ordinary = ["Straight", "L-shape", "U-shape", "Peninsula"].includes(
    shape,
  );
  return {
    id: crypto.randomUUID(),
    name: shape,
    shape,
    length: "",
    width: ordinary ? "25 1/2" : "",
    left: "25 1/2",
    right: "25 1/2",
    back: "25 1/2",
    quantity: 1,
    x: "0",
    y: "0",
    points: [],
    scale: "",
    scaleConfirmed: false,
    defaultUsed: ordinary,
    defaultConfirmed: false,
    drawingId,
    annotation: [80, 80],
  };
}
export function makeProject(name = "Untitled project"): Project {
  return {
    id: crypto.randomUUID(),
    name,
    updated: new Date().toISOString(),
    pieces: [],
    drawings: [],
    placement: "unresolved",
    placementConfirmed: false,
  };
}

/** Local physical outline with the piece's rigid rotation applied. */
export function orientedGeometry(p: Piece): Point[] {
  const points = geometry(p);
  if (p.shape === "Polygon" || !p.rotation) return points;
  const angle = ((p.rotation % 360) * Math.PI) / 180;
  return points.map(([x, y]) => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ]);
}

/** Physical edge lengths, independent of annotation zoom or position. */
export function physicalEdges(p: Piece): CadEdge[] {
  const pts = orientedGeometry(p);
  if (p.boundary) {
    const scale = inches(p.scale).toNumber();
    return transformBoundary(
      p.boundary,
      (q) => [q[0] * scale, q[1] * scale],
      scale,
    );
  }
  return pts.map((start, i) => ({ start, end: pts[(i + 1) % pts.length] }));
}
export function measuredEdgeLength(p: Piece, index: number): Decimal {
  const edges = physicalEdges(p);
  if (!Number.isInteger(index) || index < 0 || index >= edges.length)
    throw Error("Choose an existing measured edge.");
  const e = edges[index];
  return e.center
    ? new Decimal(e.radius!).times(Math.abs(e.sweep!))
    : new Decimal(e.end[0])
        .minus(e.start[0])
        .pow(2)
        .plus(new Decimal(e.end[1]).minus(e.start[1]).pow(2))
        .sqrt();
}
function sourceForPanel(project: Project, p: Piece): Piece {
  const link = p.edgeSource!;
  const source = project.pieces.find((s) => s.id === link.pieceId);
  if (
    p.shape !== "Backsplash" ||
    !["backsplash", "waterfall"].includes(category(p)) ||
    !source ||
    category(source) !== "horizontal" ||
    source.edgeSource
  )
    throw Error(
      `${p.name}: the source countertop is missing or invalid. Reselect its edge or delete this panel.`,
    );
  if (physicalEdges(source).length !== link.edgeCount)
    throw Error(
      `${p.name}: the source outline has changed. Delete and recreate this linked panel on the correct edge.`,
    );
  return source;
}
export function validateEdgeBacksplashes(project: Project) {
  for (const p of project.pieces.filter((p) => p.edgeSource)) {
    const source = sourceForPanel(project, p);
    const length = measuredEdgeLength(source, p.edgeSource!.edgeIndex);
    if (!inches(p.length).eq(length))
      throw Error(
        `${p.name}: linked edge measurements are out of date. Edit or reselect the source edge.`,
      );
  }
}
export function refreshEdgeBacksplashes(project: Project): Project {
  return {
    ...project,
    pieces: project.pieces.map((p) => {
      if (!p.edgeSource) return p;
      try {
        const source = sourceForPanel(project, p);
        return {
          ...p,
          length: measuredEdgeLength(source, p.edgeSource.edgeIndex).toString(),
          drawingId: source.drawingId,
        };
      } catch {
        return { ...p, length: "" };
      }
    }),
  };
}
export function createEdgeBacksplash(
  project: Project,
  pieceId: string,
  edgeIndex: number,
  height: string,
): Piece {
  inches(height);
  const source = project.pieces.find((p) => p.id === pieceId);
  if (!source || category(source) !== "horizontal")
    throw Error("Choose a measured countertop first.");
  if (
    project.pieces.some(
      (p) =>
        p.edgeSource?.pieceId === pieceId &&
        p.edgeSource.edgeIndex === edgeIndex,
    )
  )
    throw Error(
      "This edge already has a linked backsplash. Edit that panel instead.",
    );
  const edges = physicalEdges(source),
    length = measuredEdgeLength(source, edgeIndex).toString();
  return {
    ...makePiece("Backsplash", source.drawingId),
    name: `${source.name} backsplash ${edgeIndex + 1}`,
    length,
    width: height,
    edgeSource: { pieceId, edgeIndex, edgeCount: edges.length },
  };
}

export function changePieceSurface(
  project: Project,
  pieceId: string,
  surface: "horizontal" | "backsplash" | "waterfall",
): Project {
  if (!["horizontal", "backsplash", "waterfall"].includes(surface))
    throw Error("Choose a valid surface category.");
  if (!project.pieces.some((p) => p.id === pieceId))
    throw Error("Piece not found.");
  return refreshEdgeBacksplashes({
    ...project,
    approved: undefined,
    placement: "unresolved",
    placementConfirmed: false,
    pieces: project.pieces.map((p) =>
      p.id === pieceId
        ? {
            ...p,
            surface,
            ...(surface === "horizontal" && p.edgeSource
              ? { edgeSource: undefined }
              : {}),
          }
        : p,
    ),
  });
}

export const isDxfDrawing = (d: Drawing) =>
  d.kind === "dxf" || d.name.includes(" · DXF (");
