import { useState } from "react";
import {
  type DxfReview,
  type DxfUnit,
  dxfUnits,
  dxfGeometry,
  importDxf,
} from "./dxf";
import { boundaryPath, transformBoundary } from "./cad-curves";
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
  const [names, setNames] = useState(review.contours.map((c) => c.name));
  const rename = (i: number) => {
    const name = prompt("Piece name", names[i]);
    if (name?.trim()) {
      setNames((prev) => prev.map((v, k) => (k === i ? name.trim() : v)));
      setConfirmed(false);
    }
  };
  const [surfaces, setSurfaces] = useState(
    review.contours.map((c) => c.surface || "horizontal"),
  );
  const adjusted = {
    ...review,
    contours: review.contours.map((c, i) => ({
      ...c,
      name: names[i],
      surface: surfaces[i],
    })),
  };
  let scene: ReturnType<typeof dxfGeometry> | undefined;
  try {
    scene = dxfGeometry(
      adjusted,
      unit || "inches",
      review.contours.map((_, i) => i),
    );
  } catch {
    /* import errors are displayed below */
  }
  const toggle = (i: number) => {
    setSelected((s) => (s.includes(i) ? s.filter((n) => n !== i) : [...s, i]));
    setConfirmed(false);
  };
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
          {review.name}. Shared borders and circular arcs are reconstructed into
          enclosed regions. Green edges are imported as polished edges. Closed
          gray rectangles are slabs, not countertop pieces. White/yellow suggest
          countertops; red suggests back/side splash. Check each category and
          select only physical surfaces. Do not select sink/cooktop openings or
          small accidental regions.
        </p>
        <p className="help">
          Arcs use analytical circular-segment areas. Display samples do not
          determine area. Endpoint cleanup tolerance: 0.0000001 drawing units;
          larger gaps are not filled. Curved horizontal overlaps are blocked
          during project review; choose separate surfaces only after verifying
          no overlap.
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
            <strong>
              CAD processing notes — review for missing or ambiguous surfaces
            </strong>
            <ul>
              {review.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="selection-toolbar">
          <button
            disabled={selected.length === review.contours.length}
            onClick={() => {
              setSelected(review.contours.map((_, i) => i));
              setConfirmed(false);
            }}
          >
            Select all
          </button>
          <button
            disabled={!selected.length}
            onClick={() => {
              setSelected([]);
              setConfirmed(false);
            }}
          >
            Clear selection
          </button>
          <span aria-live="polite">
            {selected.length} / {review.contours.length} selected
          </span>
        </div>
        <p className="help">
          Double-click a piece name to rename it. Select all also includes small
          flagged regions; deselect anything that is not material.
        </p>
        <div className="dxf-contours">
          {review.contours.map((c, i) => (
            <div key={i} className="cad-contour-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={() => toggle(i)}
                />
                <span>
                  <span
                    title="Double-click to rename"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      rename(i);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        rename(i);
                      }
                    }}
                  >
                    {names[i]}
                  </span>{" "}
                  · {c.points.length} vertices
                  {unit
                    ? ` · ${sqft(new Decimal(c.area).times(dxfUnits[unit]).times(dxfUnits[unit]))} sq ft`
                    : ""}
                </span>
              </label>
              <select
                aria-label={`Surface category ${i + 1}`}
                value={surfaces[i]}
                onChange={(e) => {
                  setSurfaces((s) =>
                    s.map((v, k) =>
                      k === i ? (e.target.value as typeof v) : v,
                    ),
                  );
                  setConfirmed(false);
                }}
              >
                <option value="horizontal">Countertop</option>
                <option value="backsplash">Back / side splash</option>
                <option value="waterfall">Waterfall</option>
                <option value="slab">Slab</option>
              </select>
              {Number(c.area) < 4 && (
                <small className="validation">
                  Small enclosed region — verify it is intentional.
                </small>
              )}
            </div>
          ))}
        </div>
        {scene && (
          <svg
            className="dxf-preview"
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            aria-label="Selected DXF contours"
            role="group"
          >
            {review.context?.map((edge, i) => {
              const mapped = transformBoundary(
                [edge],
                (p) => [
                  (p[0] - scene!.minX) * scene!.factor + 50,
                  (scene!.maxY - p[1]) * scene!.factor + 50,
                ],
                scene!.factor,
                true,
              );
              return (
                <path
                  key={`source-${i}`}
                  d={boundaryPath(mapped).replace(/ Z$/, "")}
                  fill="none"
                  stroke={
                    edge.color === 1
                      ? "#ff7979"
                      : edge.color === 2
                        ? "#ffd55a"
                        : "#b2c0b9"
                  }
                  strokeWidth={1}
                />
              );
            })}
            {scene.points.map((points, i) => {
              const boundary = scene!.contours[i].boundary;
              const mapped = boundary
                ? transformBoundary(
                    boundary,
                    (p) => [
                      (p[0] - scene!.minX) * scene!.factor + 50,
                      (scene!.maxY - p[1]) * scene!.factor + 50,
                    ],
                    scene!.factor,
                    true,
                  )
                : undefined;
              const cx = points.reduce((s, p) => s + p[0], 0) / points.length,
                cy = points.reduce((s, p) => s + p[1], 0) / points.length;
              const color =
                surfaces[i] === "slab"
                  ? "#aeb4bb"
                  : surfaces[i] === "backsplash"
                    ? "#ff7979"
                    : surfaces[i] === "waterfall"
                      ? "#93a8ff"
                      : "#e6efe9";
              return (
                <g
                  key={i}
                  onClick={() => toggle(i)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select region ${i + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(i);
                    }
                  }}
                >
                  <path
                    d={
                      mapped
                        ? boundaryPath(mapped)
                        : `M${points.map((p) => p.join(" ")).join(" L")} Z`
                    }
                    fill={selected.includes(i) ? color + "99" : color + "15"}
                    stroke={color}
                    strokeWidth={selected.includes(i) ? 3 : 1.5}
                  />
                  <text
                    x={cx}
                    y={cy}
                    fontSize={12}
                    fill={color}
                    textAnchor="middle"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
            {review.unresolved?.map((edge, i) => {
              const mapped = transformBoundary(
                [edge],
                (p) => [
                  (p[0] - scene!.minX) * scene!.factor + 50,
                  (scene!.maxY - p[1]) * scene!.factor + 50,
                ],
                scene!.factor,
                true,
              );
              return (
                <path
                  key={`unresolved-${i}`}
                  d={boundaryPath(mapped).replace(/ Z$/, "")}
                  fill="none"
                  stroke="#ffa94d"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                >
                  <title>Unresolved edge — not included in any surface</title>
                </path>
              );
            })}
          </svg>
        )}
        {!!review.unresolved?.length && (
          <p className="help">
            Orange dashed edges are unresolved and not included in any area.
            Review them before approving.
          </p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          I verified the drawing units, selected the intended surface regions,
          confirmed their categories, and reviewed processing warnings. Imported
          measurements still require final project review.
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="heading-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!unit || !selected.length || !confirmed}
            onClick={() => {
              try {
                onImport(importDxf(adjusted, unit as DxfUnit, selected));
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
