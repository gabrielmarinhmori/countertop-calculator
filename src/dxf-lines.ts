import { type Point, polygonArea } from "./engine";
import type { DxfContour } from "./dxf";
export interface CadLine {
  layer: string;
  a: Point;
  b: Point;
}
/** Join only identical endpoints on the same layer. Never snap a gap or guess a junction. */
export function closedLineContours(lines: CadLine[]): {
  contours: DxfContour[];
  rejected: number;
} {
  const nodes = new Map<string, number[]>();
  const key = (layer: string, p: Point) => JSON.stringify([layer, ...p]);
  lines.forEach((line, i) => {
    for (const p of [line.a, line.b]) {
      const k = key(line.layer, p);
      nodes.set(k, [...(nodes.get(k) || []), i]);
    }
  });
  const seen = new Set<number>(),
    contours: DxfContour[] = [];
  let rejected = 0;
  for (let seed = 0; seed < lines.length; seed++) {
    if (seen.has(seed)) continue;
    const component: number[] = [];
    const queue = [seed];
    seen.add(seed);
    while (queue.length) {
      const i = queue.pop()!;
      component.push(i);
      for (const point of [lines[i].a, lines[i].b])
        for (const adjacent of nodes.get(key(lines[i].layer, point))!) {
          if (!seen.has(adjacent)) {
            seen.add(adjacent);
            queue.push(adjacent);
          }
        }
    }
    if (
      component.length < 3 ||
      component.length > 1000 ||
      component.some((i) =>
        [lines[i].a, lines[i].b].some(
          (p) => nodes.get(key(lines[i].layer, p))!.length !== 2,
        ),
      )
    ) {
      rejected += component.length;
      continue;
    }
    const start = lines[seed],
      points: Point[] = [start.a];
    let current = start.b,
      previous = seed;
    const visited = new Set([seed]);
    let invalid = false;
    while (key(start.layer, current) !== key(start.layer, start.a)) {
      points.push(current);
      const next = nodes
        .get(key(start.layer, current))!
        .find((i) => i !== previous);
      if (next === undefined || visited.has(next)) {
        invalid = true;
        break;
      }
      visited.add(next);
      const edge = lines[next];
      current =
        key(start.layer, edge.a) === key(start.layer, current)
          ? edge.b
          : edge.a;
      previous = next;
    }
    try {
      if (invalid || visited.size !== component.length)
        throw Error("Unclosed boundary.");
      const area = polygonArea(points);
      contours.push({
        name: `${start.layer} · joined lines ${contours.length + 1}`,
        layer: start.layer,
        points,
        area: area.toString(),
      });
    } catch {
      rejected += component.length;
    }
  }
  return { contours, rejected };
}
