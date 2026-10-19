import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  makePiece,
  makeProject,
  inches,
  dimension,
  pieceArea,
  sqft,
  polygonArea,
  totals,
  issues,
  fingerprint,
  isApproved,
} from "./engine";
import { restoreProject } from "./restore";
import { validateSuggestion } from "./recognition";
const rect = (length = "96", width = "25") => ({
  ...makePiece("Straight"),
  length,
  width,
  defaultUsed: false,
});
describe("dimension parsing", () => {
  it.each([
    ["96", "96"],
    ["25.5", "25.5"],
    ["25 1/2", "25.5"],
    ["36 1/4", "36.25"],
    ["48 3/8", "48.375"],
    ["60 7/16", "60.4375"],
    [" 25 1/2 ” ", "25.5"],
    ["1/2″", "0.5"],
  ])("%s → %s", (input, output) =>
    expect(inches(input).toString()).toBe(output),
  );
  it.each([
    "",
    "0",
    "-1",
    "1/0",
    "1/2/3",
    "1 2",
    "1/1",
    "3/2",
    "2 0/4",
    "NaN",
    "1e3",
    "12 feet",
    '2"5',
    '25""',
  ])("rejects %s", (raw) => expect(() => inches(raw)).toThrow());
  it("formats sixteenths and decimal values", () => {
    expect(dimension("60.4375")).toBe("60 7/16″");
    expect(dimension("25.51")).toBe("25.51″");
  });
});
describe("surface calculations", () => {
  it("rectangle", () => expect(sqft(pieceArea(rect()))).toBe("16.67"));
  it("fractional rectangle", () =>
    expect(sqft(pieceArea(rect("96", "25 1/2")))).toBe("17.00"));
  it.each([
    ["25", "22.74"],
    ["25 1/2", "23.11"],
  ])("L depth %s", (depth, area) => {
    const p = {
      ...makePiece("L-shape"),
      length: "96",
      width: "60",
      left: depth,
      back: depth,
    };
    expect(sqft(pieceArea(p))).toBe(area);
  });
  it("nonuniform L legs", () =>
    expect(
      pieceArea({
        ...makePiece("L-shape"),
        length: "96",
        width: "60",
        left: "20",
        back: "25",
      }).toNumber(),
    ).toBe(3100));
  it("nonuniform U legs", () =>
    expect(
      pieceArea({
        ...makePiece("U-shape"),
        length: "100",
        width: "70",
        left: "20",
        right: "15",
        back: "25",
      }).toNumber(),
    ).toBe(4075));
  it("rejects impossible U geometry", () =>
    expect(() =>
      pieceArea({
        ...makePiece("U-shape"),
        length: "40",
        width: "70",
        left: "20",
        right: "20",
        back: "25",
      }),
    ).toThrow());
  it("backsplash and quantity", () => {
    expect(sqft(pieceArea({ ...rect("96", "4"), shape: "Backsplash" }))).toBe(
      "2.67",
    );
    expect(
      pieceArea({
        ...rect("96", "4"),
        shape: "Backsplash",
        quantity: 2,
      }).toNumber(),
    ).toBe(768);
  });
  it("waterfall", () =>
    expect(sqft(pieceArea({ ...rect("36", "34"), shape: "Waterfall" }))).toBe(
      "8.50",
    ));
  it("missing dimensions", () =>
    expect(() => pieceArea(makePiece("Island"))).toThrow());
  it("rounds only at presentation", () => {
    const area = pieceArea(rect());
    expect(area.div(144).toNumber()).toBeCloseTo(16.6666666667);
    expect(sqft(new Decimal("0.72"))).toBe("0.01");
  });
});
describe("polygon validation", () => {
  it("concave polygon", () =>
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ]).toNumber(),
    ).toBe(12));
  it.each(
    [
      [
        [0, 0],
        [3, 3],
        [0, 3],
        [3, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
    ].map((points) => [points] as const),
  )("rejects invalid polygon", (points) =>
    expect(() => polygonArea(points as [number, number][])).toThrow(),
  );
  it("requires verified physical scale", () => {
    const p = {
      ...makePiece("Polygon"),
      points: [
        [0, 0],
        [96, 0],
        [96, 25],
        [0, 25],
      ] as [number, number][],
      scale: "1",
    };
    expect(() => pieceArea(p)).toThrow();
    expect(pieceArea({ ...p, scaleConfirmed: true }).toNumber()).toBe(2400);
  });
});
describe("union and approval", () => {
  it("subtracts overlapping countertops", () => {
    const p = makeProject();
    p.placement = "shared";
    p.pieces = [rect("100", "25"), { ...rect("100", "25"), x: "50" }];
    expect(totals(p).horizontal.toNumber()).toBe(3750);
  });
  it("handles containment and touching edges", () => {
    const p = makeProject();
    p.placement = "shared";
    p.pieces = [rect("100", "100"), { ...rect("10", "10"), x: "20", y: "20" }];
    expect(totals(p).horizontal.toNumber()).toBe(10000);
    p.pieces = [rect("100", "25"), { ...rect("100", "25"), x: "100" }];
    expect(totals(p).horizontal.toNumber()).toBe(5000);
  });
  it("separates report categories across multiple pieces", () => {
    const p = makeProject();
    p.pieces = [
      rect("96", "25 1/2"),
      { ...rect("96", "4"), shape: "Backsplash" },
      { ...rect("36", "34"), shape: "Waterfall" },
    ];
    p.placement = "separate";
    p.placementConfirmed = true;
    const t = totals(p);
    expect(sqft(t.horizontal)).toBe("17.00");
    expect(sqft(t.backsplash)).toBe("2.67");
    expect(sqft(t.waterfall)).toBe("8.50");
    expect(sqft(t.combined)).toBe("28.17");
  });
  it("blocks assumed defaults and unknown overlaps", () => {
    const p = makeProject();
    p.pieces = [
      { ...rect(), defaultUsed: true, defaultConfirmed: false },
      rect(),
    ];
    expect(issues(p).join(" ")).toMatch(/assumed/);
    expect(issues(p).join(" ")).toMatch(/positions/);
  });
  it("invalidates approval after a dimension change", () => {
    const p = makeProject();
    p.pieces = [rect()];
    p.approved = { at: new Date().toISOString(), fingerprint: fingerprint(p) };
    expect(isApproved(p)).toBe(true);
    p.pieces[0].length = "100";
    expect(isApproved(p)).toBe(false);
  });
  it("restores as a new unapproved project", () => {
    const p = makeProject();
    p.pieces = [rect()];
    p.approved = { at: "now", fingerprint: fingerprint(p) };
    const restored = restoreProject(JSON.parse(JSON.stringify(p)));
    expect(restored.id).not.toBe(p.id);
    expect(restored.approved).toBeUndefined();
    expect(restored.placementConfirmed).toBe(false);
  });
  it("rejects malformed backups and AI suggestions", () => {
    expect(() =>
      restoreProject({ name: "test", pieces: [{}], drawings: [] }),
    ).toThrow();
    expect(() =>
      validateSuggestion({
        schemaVersion: 1,
        drawingId: "a",
        proposals: [{ shape: "Rectangle" }],
      }),
    ).toThrow();
  });
});
it("preserves an interior gap when unioning surrounding surfaces", () => {
  const p = makeProject();
  p.placement = "shared";
  p.pieces = [
    rect("10", "2"),
    { ...rect("10", "2"), y: "8" },
    { ...rect("2", "6"), y: "2" },
    { ...rect("2", "6"), x: "8", y: "2", shape: "Peninsula" },
  ];
  expect(totals(p).horizontal.toNumber()).toBe(64);
});
