/** Future providers must run behind a secure server. Never supply client API keys. */
export interface RecognitionSuggestion {
  schemaVersion: 1;
  drawingId: string;
  proposals: {
    shape:
      "Straight" | "L-shape" | "U-shape" | "Island" | "Peninsula" | "Polygon";
    boundary: [number, number][];
    dimensions: {
      label: string;
      rawInches: string | null;
      confidence: number;
    }[];
    uncertainties: string[];
  }[];
}
export interface RecognitionProvider {
  suggest(file: Blob): Promise<unknown>;
}
export function validateSuggestion(value: unknown): RecognitionSuggestion {
  const v = value as RecognitionSuggestion;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    typeof v.drawingId !== "string" ||
    !Array.isArray(v.proposals)
  )
    throw Error("Invalid recognition response.");
  for (const p of v.proposals) {
    if (
      ![
        "Straight",
        "L-shape",
        "U-shape",
        "Island",
        "Peninsula",
        "Polygon",
      ].includes(p.shape) ||
      !Array.isArray(p.boundary) ||
      p.boundary.length < 3 ||
      p.boundary.some(
        (q) =>
          !Array.isArray(q) ||
          q.length !== 2 ||
          q.some((n) => !Number.isFinite(n)),
      ) ||
      !Array.isArray(p.dimensions) ||
      p.dimensions.some(
        (d) =>
          typeof d.label !== "string" ||
          (d.rawInches !== null && typeof d.rawInches !== "string") ||
          !Number.isFinite(d.confidence) ||
          d.confidence < 0 ||
          d.confidence > 1,
      ) ||
      !Array.isArray(p.uncertainties) ||
      p.uncertainties.some((s) => typeof s !== "string")
    )
      throw Error("Invalid suggestion geometry or measurements.");
  }
  return v;
}
