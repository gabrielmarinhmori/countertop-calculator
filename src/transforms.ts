import {
  type Project,
  type Piece,
  type Point,
  inches,
  category,
  refreshEdgeBacksplashes,
} from "./engine";
import { visibleEdges } from "./cutting";
import { transformBoundary, sampleBoundary } from "./cad-curves";
export function drawingScale(p: Piece): number {
  return p.shape === "Polygon" ? inches(p.scale).toNumber() : 0.5;
}
export function rotatePoint(p: Point, center: Point, degrees: number): Point {
  const a = ((degrees % 360) * Math.PI) / 180,
    x = p[0] - center[0],
    y = p[1] - center[1];
  return [
    center[0] + x * Math.cos(a) - y * Math.sin(a),
    center[1] + x * Math.sin(a) + y * Math.cos(a),
  ];
}
function detached(project: Project, p: Piece): Piece {
  if (!p.edgeSource) return p;
  const parent = project.pieces.find((s) => s.id === p.edgeSource!.pieceId)!;
  const boundary = visibleEdges(project, p);
  return {
    ...p,
    shape: "Polygon",
    surface: category(p),
    edgeSource: undefined,
    boundary,
    points: sampleBoundary(boundary),
    scale: String(drawingScale(parent)),
    scaleConfirmed: true,
    defaultUsed: false,
  };
}
export function transformPieces(
  project: Project,
  ids: string[],
  delta: Point = [0, 0],
  degrees = 0,
): Project {
  if (![...delta, degrees].every(Number.isFinite))
    throw Error("Enter a finite rotation in degrees.");
  if (!degrees && !delta[0] && !delta[1]) return project;
  const targets = project.pieces.filter((p) => ids.includes(p.id));
  if (!targets.length) return project;
  const points = targets.flatMap((p) =>
    sampleBoundary(visibleEdges(project, p)),
  );
  const center: Point = [
    (Math.min(...points.map((p) => p[0])) +
      Math.max(...points.map((p) => p[0]))) /
      2,
    (Math.min(...points.map((p) => p[1])) +
      Math.max(...points.map((p) => p[1]))) /
      2,
  ];
  const map = (q: Point): Point => {
    const r = rotatePoint(q, center, degrees);
    return [r[0] + delta[0], r[1] + delta[1]];
  };
  return refreshEdgeBacksplashes({
    ...project,
    pieces: project.pieces.map((original) => {
      if (
        !ids.includes(original.id) ||
        (original.edgeSource && ids.includes(original.edgeSource.pieceId))
      )
        return original;
      const p = detached(project, original);
      if (p.shape === "Polygon") {
        const boundary = p.boundary
          ? transformBoundary(p.boundary, map, 1)
          : undefined;
        return {
          ...p,
          points: boundary ? sampleBoundary(boundary) : p.points.map(map),
          ...(boundary ? { boundary } : {}),
          annotation: map(p.annotation),
        };
      }
      return {
        ...p,
        annotation: map(p.annotation),
        rotation: ((p.rotation || 0) + degrees) % 360,
      };
    }),
  });
}
export function nudgePieces(
  project: Project,
  ids: string[],
  deltaInches: Point,
): Project {
  // Apply a common physical displacement; drawings imported together share a scale.
  const scales = project.pieces
    .filter((p) => ids.includes(p.id))
    .map((p) =>
      drawingScale(
        p.edgeSource
          ? project.pieces.find((s) => s.id === p.edgeSource!.pieceId)!
          : p,
      ),
    );
  if (scales.some((s) => Math.abs(s - scales[0]) > 1e-10))
    throw Error("Move pieces with different drawing scales separately.");
  return transformPieces(project, ids, [
    deltaInches[0] / scales[0],
    deltaInches[1] / scales[0],
  ]);
}
/** Snap a moving endpoint to a nearby endpoint or straight segment; tolerance is in drawing coordinates. */
export function snappedDelta(
  project: Project,
  ids: string[],
  delta: Point,
  tolerance: number,
): Point {
  const moving = project.pieces.filter((p) => ids.includes(p.id));
  const fixed = project.pieces
    .filter(
      (p) =>
        !ids.includes(p.id) &&
        !ids.includes(p.edgeSource?.pieceId || "") &&
        p.drawingId === moving[0]?.drawingId,
    )
    .flatMap((p) => {
      try {
        return visibleEdges(project, p);
      } catch {
        return [];
      }
    });
  let best = tolerance,
    cornerBest = Infinity;
  let correction: Point = [0, 0],
    cornerCorrection: Point | null = null;
  for (const p of moving)
    for (const e of visibleEdges(project, p))
      for (const vertex of [e.start, e.end]) {
        const q: Point = [vertex[0] + delta[0], vertex[1] + delta[1]];
        for (const target of fixed) {
          for (const corner of [target.start, target.end]) {
            const dx = corner[0] - q[0],
              dy = corner[1] - q[1],
              d = Math.hypot(dx, dy);
            if (
              Math.abs(dx) <= tolerance &&
              Math.abs(dy) <= tolerance &&
              d < cornerBest
            ) {
              cornerBest = d;
              cornerCorrection = [dx, dy];
            }
          }
          const candidates = [target.start, target.end];
          if (!target.center) {
            const dx = target.end[0] - target.start[0],
              dy = target.end[1] - target.start[1],
              l = dx * dx + dy * dy;
            if (l) {
              const t = Math.max(
                0,
                Math.min(
                  1,
                  ((q[0] - target.start[0]) * dx +
                    (q[1] - target.start[1]) * dy) /
                    l,
                ),
              );
              candidates.push([
                target.start[0] + t * dx,
                target.start[1] + t * dy,
              ]);
            }
          }
          for (const c of candidates) {
            const distance = Math.hypot(c[0] - q[0], c[1] - q[1]);
            if (distance < best) {
              best = distance;
              correction = [c[0] - q[0], c[1] - q[1]];
            }
          }
        }
      }
  const snap = cornerCorrection || correction;
  return [delta[0] + snap[0], delta[1] + snap[1]];
}
