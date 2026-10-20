import Decimal from "decimal.js";
export type XY = [number, number];
export interface CadEdge {
  start: XY;
  end: XY;
  center?: XY;
  radius?: number;
  sweep?: number;
  color?: number;
}
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function reverseEdge(e: CadEdge): CadEdge {
  return {
    ...e,
    start: e.end,
    end: e.start,
    ...(e.center ? { sweep: -e.sweep! } : {}),
  };
}
export function edgeAt(e: CadEdge, t: number): XY {
  if (t === 0) return e.start;
  if (t === 1) return e.end;
  if (!e.center)
    return [
      e.start[0] + (e.end[0] - e.start[0]) * t,
      e.start[1] + (e.end[1] - e.start[1]) * t,
    ];
  const angle =
    Math.atan2(e.start[1] - e.center[1], e.start[0] - e.center[0]) +
    e.sweep! * t;
  return [
    e.center[0] + e.radius! * Math.cos(angle),
    e.center[1] + e.radius! * Math.sin(angle),
  ];
}
export function sampleBoundary(edges: CadEdge[]): XY[] {
  return edges.flatMap((e) => {
    const steps = e.center
      ? Math.max(2, Math.ceil(Math.abs(e.sweep!) / (Math.PI / 90)))
      : 1;
    return Array.from({ length: steps }, (_, i) => edgeAt(e, i / steps));
  });
}
/** Green's theorem: chord shoelace plus signed circular-segment areas. */
export function signedBoundaryArea(edges: CadEdge[]): Decimal {
  return edges.reduce((sum, e) => {
    const chord = new Decimal(e.start[0])
      .times(e.end[1])
      .minus(new Decimal(e.end[0]).times(e.start[1]))
      .div(2);
    const arc = e.center
      ? new Decimal(e.radius!)
          .pow(2)
          .times(new Decimal(e.sweep!).minus(new Decimal(e.sweep!).sin()))
          .div(2)
      : new Decimal(0);
    return sum.plus(chord).plus(arc);
  }, new Decimal(0));
}
export function validateBoundary(value: unknown): asserts value is CadEdge[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 2000)
    throw Error("Invalid CAD boundary.");
  const point = (p: unknown): p is XY =>
    Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  for (let i = 0; i < value.length; i++) {
    const e = value[i] as CadEdge,
      next = value[(i + 1) % value.length] as CadEdge;
    if (
      !e ||
      !next ||
      !point(e.start) ||
      !point(e.end) ||
      !point(next.start) ||
      distance(e.end, next.start) > 1e-6
    )
      throw Error("CAD boundary has a gap.");
    if (e.center) {
      if (
        !point(e.center) ||
        !Number.isFinite(e.radius) ||
        e.radius! <= 0 ||
        !Number.isFinite(e.sweep) ||
        Math.abs(e.sweep!) < 1e-12 ||
        Math.abs(e.sweep!) > 2 * Math.PI + 1e-10
      )
        throw Error("Invalid circular arc.");
      const tolerance = Math.max(1e-6, e.radius! * 1e-8);
      if (
        Math.abs(distance(e.start, e.center) - e.radius!) > tolerance ||
        Math.abs(distance(e.end, e.center) - e.radius!) > tolerance
      )
        throw Error("Arc endpoints do not match its radius.");
      const a =
        Math.atan2(e.start[1] - e.center[1], e.start[0] - e.center[0]) +
        e.sweep!;
      if (
        distance(
          [
            e.center[0] + e.radius! * Math.cos(a),
            e.center[1] + e.radius! * Math.sin(a),
          ],
          e.end,
        ) > tolerance
      )
        throw Error("Arc endpoints do not match its sweep.");
    } else if (e.radius !== undefined || e.sweep !== undefined)
      throw Error("Arc metadata is incomplete.");
  }
}
export function transformBoundary(
  edges: CadEdge[],
  map: (p: XY) => XY,
  factor: number,
  reflect = false,
): CadEdge[] {
  return edges.map((e) => ({
    ...e,
    start: map(e.start),
    end: map(e.end),
    ...(e.center
      ? {
          center: map(e.center),
          radius: e.radius! * factor,
          sweep: e.sweep! * (reflect ? -1 : 1),
        }
      : {}),
  }));
}
export function boundaryPath(edges: CadEdge[]): string {
  if (!edges.length) return "";
  return (
    `M${edges[0].start.join(" ")} ` +
    edges
      .map((e) =>
        e.center
          ? `A${e.radius} ${e.radius} 0 ${Math.abs(e.sweep!) > Math.PI ? 1 : 0} ${e.sweep! > 0 ? 1 : 0} ${e.end.join(" ")}`
          : `L${e.end.join(" ")}`,
      )
      .join(" ") +
    " Z"
  );
}
