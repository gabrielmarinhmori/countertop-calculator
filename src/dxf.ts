import { closedLineContours, type CadLine } from "./dxf-lines";
import DxfParser from "dxf-parser";
import Decimal from "decimal.js";
import {
  type Point,
  type Drawing,
  type Piece,
  makePiece,
  polygonArea,
} from "./engine";
export const dxfUnits = {
  inches: "1",
  millimeters: new Decimal(1).div("25.4").toString(),
  centimeters: new Decimal(1).div("2.54").toString(),
  feet: "12",
  meters: new Decimal(1000).div("25.4").toString(),
};
export type DxfUnit = keyof typeof dxfUnits;
export interface DxfContour {
  name: string;
  layer: string;
  points: Point[];
  area: string;
}
export interface DxfReview {
  name: string;
  unit: DxfUnit | "";
  contours: DxfContour[];
  warnings: string[];
}
export function parseDxf(text: string, name: string): DxfReview {
  if (text.length > 10 * 1024 * 1024)
    throw Error("DXF must be smaller than 10 MB.");
  if (text.startsWith("AutoCAD Binary DXF"))
    throw Error("Export an ASCII DXF, not binary DXF.");
  // Audit entities before parsing: the parser does not retain unknown entity types.
  const rawCounts: Record<string, number> = {};
  let section = "",
    expectSection = false,
    current = "",
    legacyWidth = false;
  const pairs = text.split(/\r\n|\n|\r/);
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const code = pairs[i].trim(),
      value = pairs[i + 1].trim();
    if (code === "0" && value === "SECTION") {
      expectSection = true;
      continue;
    }
    if (expectSection && code === "2") {
      section = value;
      expectSection = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      current = value;
      if (!["VERTEX", "SEQEND"].includes(value))
        rawCounts[value] = (rawCounts[value] || 0) + 1;
    }
    if (
      ["POLYLINE", "VERTEX"].includes(current) &&
      ["40", "41"].includes(code) &&
      Number(value) !== 0
    )
      legacyWidth = true;
  }
  if (Object.values(rawCounts).reduce((a, b) => a + b, 0) > 10000)
    throw Error(
      "DXF exceeds 10,000 entities. Export only the countertop layers.",
    );
  const doc = new DxfParser().parseSync(text);
  if (!doc || !Array.isArray(doc.entities)) throw Error("Invalid DXF drawing.");
  if (doc.entities.length > 10000)
    throw Error(
      "DXF exceeds 10,000 entities. Export only the countertop layers.",
    );
  const review: DxfReview = {
    name,
    unit:
      (
        {
          1: "inches",
          2: "feet",
          4: "millimeters",
          5: "centimeters",
          6: "meters",
        } as Record<number, DxfUnit>
      )[Number(doc.header?.$INSUNITS)] || "",
    contours: [],
    warnings: [],
  };
  const skipped: Record<string, number> = {};
  const lines: CadLine[] = [];
  for (const entity of doc.entities) {
    const e = entity as unknown as {
      type: string;
      layer?: string;
      handle?: string;
      shape?: boolean;
      vertices?: {
        x: number;
        y: number;
        z?: number;
        bulge?: number;
        startWidth?: number;
        endWidth?: number;
      }[];
      is3dPolyline?: boolean;
      is3dPolygonMesh?: boolean;
      isPolyfaceMesh?: boolean;
      includesCurveFitVertices?: boolean;
      includesSplineFitVertices?: boolean;
      elevation?: number;
      depth?: number;
      thickness?: number;
      width?: number;
      extrusionDirectionX?: number;
      extrusionDirectionY?: number;
      extrusionDirectionZ?: number;
      extrusionDirection?: { x: number; y: number; z: number };
      inPaperSpace?: boolean;
    };
    if (e.type === "LINE") {
      const vertices = e.vertices || [];
      const direction = e.extrusionDirection;
      if (
        vertices.length !== 2 ||
        e.inPaperSpace ||
        vertices.some(
          (v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z,
        ) ||
        (direction && (direction.x || direction.y || direction.z !== 1))
      ) {
        skipped["unsupported LINE geometry"] =
          (skipped["unsupported LINE geometry"] || 0) + 1;
        continue;
      }
      lines.push({
        layer: e.layer || "0",
        a: [vertices[0].x, vertices[0].y],
        b: [vertices[1].x, vertices[1].y],
      });
      continue;
    }
    let reason = "";
    if (!["LWPOLYLINE", "POLYLINE"].includes(e.type)) reason = e.type;
    else if (e.type === "POLYLINE" && legacyWidth)
      reason = "legacy polylines with width settings requiring review";
    else if (!e.shape) reason = "open polylines";
    else if (e.inPaperSpace) reason = "paper-space geometry";
    else if (
      e.is3dPolyline ||
      e.is3dPolygonMesh ||
      e.isPolyfaceMesh ||
      e.includesCurveFitVertices ||
      e.includesSplineFitVertices ||
      e.elevation ||
      e.depth ||
      e.thickness ||
      e.width ||
      e.vertices?.some((v) => v.z || v.bulge || v.startWidth || v.endWidth) ||
      e.extrusionDirectionX ||
      e.extrusionDirectionY ||
      (e.extrusionDirectionZ !== undefined && e.extrusionDirectionZ !== 1) ||
      (e.extrusionDirection &&
        (e.extrusionDirection.x ||
          e.extrusionDirection.y ||
          e.extrusionDirection.z !== 1))
    )
      reason = "curved, thick, transformed, or 3D polylines";
    if (reason) {
      skipped[reason] = (skipped[reason] || 0) + 1;
      continue;
    }
    let points = (e.vertices || []).map((v) => [v.x, v.y] as Point);
    if (points.length > 1000) {
      skipped["polylines over 1,000 vertices"] =
        (skipped["polylines over 1,000 vertices"] || 0) + 1;
      continue;
    }
    if (
      points.length > 1 &&
      points[0][0] === points.at(-1)![0] &&
      points[0][1] === points.at(-1)![1]
    )
      points = points.slice(0, -1);
    try {
      const area = polygonArea(points);
      review.contours.push({
        name: `${e.layer || "Layer 0"} · ${e.handle || review.contours.length + 1}`,
        layer: e.layer || "0",
        points,
        area: area.toString(),
      });
    } catch {
      skipped["invalid / intersecting boundaries"] =
        (skipped["invalid / intersecting boundaries"] || 0) + 1;
    }
  }
  for (const [type, count] of Object.entries(rawCounts)) {
    const parsedCount = doc.entities.filter((e) => e.type === type).length;
    if (count > parsedCount)
      skipped[`unsupported ${type}`] =
        (skipped[`unsupported ${type}`] || 0) + count - parsedCount;
  }
  const joined = closedLineContours(lines);
  review.contours.push(...joined.contours);
  if (joined.rejected)
    skipped[
      "LINE segments with open, branching, duplicate, or invalid boundaries"
    ] = joined.rejected;
  review.warnings = Object.entries(skipped).map(
    ([type, count]) => `${count} ${type} skipped.`,
  );
  if (!review.contours.length)
    throw Error(
      `No supported closed straight-edged 2D boundaries found. ${review.warnings.join(" ")} Export countertop outlines as closed LWPOLYLINE, 2D POLYLINE, or unambiguous closed LINE loops in model space.`,
    );
  return review;
}
export function dxfGeometry(
  review: DxfReview,
  unit: DxfUnit,
  indices: number[],
) {
  if (!(unit in dxfUnits)) throw Error("Choose the DXF drawing units.");
  const contours = review.contours.filter((_, i) => indices.includes(i));
  if (!contours.length)
    throw Error("Select at least one physical countertop boundary.");
  if (contours.reduce((sum, c) => sum + c.points.length, 0) > 50000)
    throw Error(
      "Import up to 50,000 vertices at a time. Select fewer contours.",
    );
  const all = contours.flatMap((c) => c.points),
    xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxY = Math.max(...ys),
    span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys));
  const factor = 1000 / span;
  if (!Number.isFinite(factor) || factor <= 0)
    throw Error("DXF extents are invalid.");
  return {
    contours,
    factor,
    scale: new Decimal(dxfUnits[unit]).div(factor).toString(),
    points: contours.map((c) =>
      c.points.map(
        ([x, y]) =>
          [(x - minX) * factor + 50, (maxY - y) * factor + 50] as Point,
      ),
    ),
    width: Math.ceil((Math.max(...xs) - minX) * factor + 100),
    height: Math.ceil((maxY - Math.min(...ys)) * factor + 100),
  };
}
export function importDxf(
  review: DxfReview,
  unit: DxfUnit,
  indices: number[],
): { drawing: Drawing; pieces: Piece[] } {
  const data = dxfGeometry(review, unit, indices);
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#809787";
  ctx.lineWidth = 2;
  data.points.forEach((points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  });
  const drawing: Drawing = {
    id: crypto.randomUUID(),
    name: `${review.name} · DXF (${unit}, verified)`,
    data: canvas.toDataURL("image/png"),
    width: data.width,
    height: data.height,
  };
  const pieces = data.contours.map((c, i) => ({
    ...makePiece("Polygon", drawing.id),
    name: c.name,
    points: data.points[i],
    scale: data.scale,
    scaleConfirmed: true,
  }));
  return { drawing, pieces };
}
