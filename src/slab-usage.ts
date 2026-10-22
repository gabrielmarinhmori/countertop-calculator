import { drawingScale } from "./transforms";
import polygonClipping from "polygon-clipping";
import Decimal from "decimal.js";
import { type Project, pieceArea, inches } from "./engine";
import { type DrawingSlab, slabBounds } from "./drawing-slabs";
import { visibleEdges } from "./cutting";
import { edgeAt } from "./cad-curves";
export function slabUsage(project: Project, slab: DrawingSlab) {
  const b = slabBounds(slab),
    ring: [number, number][] = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
      [b.x, b.y],
    ];
  let used: polygonClipping.MultiPolygon = [];
  let approximate = false,
    repeated = false;
  for (const p of project.pieces.filter(
    (p) => p.drawingId === slab.drawingId,
  )) {
    pieceArea(p);
    const edges = visibleEdges(project, p);
    const points = edges.flatMap((e) => {
      const steps = e.center
        ? Math.max(2, Math.ceil(Math.abs(e.sweep!) / (Math.PI / 1800)))
        : 1;
      return Array.from({ length: steps }, (_, i) => edgeAt(e, i / steps));
    });
    if (!points.length) continue;
    if (
      Math.max(...points.map((p) => p[0])) <= b.x ||
      Math.min(...points.map((p) => p[0])) >= b.x + b.width ||
      Math.max(...points.map((p) => p[1])) <= b.y ||
      Math.min(...points.map((p) => p[1])) >= b.y + b.height
    )
      continue;
    const clipped = polygonClipping.intersection(
      [ring],
      [[...points, points[0]]],
    );
    if (!clipped.length) continue;
    const source = p.edgeSource
      ? project.pieces.find((s) => s.id === p.edgeSource!.pieceId)!
      : p;
    if (
      Math.abs(drawingScale(source) - slab.scale) >
      Math.max(1e-9, slab.scale * 1e-8)
    )
      throw Error(
        "Piece and slab drawing scales differ. Use geometry with a matching confirmed scale.",
      );
    approximate ||= edges.some((e) => !!e.center);
    repeated ||= p.quantity > 1;
    used = used.length ? polygonClipping.union(used, clipped) : clipped;
  }
  let pixelArea = 0;
  for (const polygon of used)
    polygon.forEach((r, i) => {
      let a = 0;
      for (let j = 0; j < r.length - 1; j++)
        a += r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1];
      pixelArea += (i === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  const area = inches(slab.length).times(inches(slab.width));
  const usedArea = Decimal.min(
    area,
    Decimal.max(0, new Decimal(pixelArea).times(slab.scale ** 2)),
  );
  return {
    total: area,
    used: usedArea,
    remaining: area.minus(usedArea),
    usedPercent: usedArea.div(area).times(100),
    remainingPercent: area.minus(usedArea).div(area).times(100),
    approximate,
    repeated,
  };
}
