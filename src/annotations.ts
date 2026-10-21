import { type Project, type Piece, geometry, category, inches } from "./engine";
import { type CadEdge, signedBoundaryArea, edgeAt } from "./cad-curves";
/** Annotation coordinates only; never used as physical measurement data. */
export function drawingEdges(p: Piece): CadEdge[] {
  if (p.boundary) {
    geometry(p);
    return p.boundary;
  }
  const points =
    p.shape === "Polygon"
      ? p.points
      : geometry(p).map(
          ([x, y]) =>
            [x * 2 + p.annotation[0], y * 2 + p.annotation[1]] as [
              number,
              number,
            ],
        );
  if (p.shape === "Polygon") geometry(p);
  return points.map((start, i) => ({
    start,
    end: points[(i + 1) % points.length],
  }));
}
export function linkedDrawingEdge(
  project: Project,
  p: Piece,
): CadEdge | undefined {
  if (!p.edgeSource) return;
  const source = project.pieces.find((s) => s.id === p.edgeSource!.pieceId);
  if (!source || category(source) !== "horizontal") return;
  try {
    const edges = drawingEdges(source);
    return edges.length === p.edgeSource.edgeCount
      ? edges[p.edgeSource.edgeIndex]
      : undefined;
  } catch {
    return;
  }
}

/** Visual elevation strip; physical quantities are always calculated by the engine. */
export function linkedDrawingPanel(
  project: Project,
  p: Piece,
):
  | {
      boundary: CadEdge[];
      kind: "attached" | "developed";
      connector?: [import("./engine").Point, import("./engine").Point];
    }
  | undefined {
  const edge = linkedDrawingEdge(project, p);
  const source = project.pieces.find((s) => s.id === p.edgeSource?.pieceId);
  if (!edge || !source) return;
  try {
    const height =
      inches(p.width).toNumber() *
      (source.shape === "Polygon" ? 1 / inches(source.scale).toNumber() : 2);
    const orientation = signedBoundaryArea(drawingEdges(source)).isNegative()
      ? -1
      : 1;
    let start = edge.start,
      end = edge.end,
      connector:
        [import("./engine").Point, import("./engine").Point] | undefined;
    let dx = end[0] - start[0],
      dy = end[1] - start[1],
      length = Math.hypot(dx, dy);
    if (edge.center) {
      const mid = edgeAt(edge, 0.5),
        angle =
          Math.atan2(mid[1] - edge.center[1], mid[0] - edge.center[0]) +
          ((edge.sweep! > 0 ? 1 : -1) * Math.PI) / 2;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      length = edge.radius! * Math.abs(edge.sweep!);
      const gap = 4;
      const base: [number, number] = [
        mid[0] + orientation * dy * gap,
        mid[1] - orientation * dx * gap,
      ];
      start = [base[0] - (dx * length) / 2, base[1] - (dy * length) / 2];
      end = [base[0] + (dx * length) / 2, base[1] + (dy * length) / 2];
      connector = [mid, base];
    } else {
      dx /= length;
      dy /= length;
    }
    const nx = orientation * dy * height,
      ny = -orientation * dx * height;
    const points: import("./engine").Point[] = [
      start,
      end,
      [end[0] + nx, end[1] + ny],
      [start[0] + nx, start[1] + ny],
    ];
    return {
      boundary: points.map((start, i) => ({
        start,
        end: points[(i + 1) % points.length],
      })),
      kind: edge.center ? "developed" : "attached",
      connector,
    };
  } catch {
    return;
  }
}
export function annotationFrame(
  project: Project,
  drawingId: string,
  width: number,
  height: number,
) {
  const points = project.pieces
    .filter((p) => p.drawingId === drawingId && p.edgeSource)
    .flatMap(
      (p) =>
        linkedDrawingPanel(project, p)?.boundary.flatMap((e) => [
          e.start,
          e.end,
        ]) || [],
    );
  const minX = Math.min(0, ...points.map((p) => p[0] - 48)),
    minY = Math.min(0, ...points.map((p) => p[1] - 48)),
    maxX = Math.max(width, ...points.map((p) => p[0] + 48)),
    maxY = Math.max(height, ...points.map((p) => p[1] + 48));
  return {
    x: minX,
    y: minY,
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

export function panelLabelPoint(
  panel: NonNullable<ReturnType<typeof linkedDrawingPanel>>,
  gap = 22,
): import("./engine").Point {
  const points = panel.boundary.map((e) => e.start),
    near = [
      (points[0][0] + points[1][0]) / 2,
      (points[0][1] + points[1][1]) / 2,
    ],
    far = [
      (points[2][0] + points[3][0]) / 2,
      (points[2][1] + points[3][1]) / 2,
    ],
    dx = far[0] - near[0],
    dy = far[1] - near[1],
    length = Math.hypot(dx, dy);
  return [far[0] + (dx / length) * gap, far[1] + (dy / length) * gap];
}
