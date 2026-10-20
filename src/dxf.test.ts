import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { parseDxf, dxfGeometry, dxfUnits } from "./dxf";
import { polygonArea, sqft } from "./engine";
export function fixture({
  unit = 1,
  closed = 1,
  width = 96,
  height = 25.5,
  extra = "",
  bulge = 0,
  extrusion = 1,
}: {
  unit?: number;
  closed?: number;
  width?: number;
  height?: number;
  extra?: string;
  bulge?: number;
  extrusion?: number;
} = {}) {
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${unit}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n5\nA1\n8\nCOUNTERTOP\n90\n4\n70\n${closed}\n210\n0\n220\n0\n230\n${extrusion}\n10\n0\n20\n0\n42\n${bulge}\n10\n${width}\n20\n0\n10\n${width}\n20\n${height}\n10\n0\n20\n${height}\n${extra}0\nENDSEC\n0\nEOF\n`;
}
describe("DXF measured geometry", () => {
  it("reads model units, layer and area without image inference", () => {
    const r = parseDxf(fixture(), "kitchen.dxf");
    expect(r.unit).toBe("inches");
    expect(r.contours[0].layer).toBe("COUNTERTOP");
    expect(sqft(r.contours[0].area)).toBe("17.00");
  });
  it("converts millimeters and preserves area through preview coordinates", () => {
    const r = parseDxf(
      fixture({ unit: 4, width: 2438.4, height: 647.7 }),
      "mm.dxf",
    );
    expect(r.unit).toBe("millimeters");
    const g = dxfGeometry(r, "millimeters", [0]);
    expect(sqft(polygonArea(g.points[0]).times(g.scale).times(g.scale))).toBe(
      "17.00",
    );
  });
  it("requires units for a unitless drawing", () => {
    const r = parseDxf(fixture({ unit: 0 }), "unitless.dxf");
    expect(r.unit).toBe("");
    expect(() => dxfGeometry(r, "" as "inches", [0])).toThrow();
  });
  it("requires a selected boundary", () =>
    expect(() =>
      dxfGeometry(parseDxf(fixture(), "test"), "inches", []),
    ).toThrow());
  it.each([{ closed: 0 }, { bulge: -1 }, { extrusion: -1 }, { width: 0 }])(
    "rejects unsupported or invalid outlines: %j",
    (options) => expect(() => parseDxf(fixture(options), "test.dxf")).toThrow(),
  );
  it("does not subtract sink cutouts from outer surfaces", () => {
    const inner =
      "0\nLWPOLYLINE\n8\nSINK\n90\n4\n70\n1\n10\n10\n20\n5\n10\n30\n20\n5\n10\n30\n20\n15\n10\n10\n20\n15\n";
    const r = parseDxf(fixture({ extra: inner }), "sink.dxf");
    expect(r.contours).toHaveLength(2);
    const g = dxfGeometry(r, "inches", [0]);
    expect(
      sqft(polygonArea(g.points[0]).times(new Decimal(g.scale).pow(2))),
    ).toBe("17.00");
  });
  it("reports skipped open geometry alongside valid pieces", () => {
    const extra = "0\nLINE\n8\nNOTES\n10\n0\n20\n0\n11\n100\n21\n100\n";
    const r = parseDxf(fixture({ extra }), "notes.dxf");
    expect(r.warnings.join()).toMatch(/LINE/);
    expect(r.contours).toHaveLength(1);
  });
  it("rejects binary or malformed files", () => {
    expect(() => parseDxf("AutoCAD Binary DXF", "bad")).toThrow();
    expect(() => parseDxf("not a DXF", "bad")).toThrow();
  });
  it("converts feet and metric explicitly", () => {
    expect(new Decimal(dxfUnits.feet).times(12).toNumber()).toBe(144);
    expect(new Decimal(dxfUnits.millimeters).times("25.4").toNumber()).toBe(1);
  });
});
it.each(["AC1027", "AC1032"])(
  "accepts %s headers used by R27/R32 exports",
  (version) => {
    const text = fixture().replace(
      "2\nHEADER\n",
      `2\nHEADER\n9\n$ACADVER\n1\n${version}\n`,
    );
    expect(parseDxf(text, "qcad.dxf").contours).toHaveLength(1);
  },
);
it("joins four actual DXF LINE entities into a measured countertop", () => {
  const points = [
    [0, 0],
    [96, 0],
    [96, 25.5],
    [0, 25.5],
  ];
  const lines = points
    .map(([x, y], i) => {
      const next = points[(i + 1) % 4];
      return `0\nLINE\n8\nCOUNTERTOP\n10\n${x}\n20\n${y}\n11\n${next[0]}\n21\n${next[1]}\n`;
    })
    .join("");
  const text = `0\nSECTION\n2\nENTITIES\n${lines}0\nENDSEC\n0\nEOF\n`;
  const result = parseDxf(text, "qcad-lines.dxf");
  expect(result.contours).toHaveLength(1);
  expect(sqft(result.contours[0].area)).toBe("17.00");
  expect(result.warnings).toEqual([]);
});
it("warns about unsupported entities that the parser drops", () => {
  const result = parseDxf(
    fixture({ extra: "0\nHATCH\n8\nHATCHES\n" }),
    "with-hatch.dxf",
  );
  expect(result.warnings.join()).toMatch(/HATCH/);
});

it("reads bulged semicircular polyline edges analytically", () => {
  const r = parseDxf(fixture({ bulge: 1 }), "bulged.dxf");
  expect(r.contours).toHaveLength(1);
  expect(Number(r.contours[0].area)).toBeCloseTo(2448 + 1152 * Math.PI, 7);
  expect(r.contours[0].boundary?.some((e) => e.center)).toBe(true);
});
