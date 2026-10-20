import { it, expect } from "vitest";
import { closedLineContours, type CadLine } from "./dxf-lines";
const lines: CadLine[] = [
  { layer: "TOP", a: [0, 0], b: [96, 0] },
  { layer: "TOP", a: [96, 25.5], b: [96, 0] },
  { layer: "TOP", a: [0, 25.5], b: [96, 25.5] },
  { layer: "TOP", a: [0, 0], b: [0, 25.5] },
];
it("joins reversed and unordered QCAD-style segments", () => {
  const result = closedLineContours([lines[2], lines[0], lines[3], lines[1]]);
  expect(result.rejected).toBe(0);
  expect(result.contours[0].area).toBe("2448");
});
it("does not snap almost-touching endpoints", () => {
  const broken = structuredClone(lines);
  broken[0].a = [0.0000001, 0];
  const r = closedLineContours(broken);
  expect(r.contours).toHaveLength(0);
  expect(r.rejected).toBe(4);
});
it("rejects branching or duplicated segments", () => {
  expect(
    closedLineContours([...lines, { layer: "TOP", a: [0, 0], b: [20, 20] }])
      .contours,
  ).toHaveLength(0);
  expect(closedLineContours([...lines, lines[0]]).contours).toHaveLength(0);
});
it("does not join different layers", () => {
  const split = structuredClone(lines);
  split[0].layer = "OTHER";
  expect(closedLineContours(split).contours).toHaveLength(0);
});
it("rejects crossing loops", () => {
  const crossed: CadLine[] = [
    { layer: "x", a: [0, 0], b: [4, 4] },
    { layer: "x", a: [4, 4], b: [0, 4] },
    { layer: "x", a: [0, 4], b: [4, 0] },
    { layer: "x", a: [4, 0], b: [0, 0] },
  ];
  expect(closedLineContours(crossed).contours).toHaveLength(0);
});
