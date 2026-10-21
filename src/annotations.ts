import { type Project, type Piece, geometry } from "./engine";
import { type CadEdge } from "./cad-curves";
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
  if (!source) return;
  try {
    const edges = drawingEdges(source);
    return edges.length === p.edgeSource.edgeCount
      ? edges[p.edgeSource.edgeIndex]
      : undefined;
  } catch {
    return;
  }
}
