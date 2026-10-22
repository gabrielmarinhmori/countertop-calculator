import { describe, it, expect } from "vitest";
import { makeProject, makePiece } from "./engine";
import { slabUsage } from "./slab-usage";
import { moveDrawingSlab } from "./drawing-slabs";
import { restoreProject } from "./restore";
const slab = () => ({
  id: "stock",
  name: "Quartz A",
  locked: false,
  drawingId: "",
  length: "100",
  width: "50",
  scale: 0.5,
  x: 0,
  y: 0,
});
const rectangle = (
  length = "50",
  width = "50",
  annotation: [number, number] = [0, 0],
) => ({ ...makePiece("Island"), length, width, annotation });
describe("slab footprint usage", () => {
  it("shows used, free and percentages and avoids double-counting overlapping pieces", () => {
    const p = makeProject();
    p.pieces = [rectangle(), rectangle()];
    const u = slabUsage(p, slab());
    expect(u.total.toNumber()).toBe(5000);
    expect(u.used.toNumber()).toBe(2500);
    expect(u.remaining.toNumber()).toBe(2500);
    expect(u.usedPercent.toNumber()).toBe(50);
  });
  it("clips pieces crossing the slab and excludes other drawings", () => {
    const p = makeProject();
    p.pieces = [
      rectangle("50", "50", [-50, 0]),
      { ...rectangle("100", "50"), drawingId: "elsewhere" },
    ];
    expect(slabUsage(p, slab()).used.toNumber()).toBe(1250);
  });
  it("recalculates after stock moves and reports invalid geometry instead of zero usage", () => {
    const p = makeProject();
    p.pieces = [rectangle()];
    p.drawingSlabs = [slab()];
    const q = moveDrawingSlab(p, "stock", [200, 0]);
    expect(slabUsage(q, q.drawingSlabs![0]).used.toNumber()).toBe(0);
    p.pieces[0].length = "";
    expect(() => slabUsage(p, slab())).toThrow();
  });
  it("a stock lock prevents movement and survives restore with its name", () => {
    const p = makeProject();
    p.drawingSlabs = [{ ...slab(), locked: true }];
    const q = moveDrawingSlab(p, "stock", [50, 50]);
    expect(q.drawingSlabs![0].x).toBe(0);
    const restored = restoreProject(q);
    expect(restored.drawingSlabs![0].locked).toBe(true);
    expect(restored.drawingSlabs![0].name).toBe("Quartz A");
  });
});
