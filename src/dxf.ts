import type { DrawingSlab } from "./drawing-slabs";
import { cadFaces, CAD_TOLERANCE, markPolishedBoundary } from "./cad-faces";
import {
  type CadEdge,
  sampleBoundary,
  transformBoundary,
  signedBoundaryArea,
  boundaryPath,
} from "./cad-curves";
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
  boundary?: CadEdge[];
  surface?: "horizontal" | "backsplash" | "waterfall" | "slab";
}
export interface DxfReview {
  name: string;
  unit: DxfUnit | "";
  contours: DxfContour[];
  warnings: string[];
  context?: CadEdge[];
  unresolved?: CadEdge[];
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
  const layerEdges = new Map<string, CadEdge[]>();
  const addEdges = (layer: string, edges: CadEdge[]) =>
    layerEdges.set(layer, [...(layerEdges.get(layer) || []), ...edges]);
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
      colorIndex?: number;
      color?: number;
      center?: { x: number; y: number; z?: number };
      radius?: number;
      startAngle?: number;
      endAngle?: number;
    };
    const layerColor = doc.tables?.layer?.layers[e.layer || "0"];
    const resolvedRgb = e.color ?? layerColor?.color;
    const rgb = resolvedRgb;
    const gray =
      typeof rgb === "number" &&
      ((rgb >> 16) & 255) === ((rgb >> 8) & 255) &&
      ((rgb >> 8) & 255) === (rgb & 255) &&
      (rgb & 255) > 0 &&
      (rgb & 255) < 255;
    const color = gray
      ? 8
      : resolvedRgb === 0xff0000
        ? 1
        : resolvedRgb === 0xffff00
          ? 2
          : resolvedRgb === 0x00ff00
            ? 3
            : resolvedRgb === 0xffffff
              ? 7
              : e.colorIndex && e.colorIndex !== 256
                ? e.colorIndex
                : layerColor?.colorIndex || 7;
    if (e.type === "ARC") {
      const c = e.center;
      if (
        !c ||
        c.z ||
        e.inPaperSpace ||
        !Number.isFinite(e.radius) ||
        e.radius! <= 0 ||
        !Number.isFinite(e.startAngle) ||
        !Number.isFinite(e.endAngle) ||
        (e.extrusionDirection &&
          (e.extrusionDirection.x ||
            e.extrusionDirection.y ||
            e.extrusionDirection.z !== 1))
      ) {
        skipped["unsupported ARC geometry"] =
          (skipped["unsupported ARC geometry"] || 0) + 1;
        continue;
      }
      const sweep =
        (((e.endAngle! - e.startAngle!) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2);
      if (sweep < 1e-12) {
        skipped["zero-sweep ARC"] = (skipped["zero-sweep ARC"] || 0) + 1;
        continue;
      }
      const at = (a: number): Point => [
        c.x + e.radius! * Math.cos(a),
        c.y + e.radius! * Math.sin(a),
      ];
      addEdges(e.layer || "0", [
        {
          start: at(e.startAngle!),
          end: at(e.endAngle!),
          center: [c.x, c.y],
          radius: e.radius,
          sweep,
          color,
        },
      ]);
      continue;
    }
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
      addEdges(e.layer || "0", [
        {
          start: [vertices[0].x, vertices[0].y],
          end: [vertices[1].x, vertices[1].y],
          color,
        },
      ]);
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
      e.vertices?.some((v) => v.z || v.startWidth || v.endWidth) ||
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
      const boundary: CadEdge[] = points.map((start, i) => {
        const end = points[(i + 1) % points.length],
          bulge = e.vertices?.[i]?.bulge;
        if (!bulge) return { start, end, color };
        const dx = end[0] - start[0],
          dy = end[1] - start[1],
          chord = Math.hypot(dx, dy),
          offset = (1 - bulge * bulge) / (4 * bulge);
        return {
          start,
          end,
          center: [
            (start[0] + end[0]) / 2 - dy * offset,
            (start[1] + end[1]) / 2 + dx * offset,
          ],
          radius: (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge)),
          sweep: 4 * Math.atan(bulge),
          color,
        };
      });
      polygonArea(sampleBoundary(boundary));
      addEdges(e.layer || "0", boundary);
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
  review.context = [...layerEdges.values()].flat();
  review.unresolved = [];
  const isGray = (e: CadEdge) =>
    e.color === 8 ||
    e.color === 9 ||
    (e.color !== undefined && e.color >= 250 && e.color <= 254);
  for (const [layer, allEdges] of layerEdges)
    for (const slab of [false, true]) {
      const edges = allEdges.filter((e) => isGray(e) === slab);
      if (!edges.length) continue;
      const result = cadFaces(edges);
      review.unresolved.push(...result.unresolved);
      for (const face of result.faces) {
        if (slab && !slabRectangle(face.points, face.boundary)) {
          review.warnings.push(
            "Gray slab outlines must be closed axis-aligned rectangles; a non-rectangular gray region was skipped.",
          );
          continue;
        }
        review.contours.push({
          name: `${layer} · ${slab ? "Slab" : face.surface === "backsplash" ? "Splash" : "Counter"} ${review.contours.length + 1}`,
          layer,
          points: face.points,
          area: face.area,
          boundary: face.boundary,
          surface: slab ? "slab" : face.surface,
        });
      }
      if (result.open)
        skipped["LINE/ARC edges not bounding a valid closed face"] =
          (skipped["LINE/ARC edges not bounding a valid closed face"] || 0) +
          result.open;
      if (result.duplicates)
        review.warnings.push(
          `${result.duplicates} duplicate/overlapping edge fragments merged.`,
        );
      if (result.cleaned)
        review.warnings.push(
          `Numerical endpoint cleanup used tolerance ${CAD_TOLERANCE} DXF units; larger gaps remain open.`,
        );
    }
  const green = review.context.filter(
    (e) => e.color === 3 || e.color === 0x00ff00,
  );
  if (green.length)
    for (const contour of review.contours) {
      contour.boundary = markPolishedBoundary(contour.boundary!, green);
      contour.points = sampleBoundary(contour.boundary);
    }
  review.warnings.push(
    ...Object.entries(skipped).map(
      ([type, count]) => `${count} ${type} skipped.`,
    ),
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
  const all = [
    ...review.contours.flatMap((c) => c.points),
    ...(review.context || []).flatMap((e) => [...sampleBoundary([e]), e.end]),
  ];
  if (all.length > 50000)
    throw Error(
      "Drawing preview exceeds 50,000 vertices. Export fewer contours.",
    );
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxY = Math.max(...ys),
    span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys));
  const factor = 1000 / span;
  if (!Number.isFinite(factor) || factor <= 0)
    throw Error("DXF extents are invalid.");
  return {
    contours,
    minX,
    maxY,
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
): { drawing: Drawing; pieces: Piece[]; slabs: DrawingSlab[] } {
  const data = dxfGeometry(review, unit, indices);
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#809787";
  ctx.lineWidth = 2;
  data.points.forEach((points, index) => {
    ctx.strokeStyle =
      data.contours[index].surface === "backsplash" ? "#b84646" : "#326e55";
    if (data.contours[index].boundary) {
      const mapped = transformBoundary(
        data.contours[index].boundary!,
        (p) => [
          (p[0] - data.minX) * data.factor + 50,
          (data.maxY - p[1]) * data.factor + 50,
        ],
        data.factor,
        true,
      );
      ctx.stroke(new Path2D(boundaryPath(mapped)));
      return;
    }
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  });
  const drawing: Drawing = {
    kind: "dxf",
    scale: Number(data.scale),
    id: crypto.randomUUID(),
    name: `${review.name} · DXF (${unit}, verified; surface categories reviewed)`,
    data: canvas.toDataURL("image/png"),
    width: data.width,
    height: data.height,
  };
  const pieces: Piece[] = data.contours.flatMap((c, i) =>
    c.surface === "slab"
      ? []
      : [
          {
            ...makePiece("Polygon", drawing.id),
            name: c.name,
            points: data.points[i],
            scale: data.scale,
            scaleConfirmed: true,
            surface: c.surface || "horizontal",
            ...(c.boundary?.some(
              (e) => e.polished || e.color === 3 || e.color === 0x00ff00,
            )
              ? {
                  polishedEdges: c.boundary.flatMap((e, index) =>
                    e.polished || e.color === 3 || e.color === 0x00ff00
                      ? [index]
                      : [],
                  ),
                  polishedEdgeCount: c.boundary.length,
                }
              : {}),
            ...(c.boundary?.some(
              (e) =>
                e.center || e.polished || e.color === 3 || e.color === 0x00ff00,
            )
              ? {
                  boundary: transformBoundary(
                    c.boundary,
                    (p) => [
                      (p[0] - data.minX) * data.factor + 50,
                      (data.maxY - p[1]) * data.factor + 50,
                    ],
                    data.factor,
                    true,
                  ),
                }
              : {}),
          },
        ],
  );
  const slabs: DrawingSlab[] = data.contours.flatMap((c, i) => {
    if (c.surface !== "slab") return [];
    if (!slabRectangle(c.points, c.boundary))
      throw Error("Slab contours must be closed axis-aligned rectangles.");
    const pts = data.points[i],
      xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]),
      scale = Number(data.scale);
    return [
      {
        id: crypto.randomUUID(),
        name: c.name,
        locked: false,
        drawingId: drawing.id,
        x: Math.min(...xs),
        y: Math.min(...ys),
        scale,
        length: String((Math.max(...xs) - Math.min(...xs)) * scale),
        width: String((Math.max(...ys) - Math.min(...ys)) * scale),
      },
    ];
  });
  return { drawing, pieces, slabs };
}
function slabRectangle(points: Point[], boundary?: CadEdge[]): boolean {
  if (boundary?.some((e) => e.center) || points.length < 4) return false;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const expected = (xmax - xmin) * (ymax - ymin);
  return (
    expected > 0 &&
    Math.abs(polygonArea(points).toNumber() - expected) <
      Math.max(1e-7, expected * 1e-9) &&
    points.every(
      (p) =>
        ((Math.abs(p[0] - xmin) < 1e-7 || Math.abs(p[0] - xmax) < 1e-7) &&
          p[1] >= ymin - 1e-7 &&
          p[1] <= ymax + 1e-7) ||
        ((Math.abs(p[1] - ymin) < 1e-7 || Math.abs(p[1] - ymax) < 1e-7) &&
          p[0] >= xmin - 1e-7 &&
          p[0] <= xmax + 1e-7),
    )
  );
}
