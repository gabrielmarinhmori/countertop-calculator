import { linearCut } from "./cutting";
import { sampleBoundary } from "./cad-curves";
import { describe, expect, it } from "vitest";
import { makePiece, makeProject, createEdgeBacksplash } from "./engine";
const rectangle = () => ({
  ...makePiece("Island"),
  length: "96",
  width: "25.5",
});
describe("gross linear cutting estimate", () => {
  it("sums each piece perimeter, including repeated shared edges", () => {
    const p = makeProject();
    p.pieces = [rectangle(), { ...rectangle(), annotation: [400, 80] }];
    expect(linearCut(p).toNumber()).toBe(486);
    expect(linearCut(p).div(12).toNumber()).toBe(40.5);
  });
  it("includes linked backsplash perimeters and quantities", () => {
    let p = makeProject();
    p.pieces = [rectangle()];
    p.pieces.push(createEdgeBacksplash(p, p.pieces[0].id, 0, "4"));
    p.pieces[1].quantity = 2;
    expect(linearCut(p).toNumber()).toBe(243 + 200 * 2 - 96);
  });
  it("uses analytical arc length at the confirmed scale", () => {
    const p = makeProject();
    p.pieces = [
      {
        ...makePiece("Polygon"),
        scale: "2",
        scaleConfirmed: true,
        points: [
          [0, 0],
          [10, 0],
          [0, 0],
        ],
        boundary: [
          { start: [0, 0], end: [10, 0] },
          {
            start: [10, 0],
            end: [0, 0],
            center: [5, 0],
            radius: 5,
            sweep: Math.PI,
          },
        ],
      },
    ];
    p.pieces[0].points = sampleBoundary(p.pieces[0].boundary!);
    expect(linearCut(p).toNumber()).toBeCloseTo(20 + 10 * Math.PI, 8);
  });
  it("does not display an estimate for invalid dimensions", () => {
    const p = makeProject();
    p.pieces = [rectangle()];
    p.pieces[0].width = "";
    expect(() => linearCut(p)).toThrow();
  });
});
