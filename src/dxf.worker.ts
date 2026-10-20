import { parseDxf } from "./dxf";
self.onmessage = (event: MessageEvent<{ text: string; name: string }>) => {
  try {
    self.postMessage({ review: parseDxf(event.data.text, event.data.name) });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
