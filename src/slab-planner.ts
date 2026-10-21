import Decimal from "decimal.js";
import {
  type Piece,
  type Project,
  inches,
  pieceArea,
  physicalEdges,
  category,
  totals,
  validateEdgeBacksplashes,
} from "./engine";
export interface SlabSettings {
  length: string;
  width: string;
  gap: string;
  margin: string;
  allowRotation: boolean;
  excludedIds: string[];
  rotationLockedIds: string[];
}
export const defaultSlabSettings = (): SlabSettings => ({
  length: "",
  width: "",
  gap: "",
  margin: "",
  allowRotation: true,
  excludedIds: [],
  rotationLockedIds: [],
});
export interface SlabPart {
  id: string;
  pieceId: string;
  name: string;
  category: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  area: number;
  canRotate: boolean;
}
export interface PlacedPart extends SlabPart {
  x: number;
  y: number;
  rotation: 0 | 90;
  placedWidth: number;
  placedHeight: number;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SlabLayout {
  slabs: { parts: PlacedPart[] }[];
  unplaced: SlabPart[];
  length: number;
  width: number;
  gap: number;
  margin: number;
  actualArea: number;
  reservedArea: number;
  areaLowerBound: number;
  complete: boolean;
}
const eps = 1e-8;
function allowance(raw: string) {
  if (!raw.trim() || /^0(?:\.0+)?\s*[″“”"’]?$/.test(raw.trim())) return 0;
  return inches(raw).toNumber();
}
/** True bounds include arc cardinal extrema, rather than display samples. */
export function partBounds(piece: Piece) {
  const edges = physicalEdges(piece),
    points = edges.flatMap((e) => [e.start, e.end]);
  for (const e of edges) {
    if (!e.center) continue;
    const start = Math.atan2(
      e.start[1] - e.center[1],
      e.start[0] - e.center[0],
    );
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const delta =
        e.sweep! > 0
          ? (((angle - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
          : (((start - angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (delta <= Math.abs(e.sweep!) + 1e-10)
        points.push([
          e.center[0] + e.radius! * Math.cos(angle),
          e.center[1] + e.radius! * Math.sin(angle),
        ]);
    }
  }
  const minX = Math.min(...points.map((p) => p[0])),
    minY = Math.min(...points.map((p) => p[1])),
    width = Math.max(...points.map((p) => p[0])) - minX,
    height = Math.max(...points.map((p) => p[1])) - minY;
  if (
    ![minX, minY, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("Piece bounds must have positive finite dimensions.");
  return { minX, minY, width, height };
}
function contains(a: Rect, b: Rect) {
  return (
    b.x >= a.x - eps &&
    b.y >= a.y - eps &&
    b.x + b.width <= a.x + a.width + eps &&
    b.y + b.height <= a.y + a.height + eps
  );
}
function subtract(free: Rect[], used: Rect): Rect[] {
  const next: Rect[] = [];
  for (const f of free) {
    if (
      used.x >= f.x + f.width - eps ||
      used.x + used.width <= f.x + eps ||
      used.y >= f.y + f.height - eps ||
      used.y + used.height <= f.y + eps
    ) {
      next.push(f);
      continue;
    }
    if (used.x > f.x + eps) next.push({ ...f, width: used.x - f.x });
    if (used.x + used.width < f.x + f.width - eps)
      next.push({
        ...f,
        x: used.x + used.width,
        width: f.x + f.width - used.x - used.width,
      });
    if (used.y > f.y + eps) next.push({ ...f, height: used.y - f.y });
    if (used.y + used.height < f.y + f.height - eps)
      next.push({
        ...f,
        y: used.y + used.height,
        height: f.y + f.height - used.y - used.height,
      });
  }
  return next.filter(
    (r, i) =>
      r.width > eps &&
      r.height > eps &&
      !next.some(
        (s, j) => i !== j && contains(s, r) && (!contains(r, s) || j < i),
      ),
  );
}
export function planSlabs(
  project: Project,
  settings: SlabSettings,
): SlabLayout {
  const length = inches(settings.length).toNumber(),
    width = inches(settings.width).toNumber(),
    gap = allowance(settings.gap),
    margin = allowance(settings.margin);
  if (![length, width, gap, margin].every(Number.isFinite))
    throw Error("Slab dimensions must be finite.");
  const usableW = length - 2 * margin,
    usableH = width - 2 * margin;
  if (usableW <= 0 || usableH <= 0)
    throw Error("Edge trim leaves no usable slab surface.");
  const selected = project.pieces.filter(
    (p) => !settings.excludedIds.includes(p.id),
  );
  if (!selected.length) throw Error("Select at least one material piece.");
  if (selected.reduce((sum, p) => sum + p.quantity, 0) > 200)
    throw Error(
      "This version supports up to 200 individual pieces per plan. Select fewer pieces or split the project.",
    );
  validateEdgeBacksplashes({
    ...project,
    pieces: project.pieces.filter(
      (p) => !p.edgeSource || !settings.excludedIds.includes(p.id),
    ),
  });
  const horizontal = selected.filter((p) => category(p) === "horizontal");
  if (project.placement === "shared" && horizontal.length > 1) {
    const gross = horizontal.reduce(
      (s, p) => s.plus(pieceArea(p)),
      new Decimal(0),
    );
    const union = totals({ ...project, pieces: horizontal }).horizontal;
    if (gross.minus(union).gt("0.000001"))
      throw Error(
        "Overlapping calculation shapes must be split into actual non-overlapping fabrication pieces before slab planning.",
      );
  }
  const parts = selected.flatMap((p) => {
    try {
      const area = pieceArea(p).div(p.quantity).toNumber(),
        bounds = partBounds(p);
      return Array.from({ length: p.quantity }, (_, i) => ({
        id: `${p.id}:${i}`,
        pieceId: p.id,
        name: p.quantity > 1 ? `${p.name} (${i + 1}/${p.quantity})` : p.name,
        category: category(p),
        ...bounds,
        area,
        canRotate:
          settings.allowRotation && !settings.rotationLockedIds.includes(p.id),
      }));
    } catch (e) {
      throw Error(`${p.name}: ${(e as Error).message}`);
    }
  });
  const unplaced = parts.filter(
      (p) =>
        !(p.width <= usableW + eps && p.height <= usableH + eps) &&
        !(p.canRotate && p.height <= usableW + eps && p.width <= usableH + eps),
    ),
    fit = parts.filter((p) => !unplaced.includes(p));
  function pack(order: SlabPart[]) {
    const slabs: { parts: PlacedPart[]; free: Rect[] }[] = [];
    for (const p of order) {
      let choice:
        | {
            slab: number;
            rect: Rect;
            rotation: 0 | 90;
            w: number;
            h: number;
            score: number[];
          }
        | undefined;
      const find = (index: number) => {
        for (const f of slabs[index].free)
          for (const rotation of (p.canRotate ? [0, 90] : [0]) as (0 | 90)[]) {
            const w = (rotation ? p.height : p.width) + gap,
              h = (rotation ? p.width : p.height) + gap;
            if (w > f.width + eps || h > f.height + eps) continue;
            const score = [
              Math.min(f.width - w, f.height - h),
              Math.max(f.width - w, f.height - h),
              index,
              f.y,
              f.x,
            ];
            if (
              !choice ||
              score.some(
                (n, k) =>
                  n < choice!.score[k] - eps &&
                  score
                    .slice(0, k)
                    .every((v, j) => Math.abs(v - choice!.score[j]) <= eps),
              )
            )
              choice = {
                slab: index,
                rect: { x: f.x, y: f.y, width: w, height: h },
                rotation,
                w: w - gap,
                h: h - gap,
                score,
              };
          }
      };
      for (let i = 0; i < slabs.length; i++) find(i);
      if (!choice) {
        slabs.push({
          parts: [],
          free: [
            {
              x: margin,
              y: margin,
              width: usableW + gap,
              height: usableH + gap,
            },
          ],
        });
        find(slabs.length - 1);
      }
      if (!choice)
        throw Error("A piece could not be placed. Review dimensions.");
      const c = choice as {
        slab: number;
        rect: Rect;
        rotation: 0 | 90;
        w: number;
        h: number;
      };
      slabs[c.slab].parts.push({
        ...p,
        x: c.rect.x,
        y: c.rect.y,
        rotation: c.rotation,
        placedWidth: c.w,
        placedHeight: c.h,
      });
      slabs[c.slab].free = subtract(slabs[c.slab].free, c.rect);
    }
    return slabs.map(({ parts }) => ({ parts }));
  }
  const orders = [
    (a: SlabPart, b: SlabPart) => b.width * b.height - a.width * a.height,
    (a: SlabPart, b: SlabPart) =>
      Math.max(b.width, b.height) - Math.max(a.width, a.height),
    (a: SlabPart, b: SlabPart) => b.height - a.height,
  ];
  let slabs: SlabLayout["slabs"] = [];
  let compact = Infinity;
  for (const sort of orders) {
    const candidate = pack(
      [...fit].sort((a, b) => sort(a, b) || a.id.localeCompare(b.id)),
    );
    const score = candidate.reduce(
      (s, slab) =>
        s +
        Math.max(0, ...slab.parts.map((p) => p.x + p.placedWidth)) *
          Math.max(0, ...slab.parts.map((p) => p.y + p.placedHeight)),
      0,
    );
    if (
      compact === Infinity ||
      candidate.length < slabs.length ||
      (candidate.length === slabs.length && score < compact)
    ) {
      slabs = candidate;
      compact = score;
    }
  }
  const actualArea = parts.reduce((s, p) => s + p.area, 0);
  return {
    slabs,
    unplaced,
    length,
    width,
    gap,
    margin,
    actualArea,
    reservedArea: parts.reduce((s, p) => s + p.width * p.height, 0),
    areaLowerBound: Math.ceil(actualArea / (usableW * usableH) - 1e-12),
    complete: unplaced.length === 0,
  };
}
