import { it, expect } from "vitest";
import { parseDxf } from "./dxf";
it("keeps partial green overlays on a white contour, regardless of duplicate order", () => {
  const base =
    "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n5\nA1\n8\nCOUNTERTOP\n90\n4\n70\n1\n10\n0\n20\n0\n10\n96\n20\n0\n10\n96\n20\n25.5\n10\n0\n20\n25.5\n0\nENDSEC\n0\nEOF\n";
  const overlay =
    "0\nLINE\n8\nCOUNTERTOP\n62\n3\n10\n20\n20\n0\n11\n80\n21\n0\n";
  for (const input of [
    base.replace("0\nLWPOLYLINE", overlay + "0\nLWPOLYLINE"),
    base.replace("0\nENDSEC\n0\nEOF", overlay + "0\nENDSEC\n0\nEOF"),
    base.replace(
      "0\nENDSEC\n0\nEOF",
      overlay.replace("COUNTERTOP", "FINISH") + "0\nENDSEC\n0\nEOF",
    ),
  ]) {
    const review = parseDxf(input, "green.dxf");
    expect(review.contours).toHaveLength(1);
    const green = review.contours[0].boundary!.filter(
      (e) => e.polished || e.color === 3,
    );
    expect(
      green.reduce(
        (s, e) => s + Math.hypot(e.end[0] - e.start[0], e.end[1] - e.start[1]),
        0,
      ),
    ).toBeCloseTo(60);
  }
});
