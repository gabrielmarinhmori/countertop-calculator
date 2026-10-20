import { useState } from "react";
import {
  type DxfReview,
  type DxfUnit,
  dxfUnits,
  dxfGeometry,
  importDxf,
} from "./dxf";
import { sqft } from "./engine";
import Decimal from "decimal.js";
export function DxfImport({
  review,
  onCancel,
  onImport,
}: {
  review: DxfReview;
  onCancel: () => void;
  onImport: (result: ReturnType<typeof importDxf>) => void;
}) {
  const [unit, setUnit] = useState<DxfUnit | "">(review.unit),
    [selected, setSelected] = useState<number[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const toggle = (i: number) => {
    setSelected((s) => (s.includes(i) ? s.filter((n) => n !== i) : [...s, i]));
    setConfirmed(false);
  };
  let preview: ReturnType<typeof dxfGeometry> | undefined;
  try {
    if (unit && selected.length) preview = dxfGeometry(review, unit, selected);
  } catch {
    /* errors are shown when importing */
  }
  return (
    <div className="modal-backdrop">
      <section
        className="review-panel dxf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dxf-title"
      >
        <div className="eyebrow">CAD IMPORT · NO AI REQUIRED</div>
        <h2 id="dxf-title">Review DXF boundaries</h2>
        <p>
          {review.name}. Only closed straight-edged 2D polylines in model space
          are supported. Curves, blocks, text, dimensions, and other entities
          are not converted. Select only full horizontal countertop outlines,
          not sink openings, labels, borders, backsplashes, or duplicated
          contours. Cutouts must remain included in the full outer surface.
        </p>
        <label>
          Drawing units{" "}
          {review.unit ? "(suggested by DXF header)" : "(not specified by DXF)"}
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value as DxfUnit | "");
              setConfirmed(false);
            }}
          >
            <option value="">Choose units</option>
            {Object.keys(dxfUnits).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        {review.warnings.length > 0 && (
          <div className="dxf-warnings">
            <strong>Not imported — review for missing surfaces</strong>
            <ul>
              {review.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="dxf-contours">
          {review.contours.map((c, i) => (
            <label key={i} className="checkbox">
              <input
                type="checkbox"
                checked={selected.includes(i)}
                onChange={() => toggle(i)}
              />
              <span>
                {c.name} · {c.points.length} vertices
                {unit
                  ? ` · ${sqft(new Decimal(c.area).times(dxfUnits[unit]).times(dxfUnits[unit]))} sq ft`
                  : ""}
              </span>
            </label>
          ))}
        </div>
        {preview && (
          <svg
            className="dxf-preview"
            viewBox={`0 0 ${preview.width} ${preview.height}`}
            aria-label="Selected DXF contours"
          >
            {preview.points.map((points, i) => (
              <polygon
                key={i}
                points={points.map((p) => p.join(",")).join(" ")}
                fill="#41806a22"
                stroke="#285944"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          I verified the drawing units, selected the full outer countertop
          boundaries, and reviewed skipped entities. Imported measurements still
          require final project review.
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="heading-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!unit || !selected.length || !confirmed}
            onClick={() => {
              try {
                onImport(importDxf(review, unit as DxfUnit, selected));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Import measured pieces
          </button>
        </div>
      </section>
    </div>
  );
}
