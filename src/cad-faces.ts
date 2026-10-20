import {
  type CadEdge,
  type XY,
  edgeAt,
  reverseEdge,
  signedBoundaryArea,
  sampleBoundary,
} from "./cad-curves";
import { polygonArea } from "./engine";
export const CAD_TOLERANCE = 1e-7;
const tau = Math.PI * 2;
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const minus = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
function parameter(e: CadEdge, p: XY): number | null {
  if (!e.center) {
    const d = minus(e.end, e.start),
      len = distance(e.end, e.start),
      t =
        ((p[0] - e.start[0]) * d[0] + (p[1] - e.start[1]) * d[1]) / (len * len);
    return t >= -1e-9 &&
      t <= 1 + 1e-9 &&
      Math.abs(cross(d, minus(p, e.start))) / len <= CAD_TOLERANCE
      ? Math.max(0, Math.min(1, t))
      : null;
  }
  if (Math.abs(distance(p, e.center) - e.radius!) > CAD_TOLERANCE) return null;
  const a = Math.atan2(p[1] - e.center[1], p[0] - e.center[0]),
    s = Math.atan2(e.start[1] - e.center[1], e.start[0] - e.center[0]);
  let delta = (((a - s) % tau) + tau) % tau;
  if (e.sweep! < 0) delta = -((((s - a) % tau) + tau) % tau);
  if (distance(p, e.start) <= CAD_TOLERANCE) return 0;
  if (distance(p, e.end) <= CAD_TOLERANCE) return 1;
  const t = delta / e.sweep!;
  return t >= 0 && t <= 1 ? t : null;
}
function intersections(a: CadEdge, b: CadEdge): XY[] {
  if (!a.center && !b.center) {
    const r = minus(a.end, a.start),
      s = minus(b.end, b.start),
      den = cross(r, s);
    if (Math.abs(den) < 1e-12)
      return [a.start, a.end, b.start, b.end].filter(
        (p) => parameter(a, p) !== null && parameter(b, p) !== null,
      );
    const t = cross(minus(b.start, a.start), s) / den;
    const p = edgeAt(a, t);
    return parameter(a, p) !== null && parameter(b, p) !== null ? [p] : [];
  }
  if (!a.center && b.center) return intersections(b, a);
  if (a.center && !b.center) {
    const d = minus(b.end, b.start),
      f = minus(b.start, a.center),
      aa = d[0] ** 2 + d[1] ** 2,
      bb = 2 * (f[0] * d[0] + f[1] * d[1]),
      cc = f[0] ** 2 + f[1] ** 2 - a.radius! ** 2,
      disc = bb * bb - 4 * aa * cc;
    if (disc < -1e-8) return [];
    return [
      (-bb + Math.sqrt(Math.max(0, disc))) / (2 * aa),
      (-bb - Math.sqrt(Math.max(0, disc))) / (2 * aa),
    ]
      .map((t) => edgeAt(b, t))
      .filter((p) => parameter(a, p) !== null && parameter(b, p) !== null);
  }
  const d = distance(a.center!, b.center!);
  if (d < CAD_TOLERANCE)
    return [a.start, a.end, b.start, b.end].filter(
      (p) => parameter(a, p) !== null && parameter(b, p) !== null,
    );
  if (
    d > a.radius! + b.radius! + CAD_TOLERANCE ||
    d < Math.abs(a.radius! - b.radius!) - CAD_TOLERANCE
  )
    return [];
  const x = (a.radius! ** 2 - b.radius! ** 2 + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, a.radius! ** 2 - x * x)),
    u = minus(b.center!, a.center!),
    base: XY = [a.center![0] + (x * u[0]) / d, a.center![1] + (x * u[1]) / d];
  return [
    [base[0] - (h * u[1]) / d, base[1] + (h * u[0]) / d],
    [base[0] + (h * u[1]) / d, base[1] - (h * u[0]) / d],
  ].filter(
    (p) => parameter(a, p as XY) !== null && parameter(b, p as XY) !== null,
  ) as XY[];
}
export interface CadFace {
  boundary: CadEdge[];
  points: XY[];
  area: string;
  surface: "horizontal" | "backsplash";
}
export function cadFaces(input: CadEdge[]): {
  faces: CadFace[];
  open: number;
  duplicates: number;
  cleaned: number;
  unresolved: CadEdge[];
} {
  if (input.length > 2000)
    throw Error(
      "CAD face reconstruction supports up to 2,000 edges per layer. Export fewer layers.",
    );
  const splits = input.map(() => [0, 1]);
  for (let i = 0; i < input.length; i++)
    for (let j = i + 1; j < input.length; j++)
      for (const p of [
        ...intersections(input[i], input[j]),
        ...[input[i].start, input[i].end, input[j].start, input[j].end].filter(
          (p) =>
            parameter(input[i], p) !== null && parameter(input[j], p) !== null,
        ),
      ]) {
        const a = parameter(input[i], p),
          b = parameter(input[j], p);
        if (a !== null && b !== null) {
          splits[i].push(a);
          splits[j].push(b);
        }
      }
  const nodes: XY[] = [],
    edges: { a: number; b: number; edge: CadEdge; used: boolean }[] = [];
  const buckets = new Map<string, number[]>();
  let cleaned = 0,
    duplicates = 0;
  function node(p: XY) {
    const gx = Math.floor(p[0] / CAD_TOLERANCE),
      gy = Math.floor(p[1] / CAD_TOLERANCE);
    for (let x = gx - 1; x <= gx + 1; x++)
      for (let y = gy - 1; y <= gy + 1; y++)
        for (const id of buckets.get(`${x},${y}`) || []) {
          if (distance(nodes[id], p) <= CAD_TOLERANCE) {
            if (distance(nodes[id], p) > 1e-13) cleaned++;
            return id;
          }
        }
    const id = nodes.push(p) - 1,
      k = `${gx},${gy}`;
    buckets.set(k, [...(buckets.get(k) || []), id]);
    return id;
  }
  const unique = new Set<string>();
  input.forEach((e, i) => {
    const ts = [
      ...new Set(splits[i].map((t) => Math.max(0, Math.min(1, t)))),
    ].sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      if (ts[j] - ts[j - 1] < 1e-10) continue;
      const start = edgeAt(e, ts[j - 1]),
        end = edgeAt(e, ts[j]);
      if (distance(start, end) < CAD_TOLERANCE) continue;
      const a = node(start),
        b = node(end);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}:${e.center ? `${e.center[0].toFixed(7)},${e.center[1].toFixed(7)},${edgeAt(e, (ts[j] + ts[j - 1]) / 2).map((n) => n.toFixed(7))}` : "line"}`;
      if (unique.has(key)) {
        duplicates++;
        continue;
      }
      unique.add(key);
      edges.push({
        a,
        b,
        edge: {
          ...e,
          start: nodes[a],
          end: nodes[b],
          ...(e.center ? { sweep: e.sweep! * (ts[j] - ts[j - 1]) } : {}),
        },
        used: false,
      });
    }
  });
  if (edges.length > 10000)
    throw Error("Too many intersecting CAD edges. Simplify the drawing.");
  const half = edges.flatMap((e, i) => [
    { from: e.a, to: e.b, edge: e.edge, source: i, visited: false },
    {
      from: e.b,
      to: e.a,
      edge: reverseEdge(e.edge),
      source: i,
      visited: false,
    },
  ]);
  const outgoing = new Map<number, number[]>();
  const angle = (e: CadEdge) =>
    e.center
      ? Math.atan2(e.start[1] - e.center[1], e.start[0] - e.center[0]) +
        ((e.sweep! > 0 ? 1 : -1) * Math.PI) / 2
      : Math.atan2(e.end[1] - e.start[1], e.end[0] - e.start[0]);
  half.forEach((e, i) =>
    outgoing.set(e.from, [...(outgoing.get(e.from) || []), i]),
  );
  for (const ids of outgoing.values())
    ids.sort((a, b) => angle(half[a].edge) - angle(half[b].edge));
  const faces: CadFace[] = [];
  for (let seed = 0; seed < half.length; seed++) {
    if (half[seed].visited) continue;
    let current = seed;
    const walk: number[] = [];
    while (!half[current].visited) {
      half[current].visited = true;
      walk.push(current);
      const e = half[current],
        ids = outgoing.get(e.to)!;
      current = ids[(ids.indexOf(current ^ 1) + ids.length - 1) % ids.length];
    }
    if (current !== seed) continue;
    const boundaryWalk = walk.filter((i) => !walk.includes(i ^ 1));
    const boundary = boundaryWalk.map((i) => half[i].edge);
    const area = signedBoundaryArea(boundary);
    if (area.lte(1e-9)) continue;
    const points = sampleBoundary(boundary);
    try {
      polygonArea(points);
    } catch {
      continue;
    }
    boundaryWalk.forEach((i) => (edges[half[i].source].used = true));
    faces.push({
      boundary,
      points,
      area: area.toString(),
      surface: boundary.some((e) => e.color === 1 || e.color === 0xff0000)
        ? "backsplash"
        : "horizontal",
    });
  }
  // Open/dangling geometry is never closed by inventing an edge.
  return {
    faces,
    open: edges.filter((e) => !e.used).length,
    duplicates,
    cleaned,
    unresolved: edges.filter((e) => !e.used).map((e) => e.edge),
  };
}
