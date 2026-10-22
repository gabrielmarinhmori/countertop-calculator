import Decimal from "decimal.js";
import {
  type Project,
  type Piece,
  inches,
  pieceArea,
  physicalEdges,
  measuredEdgeLength,
  validateEdgeBacksplashes,
} from "./engine";
import { drawingEdges, linkedDrawingPanel } from "./annotations";
import {
  transformBoundary,
  signedBoundaryArea,
  type CadEdge,
} from "./cad-curves";

export function visibleEdges(project: Project, piece: Piece): CadEdge[] {
  return linkedDrawingPanel(project, piece)?.boundary || drawingEdges(piece);
}
export function placedEdges(project: Project, piece: Piece) {
  const parent = project.pieces.find((p) => p.id === piece.edgeSource?.pieceId);
  const source = parent || piece;
  const scale =
    source.shape === "Polygon" ? inches(source.scale).toNumber() : 0.5;
  return transformBoundary(
    visibleEdges(project, piece),
    (p) => [p[0] * scale, p[1] * scale],
    scale,
  );
}
type Interval = { start: number; end: number; quantity: number; side: number };
function coveredLength(intervals: Interval[]) {
  const events = intervals
    .flatMap((i) => [
      { at: i.start, quantity: i.quantity, side: i.side, add: true },
      { at: i.end, quantity: i.quantity, side: i.side, add: false },
    ])
    .sort((a, b) => a.at - b.at);
  const active = [0, 0];
  let previous = events[0]?.at || 0,
    total = 0;
  for (const event of events) {
    total += (event.at - previous) * Math.max(...active);
    active[event.side > 0 ? 1 : 0] += event.quantity * (event.add ? 1 : -1);
    previous = event.at;
  }
  return total;
}
/** Union coincident cutting segments in the same drawing, retaining repeated quantities. */
export function linearCut(project: Project): Decimal {
  validateEdgeBacksplashes(project);
  const groups: {
    scope: string;
    arc: boolean;
    a: number;
    b: number;
    c: number;
    intervals: Interval[];
  }[] = [];
  const tau = 2 * Math.PI;
  for (const piece of project.pieces) {
    pieceArea(piece);
    const edges = placedEdges(project, piece);
    const orientation = signedBoundaryArea(edges).isNegative() ? -1 : 1;
    for (const e of edges) {
      let a: number,
        b: number,
        c: number,
        ranges: [number, number][],
        side: number;

      if (e.center) {
        side = orientation * Math.sign(e.sweep!);
        [a, b] = e.center;
        c = e.radius!;
        const angle = Math.atan2(e.start[1] - b, e.start[0] - a);
        const start = (((angle + Math.min(0, e.sweep!)) % tau) + tau) % tau;
        const end = start + Math.abs(e.sweep!);
        ranges =
          end > tau
            ? [
                [start, tau],
                [0, end - tau],
              ]
            : [[start, end]];
      } else {
        const dx = e.end[0] - e.start[0],
          dy = e.end[1] - e.start[1],
          length = Math.hypot(dx, dy);
        if (!length) continue;
        const sign = dx < -1e-10 || (Math.abs(dx) < 1e-10 && dy < 0) ? -1 : 1;
        side = orientation * sign;
        a = (dx / length) * sign;
        b = (dy / length) * sign;
        c = -b * e.start[0] + a * e.start[1];
        const t1 = a * e.start[0] + b * e.start[1],
          t2 = a * e.end[0] + b * e.end[1];
        ranges = [[Math.min(t1, t2), Math.max(t1, t2)]];
      }
      const scope = piece.drawingId || "manual";
      let group = groups.find(
        (g) =>
          g.scope === scope &&
          g.arc === !!e.center &&
          Math.abs(g.a - a) < 1e-8 &&
          Math.abs(g.b - b) < 1e-8 &&
          Math.abs(g.c - c) < 1e-7,
      );
      if (!group) {
        group = { scope, arc: !!e.center, a, b, c, intervals: [] };
        groups.push(group);
      }
      group.intervals.push(
        ...ranges.map(([start, end]) => ({
          start,
          end,
          quantity: piece.quantity,
          side,
        })),
      );
    }
  }
  return groups.reduce(
    (sum, g) =>
      sum.plus(new Decimal(coveredLength(g.intervals)).times(g.arc ? g.c : 1)),
    new Decimal(0),
  );
}
export function polishedLength(project: Project): Decimal {
  return project.pieces.reduce((sum, piece) => {
    if (!piece.polishedEdges?.length) return sum;
    pieceArea(piece);
    const count = physicalEdges(piece).length;
    if (
      piece.polishedEdgeCount !== count ||
      piece.polishedEdges.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= count,
      )
    )
      throw Error(
        `${piece.name}: reselect polished edges after changing the outline.`,
      );
    return sum.plus(
      [...new Set(piece.polishedEdges)]
        .reduce((s, i) => s.plus(measuredEdgeLength(piece, i)), new Decimal(0))
        .times(piece.quantity),
    );
  }, new Decimal(0));
}
export function togglePolishedEdge(
  project: Project,
  id: string,
  index: number,
): Project {
  return {
    ...project,
    pieces: project.pieces.map((p) => {
      if (p.id !== id) return p;
      const count = physicalEdges(p).length;
      if (!Number.isInteger(index) || index < 0 || index >= count)
        throw Error("Choose an existing edge.");
      const current =
        p.polishedEdgeCount === count ? p.polishedEdges || [] : [];
      return {
        ...p,
        polishedEdgeCount: count,
        polishedEdges: current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index],
      };
    }),
  };
}
