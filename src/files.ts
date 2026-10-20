import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Drawing } from "./engine";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Could not read file."));
    r.readAsDataURL(blob);
  });
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error("Invalid image."));
    i.src = src;
  });
}
export async function importDrawing(file: File): Promise<Drawing[]> {
  if (file.size > 25 * 1024 * 1024)
    throw Error("Each file must be smaller than 25 MB.");
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
    throw Error("Choose a PNG, JPG, or PDF file.");
  const drawings: Drawing[] = [];
  if (file.type === "application/pdf") {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const doc = await loadingTask.promise;
    try {
      if (doc.numPages > 30)
        throw Error(
          "PDFs may contain up to 30 pages. Split larger files first.",
        );
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(2, 2400 / Math.max(natural.width, natural.height)),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        drawings.push({
          id: crypto.randomUUID(),
          name: `${file.name} · Page ${n}`,
          data: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
        });
      }
    } finally {
      await loadingTask.destroy();
    }
  } else {
    const data = await dataURL(file);
    const image = await loadImage(data);
    if (image.width * image.height > 40000000)
      throw Error("Image exceeds 40 megapixels. Resize it first.");
    drawings.push({
      id: crypto.randomUUID(),
      name: file.name,
      data,
      width: image.width,
      height: image.height,
    });
  }
  return drawings;
}
