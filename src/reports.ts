import { linkedDrawingEdge } from "./annotations";
import { boundaryPath } from "./cad-curves";
import { jsPDF } from "jspdf";
import {
  type Project,
  type Piece,
  geometry,
  pieceArea,
  category,
  sqft,
  totals,
  isApproved,
  dimension,
} from "./engine";
import { loadImage } from "./files";
export function dimensions(p: Piece): string {
  if (p.shape === "Polygon")
    return `${p.boundary ? `${p.boundary.length} CAD edges, ${p.boundary.filter((e) => e.center).length} circular arcs; analytical area` : `${p.points.length} vertices`}; ${p.scale} inches/pixel (confirmed)`;
  return `${dimension(p.length)} x ${dimension(p.width)}${p.edgeSource ? `; linked countertop edge ${p.edgeSource.edgeIndex + 1}` : ""}${["L-shape", "U-shape"].includes(p.shape) ? `; left ${dimension(p.left)}, back ${dimension(p.back)}${p.shape === "U-shape" ? `, right ${dimension(p.right)}` : ""}` : ""}${p.quantity > 1 ? `; quantity ${p.quantity}` : ""}`;
}
export async function annotatedCanvas(project: Project, drawingId: string) {
  const drawing = project.drawings.find((d) => d.id === drawingId);
  if (!drawing) throw Error("Select an uploaded drawing first.");
  const canvas = document.createElement("canvas");
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(await loadImage(drawing.data), 0, 0);
  const size = Math.max(14, drawing.width / 70);
  ctx.lineWidth = Math.max(2, drawing.width / 600);
  ctx.font = `${size}px sans-serif`;
  for (const p of project.pieces.filter((p) => p.drawingId === drawingId)) {
    try {
      const attached = linkedDrawingEdge(project, p);
      const pts = attached
        ? [attached.start, attached.end]
        : p.shape === "Polygon"
          ? p.points
          : geometry(p).map(([x, y]) => [
              x * 2 + p.annotation[0],
              y * 2 + p.annotation[1],
            ]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = "#2d947733";
      if (!attached) {
        if (p.boundary) ctx.fill(new Path2D(boundaryPath(p.boundary)));
        else ctx.fill();
      }
      ctx.strokeStyle = attached ? "#b75647" : "#176651";
      if (attached)
        ctx.stroke(new Path2D(boundaryPath([attached]).replace(/ Z$/, "")));
      else if (p.boundary) ctx.stroke(new Path2D(boundaryPath(p.boundary)));
      else ctx.stroke();
      ctx.fillStyle = "#102e27";
      ctx.fillText(
        `${p.name} · ${dimensions(p)} · ${sqft(pieceArea(p))} sq ft`,
        pts[0][0],
        Math.max(size, pts[0][1] - size / 2),
      );
    } catch {
      /* Invalid draft pieces are not exported in approved reports. */
    }
  }
  return canvas;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPNG(p: Project, id: string) {
  const canvas = await annotatedCanvas(p, id);
  canvas.toBlob((b) => {
    if (b) download(b, "annotated-drawing.png");
  }, "image/png");
}
export async function exportReport(p: Project) {
  if (!isApproved(p))
    throw Error("Approve this project before generating an official report.");
  const pdf = new jsPDF();
  let y = 24;
  const line = (text: string, size = 11) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 170);
    const height = lines.length * 6;
    if (y + height > 275) {
      pdf.addPage();
      y = 22;
    }
    pdf.text(lines, 20, y);
    y += height + 4;
  };
  line("COUNTERTOP / APPROVED ESTIMATE", 11);
  line(p.name, 24);
  line(`Approved: ${new Date(p.approved!.at).toLocaleString()}`);
  line(
    "All dimensions in inches. Openings for sinks and cooktops are included.",
  );
  for (const piece of p.pieces) {
    if (y > 215) {
      pdf.addPage();
      y = 22;
    }
    line(`${piece.name} | ${piece.shape} | ${category(piece)}`, 14);
    line(dimensions(piece).replaceAll("″", " in"));
    line(
      `${sqft(pieceArea(piece))} sq ft${piece.defaultUsed ? " | Approved standard-depth assumption." : ""}`,
    );
    line(
      `Drawing: ${p.drawings.find((d) => d.id === piece.drawingId)?.name || "Manual schematic"}`,
    );
  }
  const t = totals(p);
  if (y > 210) {
    pdf.addPage();
    y = 22;
  }
  line("SURFACE AREA BREAKDOWN", 15);
  line(`Horizontal countertops: ${sqft(t.horizontal)} sq ft`);
  line(`Backsplash: ${sqft(t.backsplash)} sq ft`);
  line(`Waterfall: ${sqft(t.waterfall)} sq ft`);
  line(`Combined material surfaces: ${sqft(t.combined)} sq ft`, 14);
  line(
    `Placement approved as: ${p.placement === "shared" ? "verified shared coordinates; overlaps counted once" : "separate physical surfaces"}. Individual piece areas may exceed a union total.`,
  );
  line(
    "No waste, pricing, joint allowances, or minimum quantities added. Preliminary measurement and fabrication planning only; not CNC instructions.",
  );
  for (const drawing of p.drawings) {
    pdf.addPage();
    y = 22;
    line(drawing.name, 14);
    line(
      "Overlay schematics are illustrative unless a physical scale has been verified.",
      9,
    );
    const c = await annotatedCanvas(p, drawing.id);
    const ratio = Math.min(170 / c.width, 215 / c.height);
    pdf.addImage(
      c.toDataURL("image/png"),
      "PNG",
      20,
      y,
      c.width * ratio,
      c.height * ratio,
    );
  }
  pdf.save("countertop-approved-report.pdf");
}
