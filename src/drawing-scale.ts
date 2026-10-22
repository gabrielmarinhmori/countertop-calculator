import { type Project, type Piece, inches } from "./engine";
export function pieceDrawingScale(p: Piece): number {
  const s =
    p.shape === "Polygon"
      ? inches(p.scale).toNumber()
      : (p.displayScale ?? 0.5);
  if (!Number.isFinite(s) || s <= 0) throw Error("Invalid drawing scale.");
  return s;
}
export function contextScale(project: Project, drawingId: string): number {
  const known = project.drawings.find((d) => d.id === drawingId)?.scale;
  if (known !== undefined && Number.isFinite(known) && known > 0) return known;
  for (const p of project.pieces.filter(
    (p) =>
      p.drawingId === drawingId && p.shape === "Polygon" && p.scaleConfirmed,
  )) {
    try {
      return pieceDrawingScale(p);
    } catch {
      /* unmeasured draft */
    }
  }
  const slab = project.drawingSlabs?.find(
    (s) => s.drawingId === drawingId && Number.isFinite(s.scale) && s.scale > 0,
  );
  if (slab) return slab.scale;
  return (
    project.pieces.find(
      (p) =>
        p.drawingId === drawingId &&
        p.shape !== "Polygon" &&
        p.displayScale &&
        Number.isFinite(p.displayScale) &&
        p.displayScale > 0,
    )?.displayScale ?? 0.5
  );
}
/** Upgrade old mixed-scale schematics and keep every measured reference in one canvas scale. */
export function normalizeDrawingScales(project: Project): Project {
  const scopes = new Set([
    ...project.drawings.map((d) => d.id),
    ...project.pieces.map((p) => p.drawingId),
    ...(project.drawingSlabs || []).map((s) => s.drawingId),
  ]);
  const scales = new Map(
    [...scopes].map((id) => [id, contextScale(project, id)]),
  );
  let changed = false;
  const drawings = project.drawings.map((d) => {
    if (d.scale !== undefined) return d;
    const measured =
      project.pieces.some(
        (p) =>
          p.drawingId === d.id && p.shape === "Polygon" && p.scaleConfirmed,
      ) || project.drawingSlabs?.some((s) => s.drawingId === d.id);
    if (!measured) return d;
    changed = true;
    return { ...d, scale: scales.get(d.id)! };
  });
  const pieces = project.pieces.map((p) => {
    if (p.shape === "Polygon") return p;
    const scale = scales.get(p.drawingId)!;
    if (p.displayScale === scale) return p;
    changed = true;
    return { ...p, displayScale: scale };
  });
  const drawingSlabs = project.drawingSlabs?.map((s) => {
    const scale = scales.get(s.drawingId)!;
    if (Math.abs(s.scale - scale) <= scale * 1e-12) return s;
    changed = true;
    return { ...s, scale };
  });
  return changed
    ? {
        ...project,
        drawings,
        pieces,
        ...(drawingSlabs ? { drawingSlabs } : {}),
      }
    : project;
}
