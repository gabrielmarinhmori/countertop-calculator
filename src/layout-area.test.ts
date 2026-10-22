import { it, expect } from "vitest";
import { makeProject, makePiece } from "./engine";
import { automaticTotals } from "./layout-area";
const rectangle = (x: number) => ({
  ...makePiece("Island"),
  length: "100",
  width: "50",
  annotation: [x * 2, 0] as [number, number],
});
it("two 100x50 pieces with a 50x50 overlap total 7500 square inches", () => {
  const p = makeProject();
  p.pieces = [rectangle(0), rectangle(50)];
  expect(automaticTotals(p).combined.toNumber()).toBe(7500);
  p.pieces[1].annotation = [200, 0];
  expect(automaticTotals(p).combined.toNumber()).toBe(10000);
});
it("independent drawings do not share area coordinates", () => {
  const p = makeProject();
  p.pieces = [
    { ...rectangle(0), drawingId: "a" },
    { ...rectangle(0), drawingId: "b" },
  ];
  expect(automaticTotals(p).combined.toNumber()).toBe(10000);
});
it("keeps extra quantity copies instead of silently losing their area", () => {
  const p = makeProject();
  p.pieces = [
    { ...makePiece("Backsplash"), length: "100", width: "50", quantity: 2 },
  ];
  expect(automaticTotals(p).combined.toNumber()).toBe(10000);
});

it("keeps different surface categories separate when they overlap", () => {
  const p = makeProject();
  p.pieces = [rectangle(0), { ...rectangle(0), surface: "backsplash" }];
  const t = automaticTotals(p);
  expect(t.horizontal.toNumber()).toBe(5000);
  expect(t.backsplash.toNumber()).toBe(5000);
  expect(t.combined.toNumber()).toBe(10000);
});
