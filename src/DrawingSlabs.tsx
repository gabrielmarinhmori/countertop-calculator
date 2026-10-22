import { Lock, Unlock } from "lucide-react";
import { useState, useEffect } from "react";
import { type Project, inches } from "./engine";
import { addDrawingSlab, type DrawingSlab } from "./drawing-slabs";
export default function DrawingSlabs({
  project,
  drawingId,
  onChange,
  onError,
  selected,
  onSelect,
}: {
  project: Project;
  drawingId: string;
  onChange: (p: Project) => void;
  onError: (s: string) => void;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [length, setLength] = useState("126"),
    [width, setWidth] = useState("63");
  return (
    <section className="drawing-slabs" aria-label="Drawing slabs">
      <div className="slab-add-form">
        <label>
          Slab length (inches)
          <input value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <label>
          Slab width (inches)
          <input value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <button
          onClick={() => {
            try {
              onChange(addDrawingSlab(project, drawingId, length, width));
              onError("");
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Add drawing slab
        </button>
      </div>
      <p className="help">
        Gray slabs stay behind pieces. Drag their background to position them.
        Slabs do not add to surface area, cutting or polishing totals.
      </p>
      {(project.drawingSlabs || [])
        .filter((s) => s.drawingId === drawingId)
        .map((s, i) => (
          <SlabRow
            key={s.id}
            slab={s}
            number={i + 1}
            active={selected === s.id}
            onSelect={() => onSelect(s.id)}
            onRename={(name) =>
              onChange({
                ...project,
                drawingSlabs: project.drawingSlabs!.map((other) =>
                  other.id === s.id ? { ...other, name } : other,
                ),
              })
            }
            onLock={() =>
              onChange({
                ...project,
                drawingSlabs: project.drawingSlabs!.map((other) =>
                  other.id === s.id
                    ? { ...other, locked: !other.locked }
                    : other,
                ),
              })
            }
            onDelete={() =>
              onChange({
                ...project,
                drawingSlabs: project.drawingSlabs!.filter(
                  (other) => other.id !== s.id,
                ),
              })
            }
            onUpdate={(length, width) => {
              try {
                inches(length);
                inches(width);
                onChange({
                  ...project,
                  drawingSlabs: project.drawingSlabs!.map((other) =>
                    other.id === s.id ? { ...other, length, width } : other,
                  ),
                });
                onError("");
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          />
        ))}
    </section>
  );
}
function SlabRow({
  slab,
  number,
  active,
  onSelect,
  onDelete,
  onUpdate,
  onRename,
  onLock,
}: {
  slab: DrawingSlab;
  number: number;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (l: string, w: string) => void;
  onRename: (name: string) => void;
  onLock: () => void;
}) {
  const [length, setLength] = useState(slab.length),
    [width, setWidth] = useState(slab.width);
  useEffect(() => {
    setLength(slab.length);
    setWidth(slab.width);
  }, [slab.length, slab.width]);
  return (
    <div className={`drawing-slab-row ${active ? "active" : ""}`}>
      <button onClick={onSelect}>{slab.name || `Slab ${number}`}</button>
      <button
        aria-label={`${slab.locked ? "Unlock" : "Lock"} slab ${number}`}
        aria-pressed={!!slab.locked}
        onClick={onLock}
      >
        {slab.locked ? <Lock size={16} /> : <Unlock size={16} />}
      </button>
      <label>
        Slab {number} name
        <input
          key={slab.name}
          defaultValue={slab.name || `Slab ${number}`}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== slab.name) onRename(name);
            else if (!name) e.target.value = slab.name || `Slab ${number}`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label>
        Slab {number} length
        <input value={length} onChange={(e) => setLength(e.target.value)} />
      </label>
      <label>
        Slab {number} width
        <input value={width} onChange={(e) => setWidth(e.target.value)} />
      </label>
      <button onClick={() => onUpdate(length, width)}>
        Update slab {number}
      </button>
      <button onClick={onDelete}>Delete slab {number}</button>
    </div>
  );
}
