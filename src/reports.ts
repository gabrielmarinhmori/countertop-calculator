import {
  drawingEdges,
  linkedDrawingPanel,
  annotationFrame,
} from "./annotations";
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
  linearCut,
} from "./engine";
import { loadImage } from "./files";
export function dimensions(p: Piece): string {
  if (p.shape === "Polygon")
    return `${p.boundary ? `${p.boundary.length} CAD edges, ${p.boundary.filter((e) => e.center).length} circular arcs; analytical area` : `${p.points.length} vertices`}; ${p.scale} inches/pixel (confirmed)`;
  return `${dimension(p.length)} x ${dimension(p.width)}${p.edgeSource ? `; linked countertop edge ${p.edgeSource.edgeIndex + 1}` : ""}${["L-shape", "U-shape"].includes(p.shape) ? `; left ${dimension(p.left)}, back ${dimension(p.back)}${p.shape === "U-shape" ? `, right ${dimension(p.right)}` : ""}` : ""}${p.quantity > 1 ? `; quantity ${p.quantity}` : ""}`;
}
export async function annotatedCanvas(project: Project, drawingId: string) {
  const manualPoints = project.pieces
    .filter((p) => p.drawingId === drawingId)
    .flatMap((p) => drawingEdges(p).flatMap((e) => [e.start, e.end]));
  const drawing = project.drawings.find((d) => d.id === drawingId) || {
    width: Math.max(600, ...manualPoints.map((p) => p[0] + 50)),
    height: Math.max(400, ...manualPoints.map((p) => p[1] + 50)),
    data: "",
  };
  const canvas = document.createElement("canvas");
  const frame = annotationFrame(
    project,
    drawingId,
    drawing.width,
    drawing.height,
  );
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-frame.x, -frame.y);
  if (drawing.data) ctx.drawImage(await loadImage(drawing.data), 0, 0);
  ctx.lineWidth = Math.max(2, drawing.width / 600);
  for (const p of project.pieces.filter((p) => p.drawingId === drawingId)) {
    try {
      const panel = linkedDrawingPanel(project, p);
      const pts = panel
        ? panel.boundary.map((e) => e.start)
        : p.shape === "Polygon"
          ? p.points
          : geometry(p).map(([x, y]) => [
              x * 2 + p.annotation[0],
              y * 2 + p.annotation[1],
            ]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      const color =
        category(p) === "backsplash"
          ? "#b75647"
          : category(p) === "waterfall"
            ? "#536fab"
            : "#176651";
      ctx.fillStyle = color + "33";
      ctx.strokeStyle = color;
      if (panel) {
        const path = new Path2D(boundaryPath(panel.boundary));
        ctx.fill(path);
        ctx.stroke(path);
        if (panel.connector) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(...panel.connector[0]);
          ctx.lineTo(...panel.connector[1]);
          ctx.stroke();
          ctx.restore();
        }
      } else if (p.boundary) {
        const path = new Path2D(boundaryPath(p.boundary));
        ctx.fill(path);
        ctx.stroke(path);
      } else {
        ctx.fill();
        ctx.stroke();
      }
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
  line(p.name, 22);
  const t = totals(p);
  const cut = linearCut(p);
  line(`Total surface area: ${sqft(t.combined)} sq ft`, 15);
  line(`Countertops: ${sqft(t.horizontal)} sq ft`);
  line(`Backsplash: ${sqft(t.backsplash)} sq ft`);
  if (!t.waterfall.isZero()) line(`Waterfall: ${sqft(t.waterfall)} sq ft`);
  line(`Linear cut: ${cut.div(12).toFixed(2)} ft / ${cut.toFixed(2)} in`, 13);
  line(
    "Linear cut estimates all piece perimeters, including quantities and arcs. Shared edges count per piece. No overcut or machine travel included.",
    9,
  );
  line("Gross areas include openings. No waste added.", 9);
  const ids = [...p.drawings.map((d) => d.id)];
  if (p.pieces.some((piece) => !piece.drawingId)) ids.push("");
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) {
      pdf.addPage();
      y = 20;
    }
    const c = await annotatedCanvas(p, ids[i]);
    const availableHeight = 280 - y;
    const ratio = Math.min(170 / c.width, availableHeight / c.height);
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
