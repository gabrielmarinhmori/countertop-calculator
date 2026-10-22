import { it, expect } from "vitest";
import { makeProject, makePiece, totals } from "./engine";
import { addDrawingSlab, slabBounds, moveDrawingSlab } from "./drawing-slabs";
import { linearCut, polishedLength } from "./cutting";
import { restoreProject } from "./restore";
import { snappedDelta } from "./transforms";
it("stores different slab sizes without including them in measurement totals", () => {
  let p = makeProject();
  p.pieces = [{ ...makePiece("Island"), length: "96", width: "25.5" }];
  p = addDrawingSlab(p, "", "126", "63");
  p = addDrawingSlab(p, "", "100", "50");
  expect(slabBounds(p.drawingSlabs![0]).width).toBe(252);
  expect(slabBounds(p.drawingSlabs![1]).width).toBe(200);
  expect(totals(p).combined.toNumber()).toBe(2448);
  expect(linearCut(p).toNumber()).toBe(243);
  expect(polishedLength(p).toNumber()).toBe(0);
  const moved = moveDrawingSlab(p, p.drawingSlabs![0].id, [15, 30]);
  expect(moved.drawingSlabs![0].x).toBe(55);
  expect(restoreProject(moved).drawingSlabs![0].x).toBe(55);
  expect(() =>
    restoreProject({
      ...p,
      drawingSlabs: [{ ...p.drawingSlabs![0], scale: 0 }],
    }),
  ).toThrow();
  expect(() => addDrawingSlab(p, "", "0", "50")).toThrow();
});
it("matches the source CAD scale for slab dimensions", () => {
  let p = makeProject();
  p.pieces = [
    {
      ...makePiece("Polygon"),
      scale: "0.25",
      scaleConfirmed: true,
      points: [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10],
      ],
    },
  ];
  p = addDrawingSlab(p, "", "100", "50");
  expect(slabBounds(p.drawingSlabs![0]).width).toBe(400);
  p.pieces[0].scaleConfirmed = false;
  expect(() => addDrawingSlab(p, "", "100", "50")).toThrow(
    /Confirm the drawing scale/,
  );
});
it("prioritizes corners while an edge is already touching", () => {
  const a = {
    ...makePiece("Island"),
    length: "96",
    width: "25.5",
    annotation: [0, 0] as [number, number],
  };
  const b = {
    ...makePiece("Backsplash"),
    length: "96",
    width: "4",
    annotation: [6, -8] as [number, number],
  };
  const p = { ...makeProject(), pieces: [a, b] };
  expect(snappedDelta(p, [b.id], [0, 0], 10)).toEqual([-6, 0]);
});
