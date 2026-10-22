import { type Project, type Point, inches } from "./engine";
export interface DrawingSlab {
  id: string;
  drawingId: string;
  length: string;
  width: string;
  x: number;
  y: number;
  scale: number;
}
export function slabBounds(s: DrawingSlab) {
  if (
    !Number.isFinite(s.scale) ||
    s.scale <= 0 ||
    ![s.x, s.y].every(Number.isFinite)
  )
    throw Error("Invalid slab placement.");
  const width = inches(s.length).toNumber() / s.scale,
    height = inches(s.width).toNumber() / s.scale;
  if (![width, height].every((v) => Number.isFinite(v) && v > 0))
    throw Error("Slab dimensions exceed the drawing range.");
  return { x: s.x, y: s.y, width, height };
}
export function addDrawingSlab(
  p: Project,
  drawingId: string,
  length: string,
  width: string,
): Project {
  inches(length);
  inches(width);
  const existing = (p.drawingSlabs || []).filter(
    (s) => s.drawingId === drawingId,
  );
  if ((p.drawingSlabs || []).length >= 100)
    throw Error("Use up to 100 drawing slabs per project.");
  const source = p.pieces.find(
    (s) =>
      s.drawingId === drawingId && s.scaleConfirmed && s.shape === "Polygon",
  );
  if (
    !source &&
    p.pieces.some((s) => s.drawingId === drawingId && s.shape === "Polygon")
  )
    throw Error("Confirm the drawing scale before adding a slab.");
  const scale = source ? inches(source.scale).toNumber() : 0.5;
  const x = existing.length
    ? Math.max(
        ...existing.map((s) => {
          const b = slabBounds(s);
          return b.x + b.width;
        }),
      ) + 40
    : 40;
  const slab: DrawingSlab = {
    id: crypto.randomUUID(),
    drawingId,
    length,
    width,
    scale,
    x,
    y: 40,
  };
  slabBounds(slab);
  return { ...p, drawingSlabs: [...(p.drawingSlabs || []), slab] };
}
export function moveDrawingSlab(p: Project, id: string, delta: Point): Project {
  return {
    ...p,
    drawingSlabs: (p.drawingSlabs || []).map((s) =>
      s.id === id ? { ...s, x: s.x + delta[0], y: s.y + delta[1] } : s,
    ),
  };
}
