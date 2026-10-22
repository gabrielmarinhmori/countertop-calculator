import { it, expect } from "vitest";
import { parseDxf } from "./dxf";
const rectangle = (color: number, w: number, h: number) =>
  `0\nLWPOLYLINE\n8\nSAME\n62\n${color}\n90\n4\n70\n1\n10\n0\n20\n0\n10\n${w}\n20\n0\n10\n${w}\n20\n${h}\n10\n0\n20\n${h}\n`;
it.each([8, 9, 250, 251, 252, 253, 254])(
  "gray ACI %s creates a slab independently of counter faces",
  (color) => {
    const text = `0\nSECTION\n2\nENTITIES\n${rectangle(7, 96, 25.5)}${rectangle(color, 126, 63)}0\nENDSEC\n0\nEOF\n`;
    const review = parseDxf(text, "gray.dxf");
    expect(
      review.contours.filter((c) => c.surface === "horizontal"),
    ).toHaveLength(1);
    expect(review.contours.filter((c) => c.surface === "slab")).toHaveLength(1);
  },
);
