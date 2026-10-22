import polygonClipping from "polygon-clipping";
import Decimal from "decimal.js";
import { type Project, type Piece, pieceArea, category } from "./engine";
import { placedEdges } from "./cutting";
import { edgeAt } from "./cad-curves";
function polygonSetArea(polygons: polygonClipping.MultiPolygon): Decimal {
  let area = new Decimal(0);
  for (const p of polygons)
    p.forEach((ring, i) => {
      let twice = new Decimal(0);
      for (let j = 0; j < ring.length - 1; j++)
        twice = twice.plus(
          new Decimal(ring[j][0])
            .times(ring[j + 1][1])
            .minus(new Decimal(ring[j + 1][0]).times(ring[j][1])),
        );
      area = area.plus(
        twice
          .abs()
          .div(2)
          .times(i === 0 ? 1 : -1),
      );
    });
  return area;
}
/** Area of placed footprints; independent drawings are separate coordinate systems. */
export function placedArea(project: Project, pieces: Piece[]) {
  let area = new Decimal(0),
    approximate = false;
  const groups = new Map<string, typeof pieces>();
  for (const p of pieces)
    groups.set(p.drawingId, [...(groups.get(p.drawingId) || []), p]);
  for (const group of groups.values()) {
    const records = group.map((p) => {
      const exact = pieceArea(p).div(p.quantity),
        edges = placedEdges(project, p),
        curve = edges.some((e) => !!e.center);
      const points = edges.flatMap((e) => {
        const steps = e.center
          ? Math.max(2, Math.ceil(Math.abs(e.sweep!) / (Math.PI / 1800)))
          : 1;
        return Array.from({ length: steps }, (_, i) => edgeAt(e, i / steps));
      });
      const polygon: polygonClipping.Polygon = [[...points, points[0]]];
      return {
        p,
        exact,
        curve,
        polygon,
        xmin: Math.min(...points.map((p) => p[0])),
        xmax: Math.max(...points.map((p) => p[0])),
        ymin: Math.min(...points.map((p) => p[1])),
        ymax: Math.max(...points.map((p) => p[1])),
      };
    });
    if (records.length === 1) {
      area = area.plus(records[0].exact.times(records[0].p.quantity));
      continue;
    }
    let result = polygonSetArea(
      polygonClipping.union(
        records[0].polygon,
        ...records.slice(1).map((r) => r.polygon),
      ),
    );
    for (const r of records) {
      result = result.plus(r.exact.times(r.p.quantity - 1));
      if (!r.curve) continue;
      const overlapping = records.some(
        (other) =>
          other !== r &&
          other.xmin < r.xmax &&
          other.xmax > r.xmin &&
          other.ymin < r.ymax &&
          other.ymax > r.ymin &&
          polygonSetArea(
            polygonClipping.intersection(r.polygon, other.polygon),
          ).gt(1e-8),
      );
      if (overlapping) approximate = true;
      else result = result.plus(r.exact.minus(polygonSetArea([r.polygon])));
    }
    area = area.plus(result);
  }
  return { area, approximate };
}
export function automaticTotals(project: Project) {
  const horizontal = placedArea(
    project,
    project.pieces.filter((p) => category(p) === "horizontal"),
  );
  const backsplash = placedArea(
    project,
    project.pieces.filter((p) => category(p) === "backsplash"),
  );
  const waterfall = placedArea(
    project,
    project.pieces.filter((p) => category(p) === "waterfall"),
  );
  const combined = {
    area: horizontal.area.plus(backsplash.area).plus(waterfall.area),
    approximate:
      horizontal.approximate || backsplash.approximate || waterfall.approximate,
  };
  return {
    horizontal: horizontal.area,
    backsplash: backsplash.area,
    waterfall: waterfall.area,
    combined: combined.area,
    overlap: project.pieces
      .reduce((sum, p) => sum.plus(pieceArea(p)), new Decimal(0))
      .minus(combined.area),
    approximate: combined.approximate,
  };
}
