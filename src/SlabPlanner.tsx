import { useState } from "react";
import {
  type Project,
  type Piece,
  physicalEdges,
  isApproved,
  sqft,
  category,
} from "./engine";
import { boundaryPath } from "./cad-curves";
import {
  type SlabSettings,
  type SlabLayout,
  defaultSlabSettings,
  planSlabs,
} from "./slab-planner";
function Outline({ piece }: { piece: Piece }) {
  try {
    return (
      <path
        d={boundaryPath(physicalEdges(piece))}
        fill="#3e8b7155"
        stroke="#244e3e"
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
    );
  } catch {
    return null;
  }
}
export default function SlabPlanner({
  project,
  onChange,
}: {
  project: Project;
  onChange: (s: SlabSettings) => void;
}) {
  const settings = project.slabSettings || defaultSlabSettings();
  const [result, setResult] = useState<{
      key: string;
      layout: SlabLayout;
    } | null>(null),
    [error, setError] = useState("");
  const key = JSON.stringify({
    pieces: project.pieces,
    placement: project.placement,
    settings,
  });
  const layout = result?.key === key ? result.layout : null;
  const set = (patch: Partial<SlabSettings>) => {
    onChange({ ...settings, ...patch });
    setError("");
  };
  return (
    <section className="slab-planner">
      <div className="eyebrow">PRELIMINARY MATERIAL PLANNING</div>
      <h2>Plan your slabs</h2>
      <p>
        Enter actual slab dimensions in inches. This simplified planner reserves
        a rectangular envelope around every piece and tries several layouts with
        optional 90° rotation. It does not guarantee the minimum number of slabs
        or perform true irregular-shape nesting.
      </p>
      <div className="slab-settings">
        <label>
          Slab length (inches)
          <input
            value={settings.length}
            placeholder="e.g. 126"
            onChange={(e) => set({ length: e.target.value })}
          />
        </label>
        <label>
          Slab width (inches)
          <input
            value={settings.width}
            placeholder="e.g. 63"
            onChange={(e) => set({ width: e.target.value })}
          />
        </label>
        <label>
          Spacing between pieces (inches)
          <input
            value={settings.gap}
            placeholder="0 — no allowance"
            onChange={(e) => set({ gap: e.target.value })}
          />
        </label>
        <label>
          Edge trim per side (inches)
          <input
            value={settings.margin}
            placeholder="0 — no allowance"
            onChange={(e) => set({ margin: e.target.value })}
          />
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.allowRotation}
          onChange={(e) => set({ allowRotation: e.target.checked })}
        />{" "}
        Allow 90° rotation. Turn off or lock individual pieces for directional
        grain.
      </label>
      <div className="selection-toolbar">
        <button onClick={() => set({ excludedIds: [] })}>
          Select all pieces
        </button>
        <button
          onClick={() => set({ excludedIds: project.pieces.map((p) => p.id) })}
        >
          Clear pieces
        </button>
      </div>
      <div className="slab-pieces">
        {project.pieces.map((p) => (
          <div key={p.id} className="slab-piece-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!settings.excludedIds.includes(p.id)}
                onChange={(e) =>
                  set({
                    excludedIds: e.target.checked
                      ? settings.excludedIds.filter((id) => id !== p.id)
                      : [...settings.excludedIds, p.id],
                  })
                }
              />
              {p.name} · {category(p)} · quantity {p.quantity}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.rotationLockedIds.includes(p.id)}
                onChange={(e) =>
                  set({
                    rotationLockedIds: e.target.checked
                      ? [...settings.rotationLockedIds, p.id]
                      : settings.rotationLockedIds.filter((id) => id !== p.id),
                  })
                }
              />{" "}
              Lock rotation
            </label>
          </div>
        ))}
      </div>
      <p className="help">
        Use actual fabrication pieces from one material/thickness batch, not
        overlapping calculation shapes. Countertops, splashes, waterfalls, and
        quantities are included unless unchecked. No vein matching, seam design,
        defects, remnants, tool paths, or cutting sequence is modeled. Spacing
        is a planning allowance, not a calibrated saw-kerf simulation.
      </p>
      <button
        className="primary"
        onClick={() => {
          try {
            setResult({ key, layout: planSlabs(project, settings) });
            setError("");
          } catch (e) {
            setError((e as Error).message);
            setResult(null);
          }
        }}
      >
        Calculate slab layout
      </button>
      {error && (
        <p role="alert" className="validation">
          {error}
        </p>
      )}
      {result && !layout && (
        <p role="status" className="notice">
          The pieces or settings changed. Recalculate the layout.
        </p>
      )}
      {layout && (
        <>
          <div className="slab-summary" aria-live="polite">
            <strong>
              {layout.slabs.length}{" "}
              {layout.slabs.length === 1 ? "slab" : "slabs"}{" "}
              {layout.complete ? "in this layout" : "used so far — incomplete"}
            </strong>
            <span>{sqft(layout.actualArea)} sq ft of selected material</span>
            <span>Area-only lower bound: {layout.areaLowerBound} slabs</span>
            <span>
              {isApproved(project)
                ? "Measurements approved; slab layout remains preliminary."
                : "Unapproved project — draft layout."}
            </span>
          </div>
          {layout.unplaced.length > 0 && (
            <div role="alert" className="dxf-warnings">
              <strong>
                Incomplete plan: these pieces do not fit the usable slab size
                with their rotation rules.
              </strong>
              <ul>
                {layout.unplaced.map((p) => (
                  <li key={p.id}>
                    {p.name}: {p.width.toFixed(2)} × {p.height.toFixed(2)} in
                  </li>
                ))}
              </ul>
              <p>The displayed slab count does not cover the full job.</p>
            </div>
          )}
          {layout.slabs.map((slab, i) => {
            const used = slab.parts.reduce((s, p) => s + p.area, 0);
            return (
              <article className="slab-sheet" key={i}>
                <h3>
                  Slab {i + 1}{" "}
                  <small>
                    {layout.length} × {layout.width} in ·{" "}
                    {((100 * used) / (layout.length * layout.width)).toFixed(1)}
                    % material utilization
                  </small>
                </h3>
                <svg
                  viewBox={`-4 -4 ${layout.length + 8} ${layout.width + 8}`}
                  role="img"
                  aria-label={`Slab ${i + 1} layout`}
                >
                  <rect
                    width={layout.length}
                    height={layout.width}
                    fill="#f4f0e6"
                    stroke="#a5a28f"
                    strokeWidth={0.6}
                  />
                  <rect
                    x={layout.margin}
                    y={layout.margin}
                    width={layout.length - 2 * layout.margin}
                    height={layout.width - 2 * layout.margin}
                    fill="none"
                    stroke="#a7b79b"
                    strokeWidth={0.4}
                    strokeDasharray="2 1"
                  />
                  {slab.parts.map((p, index) => {
                    const piece = project.pieces.find(
                      (item) => item.id === p.pieceId,
                    )!;
                    return (
                      <g key={p.id}>
                        <title>
                          {p.name} · {p.rotation}° · envelope{" "}
                          {p.placedWidth.toFixed(2)} ×{" "}
                          {p.placedHeight.toFixed(2)} in
                        </title>
                        <rect
                          x={p.x}
                          y={p.y}
                          width={p.placedWidth}
                          height={p.placedHeight}
                          fill="#dce7d755"
                          stroke="#8ca480"
                          strokeWidth={0.4}
                          strokeDasharray="1 1"
                        />
                        <g
                          transform={
                            p.rotation
                              ? `translate(${p.x + p.height} ${p.y}) rotate(90) translate(${-p.minX} ${-p.minY})`
                              : `translate(${p.x - p.minX} ${p.y - p.minY})`
                          }
                        >
                          <Outline piece={piece} />
                        </g>
                        <text
                          x={p.x + 1}
                          y={p.y + Math.min(p.placedHeight / 2, 4)}
                          fontSize={Math.max(
                            1.5,
                            Math.min(2.6, layout.length / 55),
                          )}
                          fill="#244e3e"
                        >
                          {index + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <ol className="slab-legend">
                  {slab.parts.map((p) => (
                    <li key={p.id}>
                      {p.name} · {p.rotation}° · {p.placedWidth.toFixed(2)} ×{" "}
                      {p.placedHeight.toFixed(2)} in envelope
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
          <p className="help">
            Dashed rectangles reserve material; solid outlines show the actual
            pieces. Space inside irregular envelopes is not reused. Offcuts
            outside placed envelopes are not saved as reusable stock. This is a
            suggested layout for review, not a fabrication-ready cutting plan.
          </p>
        </>
      )}
    </section>
  );
}
