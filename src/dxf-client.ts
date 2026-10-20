import type { DxfReview } from "./dxf";
export function readDxf(text: string, name: string): Promise<DxfReview> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./dxf.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        Error(
          "DXF processing timed out. Export a smaller drawing with only countertop boundaries.",
        ),
      );
    }, 10000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (e) => {
      cleanup();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.review);
    };
    worker.onerror = () => {
      cleanup();
      reject(
        Error("Could not process this DXF file. Export a valid ASCII DXF."),
      );
    };
    worker.postMessage({ text, name });
  });
}
