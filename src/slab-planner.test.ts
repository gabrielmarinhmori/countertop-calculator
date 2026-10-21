import { it, expect } from "vitest";
import { makeProject, makePiece, fingerprint, isApproved } from "./engine";
import { planSlabs, partBounds, defaultSlabSettings } from "./slab-planner";
import { type CadEdge, sampleBoundary } from "./cad-curves";
import { restoreProject } from "./restore";
const rect = (length = "48", width = "25") => ({
  ...makePiece("Island"),
  length,
  width,
});
const project = (pieces = [rect()]) => ({ ...makeProject(), pieces });
const settings = (length = "96", width = "25") => ({
  ...defaultSlabSettings(),
  length,
  width,
});
it("places two exact half-width pieces on one slab without overlap", () => {
  const r = planSlabs(project([rect(), rect()]), settings());
  expect(r.slabs).toHaveLength(1);
  expect(r.slabs[0].parts).toHaveLength(2);
  expect(r.complete).toBe(true);
});
it("rotates a piece when necessary and respects rotation locks", () => {
  const p = project([rect("60", "30")]),
    s = settings("40", "70");
  expect(planSlabs(p, s).slabs[0].parts[0].rotation).toBe(90);
  expect(planSlabs(p, { ...s, allowRotation: false }).unplaced).toHaveLength(1);
  expect(
    planSlabs(p, { ...s, rotationLockedIds: [p.pieces[0].id] }).unplaced,
  ).toHaveLength(1);
});
it("reserves optional inter-piece spacing without requiring it at the last slab edge", () => {
  const p = project([rect(), rect()]);
  expect(planSlabs(p, { ...settings(), gap: "1/8" }).slabs).toHaveLength(2);
  expect(
    planSlabs(project([rect("96", "25")]), { ...settings(), gap: "1/8" }).slabs,
  ).toHaveLength(1);
});
it("applies edge trim per side and rejects excessive trim", () => {
  const p = project([rect(), rect()]);
  expect(
    planSlabs(p, { ...settings("97", "26"), margin: "1/2" }).slabs,
  ).toHaveLength(1);
  expect(planSlabs(p, { ...settings("97", "26"), margin: "1" }).complete).toBe(
    false,
  );
  expect(() => planSlabs(p, { ...settings(), margin: "50" })).toThrow(
    /no usable/,
  );
});
it("includes backsplash quantities as separate pieces", () => {
  const p = project([
    { ...rect("49", "25"), shape: "Backsplash", quantity: 5 },
  ]);
  const r = planSlabs(p, settings("98", "50"));
  expect(r.slabs).toHaveLength(2);
  expect(r.slabs.flatMap((s) => s.parts)).toHaveLength(5);
});
it("uses conservative L-shape envelopes instead of inventing a nesting solution", () => {
  const a = {
    ...makePiece("L-shape"),
    length: "100",
    width: "100",
    left: "20",
    back: "20",
    defaultConfirmed: true,
  };
  const r = planSlabs(
    project([a, { ...a, id: crypto.randomUUID() }]),
    settings("100", "100"),
  );
  expect(r.slabs).toHaveLength(2);
  expect(r.actualArea).toBe(7200);
  expect(r.reservedArea).toBe(20000);
  expect(r.areaLowerBound).toBe(1);
});
it("uses exact cardinal arc extrema in bounds rather than underestimating from display samples", () => {
  const angle = 0.01,
    radius = 10;
  const start: [number, number] = [
      radius * Math.cos(angle),
      radius * Math.sin(angle),
    ],
    end: [number, number] = [-start[0], -start[1]];
  const boundary: CadEdge[] = [
    { start, end, center: [0, 0], radius, sweep: Math.PI },
    { start: end, end: start },
  ];
  const p = {
    ...makePiece("Polygon"),
    boundary,
    points: sampleBoundary(boundary),
    scale: "1",
    scaleConfirmed: true,
  };
  expect(partBounds(p).height).toBeCloseTo(10 + 10 * Math.sin(angle), 10);
});
it("reports oversized pieces as an incomplete job without omitting them", () => {
  const r = planSlabs(project([rect(), rect("300", "25")]), settings());
  expect(r.slabs).toHaveLength(1);
  expect(r.unplaced).toHaveLength(1);
  expect(r.complete).toBe(false);
});
it("blocks invalid measurements and permits explicit exclusion of that piece", () => {
  const p = project([rect(), makePiece("Island")]);
  expect(() => planSlabs(p, settings())).toThrow();
  expect(
    planSlabs(p, { ...settings(), excludedIds: [p.pieces[1].id] }).complete,
  ).toBe(true);
});
it("blocks overlapping shared-coordinate calculation shapes until fabrication pieces are defined", () => {
  const p = project([
    { ...rect("96", "25"), x: "0" },
    { ...rect("96", "25"), x: "48" },
  ]);
  p.placement = "shared";
  expect(() => planSlabs(p, settings("120", "60"))).toThrow(/Overlapping/);
});
it("rejects empty selections, negative spacing, zero stock, and excessive quantities", () => {
  const p = project();
  expect(() =>
    planSlabs(p, { ...settings(), excludedIds: [p.pieces[0].id] }),
  ).toThrow(/Select/);
  expect(() => planSlabs(p, { ...settings(), gap: "-1" })).toThrow();
  expect(() => planSlabs(p, settings("0", "25"))).toThrow();
  expect(() =>
    planSlabs(
      project([{ ...rect(), shape: "Backsplash", quantity: 201 }]),
      settings(),
    ),
  ).toThrow(/200/);
});
it("keeps measurement approval independent and restores planning IDs with backups", () => {
  const p = project();
  p.slabSettings = { ...settings(), rotationLockedIds: [p.pieces[0].id] };
  p.approved = { at: "now", fingerprint: fingerprint(p) };
  p.slabSettings.gap = "1/8";
  expect(isApproved(p)).toBe(true);
  const r = restoreProject(JSON.parse(JSON.stringify(p)));
  expect(r.slabSettings?.rotationLockedIds).toEqual([r.pieces[0].id]);
  expect(r.slabSettings?.gap).toBe("1/8");
});
it("keeps every placed envelope inside stock and enforces spacing for varied pieces", () => {
  const p = project(
    Array.from({ length: 25 }, (_, i) =>
      rect(String(12 + ((i * 13) % 35)), String(8 + ((i * 7) % 21))),
    ),
  );
  const r = planSlabs(p, {
    ...settings("100", "60"),
    gap: "1/4",
    margin: "1/2",
  });
  expect(r.complete).toBe(true);
  expect(r.slabs.flatMap((s) => s.parts)).toHaveLength(25);
  for (const slab of r.slabs)
    for (let i = 0; i < slab.parts.length; i++) {
      const a = slab.parts[i];
      expect(a.x).toBeGreaterThanOrEqual(r.margin - 1e-7);
      expect(a.y).toBeGreaterThanOrEqual(r.margin - 1e-7);
      expect(a.x + a.placedWidth).toBeLessThanOrEqual(
        r.length - r.margin + 1e-7,
      );
      expect(a.y + a.placedHeight).toBeLessThanOrEqual(
        r.width - r.margin + 1e-7,
      );
      for (const b of slab.parts.slice(i + 1))
        expect(
          a.x + a.placedWidth + r.gap <= b.x + 1e-7 ||
            b.x + b.placedWidth + r.gap <= a.x + 1e-7 ||
            a.y + a.placedHeight + r.gap <= b.y + 1e-7 ||
            b.y + b.placedHeight + r.gap <= a.y + 1e-7,
        ).toBe(true);
    }
});
