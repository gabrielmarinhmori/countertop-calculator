import type { DrawingSlab } from "./drawing-slabs";
import {
  type Project,
  type Piece,
  pieceArea,
  refreshEdgeBacksplashes,
} from "./engine";
import { contextScale, pieceDrawingScale } from "./drawing-scale";
import { detached } from "./transforms";
import { transformBoundary, sampleBoundary } from "./cad-curves";
export interface PieceClipboard {
  pieces: Piece[];
  slabs?: DrawingSlab[];
}
export function copyPieces(project: Project, ids: string[]): PieceClipboard {
  const included = new Set(ids);
  for (const p of project.pieces)
    if (p.edgeSource && included.has(p.edgeSource.pieceId)) included.add(p.id);
  const pieces = project.pieces
    .filter((p) => included.has(p.id))
    .map((p) => {
      pieceArea(p);
      const source =
        p.edgeSource && !included.has(p.edgeSource.pieceId)
          ? detached(project, p)
          : p;
      return structuredClone(source);
    });
  return { pieces };
}
export function pastePieces(
  project: Project,
  clipboard: PieceClipboard,
  drawingId: string,
  iteration = 1,
) {
  if (!clipboard.pieces.length && !clipboard.slabs?.length)
    return { project, ids: [] as string[], slabIds: [] as string[] };
  if (project.pieces.length + clipboard.pieces.length > 1000)
    throw Error("Use up to 1,000 pieces per project.");
  if (
    (project.drawingSlabs?.length || 0) + (clipboard.slabs?.length || 0) >
    100
  )
    throw Error("Use up to 100 drawing slabs per project.");
  const scale = contextScale(project, drawingId),
    ids = new Map(clipboard.pieces.map((p) => [p.id, crypto.randomUUID()]));
  const pieces: Piece[] = clipboard.pieces.map((p) => {
    const from = p.edgeSource
      ? clipboard.pieces.find((s) => s.id === p.edgeSource!.pieceId)!
      : p;
    const factor = pieceDrawingScale(from) / scale,
      offset = (10 * iteration) / scale;
    const map = ([x, y]: [number, number]): [number, number] => [
      x * factor + offset,
      y * factor + offset,
    ];
    const boundary = p.boundary
      ? transformBoundary(p.boundary, map, factor)
      : undefined;
    return {
      ...structuredClone(p),
      id: ids.get(p.id)!,
      name: `${p.name} copy`,
      drawingId,
      annotation: map(p.annotation),
      ...(p.shape === "Polygon"
        ? {
            scale: String(scale),
            points: boundary ? sampleBoundary(boundary) : p.points.map(map),
            ...(boundary ? { boundary } : {}),
            displayScale: undefined,
          }
        : { displayScale: scale }),
      ...(p.edgeSource
        ? {
            edgeSource: {
              ...p.edgeSource,
              pieceId: ids.get(p.edgeSource.pieceId)!,
            },
          }
        : {}),
    };
  });
  const slabs = (clipboard.slabs || []).map((s) => ({
    ...structuredClone(s),
    id: crypto.randomUUID(),
    name: `${s.name || "Slab"} copy`,
    drawingId,
    scale,
    x: (s.x * s.scale) / scale + (10 * iteration) / scale,
    y: (s.y * s.scale) / scale + (10 * iteration) / scale,
  }));
  return {
    project: refreshEdgeBacksplashes({
      ...project,
      pieces: [...project.pieces, ...pieces],
      ...(slabs.length
        ? { drawingSlabs: [...(project.drawingSlabs || []), ...slabs] }
        : {}),
    }),
    ids: pieces.map((p) => p.id),
    slabIds: slabs.map((s) => s.id),
  };
}
