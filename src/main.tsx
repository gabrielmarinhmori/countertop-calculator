import SlabPlanner from "./SlabPlanner";
import {
  drawingEdges,
  linkedDrawingEdge,
  linkedDrawingPanel,
  annotationFrame,
  panelLabelPoint,
} from "./annotations";
import { boundaryPath } from "./cad-curves";
import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowLeft,
  ArrowUpRight,
  LayoutDashboard,
  Layers,
  Upload,
  Check,
  FileDown,
  Trash2,
  Copy,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MousePointer2,
  PenTool,
  Download,
  FolderOpen,
  Ruler,
  CheckCircle2,
  AlertCircle,
  Move,
  ChevronRight,
  Square,
  PanelTop,
} from "lucide-react";
import {
  type Project,
  type Piece,
  type Shape,
  type Point,
  makeProject,
  makePiece,
  inches,
  pieceArea,
  geometry,
  sqft,
  totals,
  linearCut,
  issues,
  fingerprint,
  isApproved,
  category,
  createEdgeBacksplash,
  refreshEdgeBacksplashes,
  changePieceSurface,
} from "./engine";
import { listProjects, saveProject, deleteProject } from "./storage";
import { importDrawing } from "./files";
import { download, exportReport, dimensions } from "./reports";
import "./style.css";
import { type DxfReview } from "./dxf";
import { readDxf } from "./dxf-client";
import { DxfImport } from "./DxfImport";
const shapes: Shape[] = [
  "Straight",
  "L-shape",
  "U-shape",
  "Island",
  "Peninsula",
  "Polygon",
  "Backsplash",
  "Waterfall",
];
const safeArea = (p: Piece) => {
  try {
    return sqft(pieceArea(p));
  } catch {
    return "—";
  }
};
export default function App() {
  const [splashHeight, setSplashHeight] = useState("");
  const [choosingSplashEdge, setChoosingSplashEdge] = useState(false);
  const [dxfReview, setDxfReview] = useState<DxfReview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [selected, setSelected] = useState(""),
    [drawingId, setDrawingId] = useState(""),
    [tab, setTab] = useState("Workspace"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [scale, setScale] = useState(1),
    [pan, setPan] = useState<Point>([0, 0]),
    [tool, setTool] = useState<"select" | "pan" | "polygon" | "calibrate">(
      "select",
    ),
    [calibration, setCalibration] = useState<Point[]>([]),
    [knownDistance, setKnownDistance] = useState(""),
    [adding, setAdding] = useState(false),
    [saved, setSaved] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null),
    svgRef = useRef<SVGSVGElement>(null),
    saveQueue = useRef(Promise.resolve()),
    drag = useRef<{ index: number; start: Point; origin: Point } | null>(null);
  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() =>
        setError(
          "Browser storage could not be opened. Enable storage to use this app.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  function persist(p: Project) {
    setSaved(false);
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(p))
      .then(() => {
        setSaved(true);
        setProjects((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
      })
      .catch(() => {
        setSaved(false);
        setError(
          "Could not save. Browser storage may be full. Download a backup before leaving.",
        );
      });
  }
  function edit(next: Project) {
    next = refreshEdgeBacksplashes(next);
    const p = {
      ...next,
      updated: new Date().toISOString(),
      approved: undefined,
    };
    setProject(p);
    persist(p);
  }
  function patchPiece(patch: Partial<Piece>) {
    if (!project) return;
    if (
      project.pieces.find((p) => p.id === selected)?.boundary &&
      patch.points
    ) {
      setError(
        "Curved CAD boundaries preserve circular arcs. Edit the source CAD drawing and reimport; polygon editing would remove the curves.",
      );
      return;
    }
    edit({
      ...project,
      pieces: project.pieces.map((p) =>
        p.id === selected ? { ...p, ...patch } : p,
      ),
    });
  }
  function renamePiece(p: Piece) {
    if (!project) return;
    const name = prompt("Piece name", p.name);
    if (name?.trim())
      edit({
        ...project,
        pieces: project.pieces.map((item) =>
          item.id === p.id ? { ...item, name: name.trim() } : item,
        ),
      });
  }
  function open(p: Project) {
    setChoosingSplashEdge(false);
    setProject(p);
    setSelected(p.pieces[0]?.id || "");
    setDrawingId(p.drawings[0]?.id || "");
    setTab("Workspace");
    setScale(1);
    setPan([0, 0]);
    setError("");
  }
  function create() {
    const p = makeProject("Untitled kitchen");
    persist(p);
    open(p);
  }
  function demo() {
    const p = makeProject("The Oakwood kitchen");
    const a = makePiece("L-shape");
    Object.assign(a, {
      name: "Main kitchen run",
      length: "120",
      width: "72",
      left: "25 1/2",
      back: "25 1/2",
      defaultConfirmed: true,
    });
    const b = makePiece("Island");
    Object.assign(b, {
      name: "Kitchen island",
      length: "84",
      width: "42",
      annotation: [360, 220],
    });
    const c = makePiece("Backsplash");
    Object.assign(c, {
      name: "Range backsplash",
      length: "96",
      width: "4",
      annotation: [80, 420],
    });
    p.pieces = [a, b, c];
    p.placement = "separate";
    p.placementConfirmed = true;
    persist(p);
    open(p);
  }
  const piece = project?.pieces.find((p) => p.id === selected);
  const drawing = project?.drawings.find((d) => d.id === drawingId);
  useEffect(() => setChoosingSplashEdge(false), [project?.id, tab]);
  useEffect(() => {
    if (!choosingSplashEdge) return;
    const stop = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChoosingSplashEdge(false);
    };
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [choosingSplashEdge]);
  const splashEdges =
    choosingSplashEdge && project
      ? project.pieces
          .filter(
            (p) =>
              p.drawingId === drawingId &&
              category(p) === "horizontal" &&
              !p.edgeSource,
          )
          .flatMap((p) => {
            try {
              return drawingEdges(p).map((edge, index) => ({
                edge,
                index,
                pieceId: p.id,
                name: p.name,
              }));
            } catch {
              return [];
            }
          })
      : [];
  function addSplashEdge(pieceId: string, index: number) {
    if (!project) return;
    try {
      const panel = createEdgeBacksplash(project, pieceId, index, splashHeight);
      edit({ ...project, pieces: [...project.pieces, panel] });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const approved = project ? isApproved(project) : false;
  const problems = project ? issues(project) : [];
  let summary: ReturnType<typeof totals> | null = null;
  try {
    if (project) summary = totals(project);
  } catch {
    /* missing dimensions are shown in the editor */
  }
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!project || !files) return;
    await task(async () => {
      if (Array.from(files).some((f) => /\.dxf$/i.test(f.name))) {
        if (files.length !== 1)
          throw Error(
            "Import one DXF at a time, separately from images and PDFs.",
          );
        const file = files[0];
        if (file.size > 10 * 1024 * 1024)
          throw Error("DXF must be smaller than 10 MB.");
        setDxfReview(await readDxf(await file.text(), file.name));
        return;
      }
      const result = [];
      for (const file of Array.from(files))
        result.push(...(await importDrawing(file)));
      edit({ ...project, drawings: [...project.drawings, ...result] });
      setDrawingId(result[0]?.id || drawingId);
    });
  }
  function add(shape: Shape) {
    if (!project) return;
    const p = makePiece(shape, drawingId);
    p.annotation = [
      80 + (project.pieces.length % 3) * 260,
      80 + Math.floor(project.pieces.length / 3) * 200,
    ];
    edit({ ...project, pieces: [...project.pieces, p] });
    setSelected(p.id);
    setAdding(false);
    if (shape === "Polygon") setTool("polygon");
  }
  function svgPoint(e: React.PointerEvent<SVGElement>): Point {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
    return [(pt.x - pan[0]) / scale, (pt.y - pan[1]) / scale];
  }
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const pt = svgPoint(e);
    if (tool === "pan") {
      drag.current = { index: -2, start: [e.clientX, e.clientY], origin: pan };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (tool === "calibrate") {
      setCalibration((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
    } else if (tool === "polygon" && piece?.shape === "Polygon") {
      patchPiece({ points: [...piece.points, pt], scaleConfirmed: false });
    }
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.index === -2) {
      const rect = e.currentTarget.getBoundingClientRect();
      setPan([
        d.origin[0] + ((e.clientX - d.start[0]) * viewWidth) / rect.width,
        d.origin[1] + ((e.clientY - d.start[1]) * viewHeight) / rect.height,
      ]);
    } else if (piece) {
      const pt = svgPoint(e);
      if (d.index === -1)
        patchPiece({
          annotation: [
            d.origin[0] + pt[0] - d.start[0],
            d.origin[1] + pt[1] - d.start[1],
          ],
        });
      else
        patchPiece({
          points: piece.points.map((p, i) => (i === d.index ? pt : p)),
          scaleConfirmed: false,
        });
    }
  }
  const frame = project
    ? annotationFrame(
        project,
        drawingId,
        drawing?.width || 1000,
        drawing?.height || 650,
      )
    : { x: 0, y: 0, width: 1000, height: 650 };
  const viewWidth = frame.width,
    viewHeight = frame.height;
  return (
    <div className="app">
      <aside className="rail">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setProject(null);
          }}
        >
          <span className="brand-icon">
            <PanelTop size={24} />
          </span>
          <span>
            countertop<span className="brand-sub">CALCULATOR</span>
          </span>
        </a>
        <div className="rail-caption">YOUR WORKSPACE</div>
        <button
          className={!project ? "nav active" : "nav"}
          onClick={() => setProject(null)}
        >
          <LayoutDashboard size={19} /> Projects
        </button>
        {project && (
          <>
            <div className="rail-caption">CURRENT PROJECT</div>
            {["Workspace", "Slab planning", "Review & approve"].map((s, i) => (
              <button
                key={s}
                className={`nav ${tab === s ? "active" : ""}`}
                onClick={() => setTab(s)}
              >
                {s === "Workspace" ? (
                  <Layers size={19} />
                ) : s === "Slab planning" ? (
                  <PanelTop size={19} />
                ) : s === "Review & approve" ? (
                  <CheckCircle2 size={19} />
                ) : (
                  <FileDown size={19} />
                )}{" "}
                {s}
              </button>
            ))}
          </>
        )}
        <div className="rail-bottom">
          <span className="local-dot" /> Local & private
          <div>Your drawings stay in this browser.</div>
          <div className="avatar">CC</div>
          <strong>Personal workspace</strong>
          <small>No account required</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            {project ? project.name : "Projects"}
          </span>
          <button
            className="lock-button"
            onClick={() => window.dispatchEvent(new Event("countertop-lock"))}
          >
            Lock workspace
          </button>
          <span className="topnote">
            <span className="local-dot" />
            {saved ? "Saved on this device" : "Saving…"}
          </span>
        </header>
        {error && (
          <div className="error" role="alert">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {busy && (
          <div className="notice" role="status">
            Processing your file…
          </div>
        )}
        {!project ? (
          <div className="dashboard">
            <div className="eyebrow">MEASURE WITH CONFIDENCE</div>
            <div className="page-heading">
              <div>
                <h1>
                  Your projects<span className="dot">.</span>
                </h1>
                <p>From the first drawing to the final square foot.</p>
              </div>
              <button className="primary" onClick={create}>
                <Plus size={18} /> New project
              </button>
            </div>
            <section className="welcome">
              <div>
                <span className="tag">PRECISION, WITHOUT THE GUESSWORK</span>
                <h2>
                  Every detail.
                  <br />
                  Every square foot.
                </h2>
                <p>
                  A clear workspace for your countertop measurements.
                  <br />
                  Upload a plan, define your pieces, and approve your estimate.
                </p>
                <button onClick={demo}>
                  Explore a sample project <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="hero-plan" aria-hidden="true">
                <div className="plan-grid" />
                <svg viewBox="0 0 420 260">
                  <path
                    d="M65 55H335V110H125V220H65Z"
                    fill="#e7eee3"
                    stroke="#275247"
                    strokeWidth="2"
                  />
                  <path
                    d="M185 155H335V220H185Z"
                    fill="#c8d8c2"
                    stroke="#275247"
                    strokeWidth="2"
                  />
                  <path
                    d="M65 34H335M43 55V220"
                    stroke="#648173"
                    strokeDasharray="3 3"
                  />
                  <text x="177" y="25">
                    120″
                  </text>
                  <text x="14" y="142" transform="rotate(-90 14 142)">
                    72″
                  </text>
                  <text x="222" y="190">
                    ISLAND
                  </text>
                  <rect
                    x="217"
                    y="65"
                    width="60"
                    height="30"
                    rx="5"
                    fill="none"
                    stroke="#648173"
                  />
                  <circle cx="247" cy="80" r="3" fill="#648173" />
                </svg>
                <span className="plan-badge">
                  <Check size={14} /> Built on real measurements
                </span>
              </div>
            </section>
            <div className="section-heading">
              <h2>
                Recent projects <span>{projects.length}</span>
              </h2>
              <button
                className="text-button"
                onClick={() => backupInput.current?.click()}
              >
                <Upload size={15} /> Restore backup
              </button>
            </div>
            <div className="project-grid">
              {projects.map((p) => (
                <article className="project-card" key={p.id}>
                  <button className="card-open" onClick={() => open(p)}>
                    <div className="card-preview">
                      <svg viewBox="0 0 260 115">
                        <path
                          d="M43 24H210V53H80V94H43Z"
                          fill="#dfe9df"
                          stroke="#6a8d7a"
                        />
                        <path
                          d="M130 71H210V94H130Z"
                          fill="#d7e1d5"
                          stroke="#6a8d7a"
                        />
                      </svg>
                      <span
                        className={`status ${isApproved(p) ? "approved" : ""}`}
                      >
                        {isApproved(p) ? "Approved" : "Draft"}
                      </span>
                    </div>
                    <div className="card-body">
                      <h3>{p.name}</h3>
                      <p>
                        {p.pieces.length} pieces <span>·</span>{" "}
                        {p.drawings.length} drawing pages
                      </p>
                      <div className="card-foot">
                        Edited {new Date(p.updated).toLocaleDateString()}
                        <ArrowUpRight size={18} />
                      </div>
                    </div>
                  </button>
                  <div className="card-actions">
                    <button
                      aria-label={`Rename ${p.name}`}
                      onClick={() => {
                        const name = prompt("Project name", p.name);
                        if (name?.trim())
                          persist({ ...p, name, approved: undefined });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      title="Duplicate"
                      onClick={() => {
                        const copy = {
                          ...structuredClone(p),
                          id: crypto.randomUUID(),
                          name: p.name + " copy",
                          approved: undefined,
                        };
                        persist(copy);
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      title="Delete project"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete “${p.name}” and its drawings from this browser?`,
                          )
                        )
                          void task(async () => {
                            await deleteProject(p.id);
                            setProjects((prev) =>
                              prev.filter((x) => x.id !== p.id),
                            );
                          });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
              <button className="new-card" onClick={create}>
                <span>
                  <Plus size={25} />
                </span>
                <strong>Create a new project</strong>
                <small>Start with a drawing or measurements</small>
              </button>
            </div>
            {loading && <p>Loading saved projects…</p>}
            <div className="storage-note">
              <FolderOpen size={20} />
              <div>
                <strong>A workspace that stays yours.</strong>
                <p>
                  Projects are stored only in this browser, on this device. They
                  do not sync. Export backups regularly; clearing browser data
                  removes saved projects.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="project-page">
            <div className="project-heading">
              <div>
                <button className="back" onClick={() => setProject(null)}>
                  <ArrowLeft size={14} /> All projects
                </button>
                <input
                  className="project-title"
                  aria-label="Project name"
                  value={project.name}
                  onChange={(e) => edit({ ...project, name: e.target.value })}
                />
                <div className="subtitle">
                  <span className={`status ${approved ? "approved" : ""}`}>
                    {approved ? "Approved snapshot" : "Unapproved draft"}
                  </span>
                  <span>All measurements in inches</span>
                </div>
              </div>
              <div className="heading-actions">
                <button
                  onClick={() =>
                    download(
                      new Blob([JSON.stringify(project)], {
                        type: "application/json",
                      }),
                      "countertop-project.json",
                    )
                  }
                >
                  <Download size={16} /> Backup
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    approved
                      ? void task(() => exportReport(project))
                      : setTab("Review & approve")
                  }
                >
                  <FileDown size={16} /> Export PDF
                </button>
              </div>
            </div>
            {tab === "Workspace" ? (
              <>
                <div className="workspace">
                  <section className="drawing-section">
                    <div className="panel-heading">
                      <div>
                        <Layers size={17} />
                        <strong>Drawing workspace</strong>
                      </div>
                      <button onClick={() => fileInput.current?.click()}>
                        <Upload size={15} /> Upload drawing
                      </button>
                    </div>
                    <div className="drawing-controls">
                      <select
                        aria-label="Active drawing"
                        value={drawingId}
                        onChange={(e) => {
                          setDrawingId(e.target.value);
                          setScale(1);
                          setPan([0, 0]);
                        }}
                      >
                        <option value="">Manual schematic</option>
                        {project.drawings.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <div className="toolgroup">
                        <button
                          title="Select / move annotation"
                          className={tool === "select" ? "selected" : ""}
                          onClick={() => {
                            setChoosingSplashEdge(false);
                            setTool("select");
                          }}
                        >
                          <MousePointer2 size={17} />
                        </button>
                        <button
                          title="Pan"
                          className={tool === "pan" ? "selected" : ""}
                          onClick={() => {
                            setChoosingSplashEdge(false);
                            setTool("pan");
                          }}
                        >
                          <Move size={17} />
                        </button>
                        <button
                          title="Add polygon vertices"
                          className={tool === "polygon" ? "selected" : ""}
                          onClick={() => {
                            setChoosingSplashEdge(false);
                            setTool("polygon");
                          }}
                        >
                          <PenTool size={17} />
                        </button>
                        <button
                          title="Backsplash tool"
                          aria-pressed={choosingSplashEdge}
                          className={choosingSplashEdge ? "selected" : ""}
                          onClick={() => {
                            setTool("select");
                            setChoosingSplashEdge(true);
                            setCalibration([]);
                            setError("");
                          }}
                        >
                          <PanelTop size={17} />
                        </button>
                        <button
                          title="Calibrate drawing scale"
                          className={tool === "calibrate" ? "selected" : ""}
                          onClick={() => {
                            setChoosingSplashEdge(false);
                            setTool("calibrate");
                            setCalibration([]);
                          }}
                        >
                          <Ruler size={17} />
                        </button>
                      </div>
                    </div>
                    {choosingSplashEdge && (
                      <div
                        className="splash-toolbar"
                        role="region"
                        aria-label="Backsplash tool controls"
                      >
                        <label>
                          Backsplash height (inches)
                          <input
                            placeholder="e.g. 4 or 5 1/2"
                            value={splashHeight}
                            onChange={(e) => setSplashHeight(e.target.value)}
                          />
                        </label>
                        <button
                          className="primary"
                          onClick={() => setChoosingSplashEdge(false)}
                        >
                          OK
                        </button>
                        <p role="status">
                          Click highlighted edges on any measured countertop.
                          Keep adding until OK or Escape. Red strips show panel
                          height; curved edges show an unfolded panel. Review
                          panels already present to avoid counting them twice.
                        </p>
                      </div>
                    )}
                    <div className="canvas-wrap">
                      <svg
                        ref={svgRef}
                        viewBox={`${frame.x} ${frame.y} ${viewWidth} ${viewHeight}`}
                        aria-label="Interactive drawing annotations"
                        onPointerDown={pointerDown}
                        onPointerMove={pointerMove}
                        onPointerUp={() => {
                          drag.current = null;
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                        }}
                        style={{ touchAction: "none" }}
                      >
                        <defs>
                          <pattern
                            id="grid"
                            width="25"
                            height="25"
                            patternUnits="userSpaceOnUse"
                          >
                            <path
                              d="M25 0H0V25"
                              fill="none"
                              stroke="#dce2dc"
                              strokeWidth=".7"
                            />
                          </pattern>
                        </defs>
                        <rect
                          width={viewWidth}
                          height={viewHeight}
                          fill="#f5f6f0"
                        />
                        <g
                          transform={`translate(${pan[0]},${pan[1]}) scale(${scale})`}
                        >
                          {drawing ? (
                            <image
                              href={drawing.data}
                              width={drawing.width}
                              height={drawing.height}
                            />
                          ) : (
                            <rect
                              width={viewWidth}
                              height={viewHeight}
                              fill="url(#grid)"
                            />
                          )}
                          {project.pieces
                            .filter((p) => p.drawingId === drawingId)
                            .map((p) => {
                              const attached = linkedDrawingEdge(project, p);
                              const panel = linkedDrawingPanel(project, p);
                              if (p.edgeSource && !attached) return null;
                              let pts: Point[];
                              let valid = true;
                              try {
                                pts = panel
                                  ? panel.boundary.map((e) => e.start)
                                  : p.shape === "Polygon"
                                    ? p.points
                                    : geometry(p).map(([x, y]) => [
                                        x * 2 + p.annotation[0],
                                        y * 2 + p.annotation[1],
                                      ]);
                                pieceArea(p);
                              } catch {
                                valid = false;
                                pts =
                                  p.shape === "Polygon"
                                    ? p.points
                                    : [
                                        [p.annotation[0], p.annotation[1]],
                                        [
                                          p.annotation[0] + 180,
                                          p.annotation[1],
                                        ],
                                        [
                                          p.annotation[0] + 180,
                                          p.annotation[1] + 65,
                                        ],
                                        [p.annotation[0], p.annotation[1] + 65],
                                      ];
                              }
                              const labelPoint = panel
                                ? panelLabelPoint(panel)
                                : pts[0];
                              const color = !valid
                                ? "#b55745"
                                : p.defaultUsed && !p.defaultConfirmed
                                  ? "#b5882e"
                                  : category(p) === "backsplash"
                                    ? "#b75647"
                                    : category(p) === "waterfall"
                                      ? "#536fab"
                                      : "#25745d";
                              return (
                                <g
                                  key={p.id}
                                  onPointerDown={(e) => {
                                    if (tool !== "select") return;
                                    e.stopPropagation();
                                    setSelected(p.id);
                                    if (
                                      p.shape !== "Polygon" &&
                                      !p.edgeSource
                                    ) {
                                      drag.current = {
                                        index: -1,
                                        start: svgPoint(e),
                                        origin: p.annotation,
                                      };
                                      svgRef.current?.setPointerCapture(
                                        e.pointerId,
                                      );
                                    }
                                  }}
                                >
                                  {panel ? (
                                    <g>
                                      <path
                                        className="backsplash-panel"
                                        data-panel-kind={panel.kind}
                                        d={boundaryPath(panel.boundary)}
                                        fill={`${color}35`}
                                        stroke={color}
                                        strokeWidth={
                                          p.id === selected ? 3 : 1.5
                                        }
                                        vectorEffect="non-scaling-stroke"
                                      />
                                      {panel.connector && (
                                        <path
                                          d={`M${panel.connector[0].join(" ")} L${panel.connector[1].join(" ")}`}
                                          stroke={color}
                                          strokeDasharray="4 3"
                                          vectorEffect="non-scaling-stroke"
                                        />
                                      )}
                                    </g>
                                  ) : p.boundary ? (
                                    <path
                                      d={boundaryPath(p.boundary)}
                                      fill={`${color}28`}
                                      stroke={color}
                                      strokeWidth={p.id === selected ? 3 : 1.5}
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  ) : (
                                    <polygon
                                      points={pts
                                        .map((q) => q.join(","))
                                        .join(" ")}
                                      fill={`${color}28`}
                                      stroke={color}
                                      strokeWidth={p.id === selected ? 3 : 1.5}
                                      vectorEffect="non-scaling-stroke"
                                      strokeDasharray={
                                        !valid ? "6 4" : undefined
                                      }
                                    />
                                  )}
                                  {pts[0] && (
                                    <text
                                      x={labelPoint[0]}
                                      y={
                                        panel
                                          ? labelPoint[1]
                                          : Math.max(18, labelPoint[1] - 12)
                                      }
                                      textAnchor={panel ? "middle" : "start"}
                                      fontSize={Math.max(14, viewWidth / 65)}
                                      fill={color}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        renamePiece(p);
                                      }}
                                    >
                                      {p.name} · {safeArea(p)} sq ft
                                    </text>
                                  )}
                                  {valid &&
                                    !p.edgeSource &&
                                    p.shape !== "Polygon" &&
                                    pts[0] && (
                                      <text
                                        x={pts[0][0] + 8}
                                        y={pts[0][1] + 22}
                                        fontSize={Math.max(10, viewWidth / 90)}
                                        fill={color}
                                      >
                                        {dimensions(p)}
                                      </text>
                                    )}
                                  {p.shape === "Polygon" &&
                                    !p.boundary &&
                                    p.id === selected &&
                                    pts.map(([x, y], i) => (
                                      <circle
                                        key={i}
                                        cx={x}
                                        cy={y}
                                        r={Math.max(5, viewWidth / 180)}
                                        fill="white"
                                        stroke={color}
                                        strokeWidth={2}
                                        onDoubleClick={(e) => {
                                          e.stopPropagation();
                                          patchPiece({
                                            points: p.points.filter(
                                              (_, j) => j !== i,
                                            ),
                                            scaleConfirmed: false,
                                          });
                                        }}
                                        onPointerDown={(e) => {
                                          if (tool !== "select") return;
                                          e.stopPropagation();
                                          drag.current = {
                                            index: i,
                                            start: svgPoint(e),
                                            origin: [x, y],
                                          };
                                          svgRef.current?.setPointerCapture(
                                            e.pointerId,
                                          );
                                        }}
                                      />
                                    ))}
                                </g>
                              );
                            })}
                          {choosingSplashEdge &&
                            splashEdges.map(
                              ({ edge, index, pieceId, name }) => (
                                <path
                                  key={`splash-edge-${pieceId}-${index}`}
                                  className="backsplash-edge-hit"
                                  d={boundaryPath([edge]).replace(/ Z$/, "")}
                                  fill="none"
                                  stroke="#d18435"
                                  strokeOpacity={0.35}
                                  strokeWidth={14}
                                  vectorEffect="non-scaling-stroke"
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Add backsplash to ${name}, edge ${index + 1}`}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addSplashEdge(pieceId, index);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      addSplashEdge(pieceId, index);
                                    }
                                  }}
                                >
                                  <title>
                                    Click to create backsplash on edge{" "}
                                    {index + 1}
                                  </title>
                                </path>
                              ),
                            )}
                          {calibration.length > 0 && (
                            <g stroke="#bc7437" fill="#bc7437">
                              {calibration.map(([x, y], i) => (
                                <circle key={i} cx={x} cy={y} r={5} />
                              ))}
                              {calibration.length === 2 && (
                                <line
                                  x1={calibration[0][0]}
                                  y1={calibration[0][1]}
                                  x2={calibration[1][0]}
                                  y2={calibration[1][1]}
                                  strokeWidth={3}
                                />
                              )}
                            </g>
                          )}
                        </g>
                      </svg>
                      {!project.pieces.length && (
                        <div className="canvas-empty">
                          <Ruler size={32} />
                          <h3>Your plan starts here</h3>
                          <p>
                            Upload a drawing, or add your first piece
                            <br />
                            to work from manual measurements.
                          </p>
                          <button onClick={() => setAdding(true)}>
                            <Plus size={16} /> Add a piece
                          </button>
                        </div>
                      )}
                      <div className="zoom">
                        <button
                          title="Zoom out"
                          onClick={() =>
                            setScale((s) => Math.max(0.25, s / 1.25))
                          }
                        >
                          <ZoomOut size={16} />
                        </button>
                        <span>{Math.round(scale * 100)}%</span>
                        <button
                          title="Zoom in"
                          onClick={() => setScale((s) => Math.min(8, s * 1.25))}
                        >
                          <ZoomIn size={16} />
                        </button>
                        <button
                          title="Reset view"
                          onClick={() => {
                            setScale(1);
                            setPan([0, 0]);
                          }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="canvas-caption">
                      <span className="local-dot" />
                      {drawing
                        ? "Original drawing · annotations stay aligned"
                        : "Illustrative schematic · not a measured drawing scale"}
                    </div>
                    {tool === "calibrate" && (
                      <div className="calibration">
                        <strong>Set a physical scale</strong>
                        <p>
                          Click the two ends of a known measurement on the
                          drawing. Use only a flat, undistorted, uniformly
                          scaled plan.
                        </p>
                        <label>
                          Known distance (inches)
                          <input
                            value={knownDistance}
                            onChange={(e) => setKnownDistance(e.target.value)}
                            placeholder="e.g. 96"
                          />
                        </label>
                        <button
                          disabled={
                            calibration.length !== 2 ||
                            !piece ||
                            piece.shape !== "Polygon"
                          }
                          onClick={() =>
                            void task(async () => {
                              const distance = Math.hypot(
                                calibration[1][0] - calibration[0][0],
                                calibration[1][1] - calibration[0][1],
                              );
                              if (!distance)
                                throw Error("Choose two distinct points.");
                              patchPiece({
                                scale: inches(knownDistance)
                                  .div(distance)
                                  .toString(),
                                scaleConfirmed: false,
                              });
                              setTool("select");
                            })
                          }
                        >
                          Apply scale to selected polygon
                        </button>
                      </div>
                    )}
                  </section>
                  <aside className="editor">
                    <div className="panel-heading">
                      <strong>
                        Countertop pieces{" "}
                        <span className="count">{project.pieces.length}</span>
                      </strong>
                      <button
                        title="Add piece"
                        onClick={() => setAdding(!adding)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {adding && (
                      <div className="shape-menu">
                        {shapes.map((s) => (
                          <button key={s} onClick={() => add(s)}>
                            <Plus size={14} />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="piece-list">
                      {project.pieces.map((p) => (
                        <button
                          key={p.id}
                          className={`piece-row ${selected === p.id ? "active" : ""}`}
                          onClick={() => {
                            setSelected(p.id);
                            setDrawingId(p.drawingId);
                          }}
                        >
                          <span className="piece-symbol">
                            <Square size={17} />
                          </span>
                          <span>
                            <strong
                              title="Double-click to rename"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                renamePiece(p);
                              }}
                            >
                              {p.name}
                            </strong>
                            <small>
                              {p.shape} · {safeArea(p)} sq ft
                            </small>
                          </span>
                          <span
                            className={`measure-state ${safeArea(p) === "—" ? "missing" : p.defaultUsed && !p.defaultConfirmed ? "review" : ""}`}
                            title={
                              safeArea(p) === "—"
                                ? "Missing or invalid measurements"
                                : p.defaultUsed && !p.defaultConfirmed
                                  ? "Review default depth"
                                  : "Valid geometry"
                            }
                          />
                        </button>
                      ))}
                      {!project.pieces.length && (
                        <p className="empty-text">
                          Add a piece to enter dimensions.
                        </p>
                      )}
                    </div>
                    {piece && (
                      <div className="dimension-editor">
                        <div className="section-label">
                          PIECE DETAILS{" "}
                          <button
                            title="Delete piece"
                            onClick={() => {
                              if (confirm(`Delete ${piece.name}?`))
                                edit({
                                  ...project,
                                  pieces: project.pieces.filter(
                                    (p) => p.id !== piece.id,
                                  ),
                                });
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <label>
                          Surface category
                          <select
                            aria-label="Surface category"
                            value={category(piece)}
                            onChange={(e) => {
                              try {
                                edit(
                                  changePieceSurface(
                                    project,
                                    piece.id,
                                    e.target.value as
                                      "horizontal" | "backsplash" | "waterfall",
                                  ),
                                );
                                setError("");
                              } catch (error) {
                                setError((error as Error).message);
                              }
                            }}
                          >
                            <option value="horizontal">Countertop</option>
                            <option value="backsplash">
                              Back / side splash
                            </option>
                            <option value="waterfall">Waterfall</option>
                          </select>
                        </label>
                        <p className="help">
                          Changing category updates the totals and requires a
                          new review. Converting a linked vertical panel to
                          countertop makes it independent.
                        </p>
                        <label>
                          Piece name
                          <input
                            value={piece.name}
                            onChange={(e) =>
                              patchPiece({ name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Drawing reference
                          <select
                            value={piece.drawingId}
                            disabled={!!piece.edgeSource}
                            onChange={(e) => {
                              patchPiece({
                                drawingId: e.target.value,
                                points: [],
                                scaleConfirmed: false,
                              });
                              setDrawingId(e.target.value);
                            }}
                          >
                            <option value="">Manual schematic</option>
                            {project.drawings.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {piece.shape === "Polygon" ? (
                          <>
                            <p className="help">
                              Use the pen tool to place vertices in order.
                              Select to drag vertices; double-click a vertex to
                              remove it. Pixel coordinates alone cannot
                              establish area.
                            </p>
                            <button
                              disabled={!!piece.boundary}
                              onClick={() => {
                                setChoosingSplashEdge(false);
                                setTool("polygon");
                              }}
                            >
                              <PenTool size={14} /> Draw polygon
                            </button>
                            <button
                              disabled={!!piece.boundary}
                              onClick={() =>
                                patchPiece({
                                  points: [],
                                  scaleConfirmed: false,
                                })
                              }
                            >
                              Clear vertices
                            </button>
                            <label>
                              Verified scale (inches per image pixel)
                              <input
                                value={piece.scale}
                                onChange={(e) =>
                                  patchPiece({
                                    scale: e.target.value,
                                    scaleConfirmed: false,
                                  })
                                }
                              />
                            </label>
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={piece.scaleConfirmed}
                                onChange={(e) =>
                                  patchPiece({
                                    scaleConfirmed: e.target.checked,
                                  })
                                }
                              />{" "}
                              I verified this scale from a real measurement and
                              a uniformly scaled plan.
                            </label>
                            {piece.boundary && (
                              <p className="notice">
                                Circular CAD arcs are preserved analytically.
                                Edit curved boundaries in QCAD and reimport.
                                Category: {category(piece)}.
                              </p>
                            )}
                            <details>
                              <summary>
                                {piece.boundary
                                  ? "Inspect curve display coordinates (read-only)"
                                  : "Edit exact drawing coordinates"}
                              </summary>
                              {piece.points.map(([x, y], i) => (
                                <div className="field-grid" key={i}>
                                  {[x, y].map((v, j) => (
                                    <label key={j}>
                                      Vertex {i + 1} {j ? "Y" : "X"}
                                      <input
                                        type="number"
                                        value={v}
                                        readOnly={!!piece.boundary}
                                        onChange={(e) =>
                                          patchPiece({
                                            points: piece.points.map((pt, k) =>
                                              k === i
                                                ? (pt.map((n, a) =>
                                                    a === j
                                                      ? Number(e.target.value)
                                                      : n,
                                                  ) as Point)
                                                : pt,
                                            ),
                                            scaleConfirmed: false,
                                          })
                                        }
                                      />
                                    </label>
                                  ))}
                                </div>
                              ))}
                            </details>
                          </>
                        ) : (
                          <>
                            <div className="section-label">
                              DIMENSIONS <span>INCHES</span>
                            </div>
                            <div className="field-grid">
                              {[
                                ["length", "Length / overall X"],
                                [
                                  "width",
                                  piece.shape === "Backsplash" ||
                                  piece.shape === "Waterfall"
                                    ? "Height / face Y"
                                    : ["L-shape", "U-shape"].includes(
                                          piece.shape,
                                        )
                                      ? "Overall Y"
                                      : "Depth / width",
                                ],
                              ].map(([key, label]) => (
                                <label key={key}>
                                  {label}
                                  <input
                                    placeholder="Enter inches"
                                    value={piece[key as "length" | "width"]}
                                    readOnly={
                                      !!piece.edgeSource && key === "length"
                                    }
                                    onChange={(e) =>
                                      patchPiece({
                                        [key]: e.target.value,
                                        ...(key === "width" &&
                                        !["L-shape", "U-shape"].includes(
                                          piece.shape,
                                        )
                                          ? {
                                              defaultUsed: false,
                                              defaultConfirmed: false,
                                            }
                                          : {}),
                                      })
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                            {["L-shape", "U-shape"].includes(piece.shape) && (
                              <div className="field-grid">
                                {(
                                  [
                                    "left",
                                    "back",
                                    ...(piece.shape === "U-shape"
                                      ? ["right"]
                                      : []),
                                  ] as ("left" | "back" | "right")[]
                                ).map((k) => (
                                  <label key={k}>
                                    {k[0].toUpperCase() + k.slice(1)} leg depth
                                    <input
                                      value={piece[k]}
                                      onChange={(e) =>
                                        patchPiece({
                                          [k]: e.target.value,
                                          defaultConfirmed: false,
                                        })
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            )}
                            <p className="help">
                              Use whole, decimal, or fractional inches: 96,
                              25.5, 25 1/2. L / U legs form the top and side
                              edges of the schematic.
                            </p>
                            {piece.defaultUsed && (
                              <label className="checkbox assumption">
                                <input
                                  type="checkbox"
                                  checked={piece.defaultConfirmed}
                                  onChange={(e) =>
                                    patchPiece({
                                      defaultConfirmed: e.target.checked,
                                    })
                                  }
                                />{" "}
                                I confirm all suggested 25 1/2″ depths, or have
                                replaced them with measured values.
                              </label>
                            )}
                          </>
                        )}
                        {category(piece) !== "horizontal" && (
                          <label>
                            Quantity
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              value={piece.quantity}
                              onChange={(e) =>
                                patchPiece({ quantity: Number(e.target.value) })
                              }
                            />
                          </label>
                        )}
                        {project.placement === "shared" &&
                          category(piece) === "horizontal" && (
                            <>
                              <p className="help">
                                Physical origin in a common coordinate system
                                (inches). Axes follow the schematic; polygons
                                already include scaled drawing coordinates.
                                Annotation position does not set physical
                                position.
                              </p>
                              <div className="field-grid">
                                <label>
                                  X origin
                                  <input
                                    value={piece.x}
                                    onChange={(e) =>
                                      patchPiece({ x: e.target.value })
                                    }
                                  />
                                </label>
                                <label>
                                  Y origin
                                  <input
                                    value={piece.y}
                                    onChange={(e) =>
                                      patchPiece({ y: e.target.value })
                                    }
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        {piece.edgeSource && (
                          <p className="help">
                            Length follows edge {piece.edgeSource.edgeIndex + 1}{" "}
                            of its source countertop. Edit the height here. The
                            drawing shows a schematic elevation strip. Curved
                            edges use an unfolded panel, not a horizontal
                            footprint.
                          </p>
                        )}
                        <div className="piece-total">
                          <span>Piece surface area</span>
                          <strong>
                            {safeArea(piece)} <small>sq ft</small>
                          </strong>
                        </div>
                        {(() => {
                          try {
                            pieceArea(piece);
                            return null;
                          } catch (e) {
                            return (
                              <p className="validation">
                                <AlertCircle size={14} />
                                {(e as Error).message}
                              </p>
                            );
                          }
                        })()}
                      </div>
                    )}
                  </aside>
                </div>
                <div className="bottom-summary">
                  <div>
                    <span className="eyebrow">DRAFT SURFACE AREA</span>
                    <p>Openings are included. No waste added.</p>
                  </div>
                  {(
                    [
                      "horizontal",
                      "backsplash",
                      "waterfall",
                      "combined",
                    ] as const
                  ).map((k) => (
                    <div key={k}>
                      <span>
                        {k === "horizontal"
                          ? "Countertops"
                          : k === "combined"
                            ? "Combined material"
                            : k[0].toUpperCase() + k.slice(1)}
                      </span>
                      <strong>
                        {summary ? sqft(summary[k]) : "—"} <small>sq ft</small>
                      </strong>
                    </div>
                  ))}
                  <div>
                    <span>Linear cut (estimated)</span>
                    <strong>
                      {(() => {
                        try {
                          return `${linearCut(project).div(12).toFixed(2)} ft / ${linearCut(project).toFixed(2)} in`;
                        } catch {
                          return "—";
                        }
                      })()}
                    </strong>
                    <small>
                      All piece perimeters × quantity. Shared edges count per
                      piece; no overcut.
                    </small>
                  </div>
                </div>
              </>
            ) : tab === "Slab planning" ? (
              <SlabPlanner
                key={project.id}
                project={project}
                onChange={(slabSettings) => {
                  const p = {
                    ...project,
                    slabSettings,
                    updated: new Date().toISOString(),
                  };
                  setProject(p);
                  persist(p);
                }}
              />
            ) : tab === "Review & approve" ? (
              <section className="review-panel">
                <div className="eyebrow">MEASURE. VERIFY. APPROVE.</div>
                <h2>A final check, for a precise estimate.</h2>
                <p>
                  Confirm the actual physical relationships between horizontal
                  pieces. Drawing annotations are illustrative and do not
                  establish physical placement.
                </p>
                <label>
                  How do these surfaces relate?
                  <select
                    value={project.placement}
                    onChange={(e) =>
                      edit({
                        ...project,
                        placement: e.target.value as Project["placement"],
                        placementConfirmed: false,
                      })
                    }
                  >
                    <option value="unresolved">Not verified yet</option>
                    <option value="separate">
                      Separate physical surfaces — no overlapping material
                    </option>
                    <option value="shared">
                      Shared physical coordinates — calculate polygon union
                    </option>
                  </select>
                </label>
                {project.placement === "shared" && (
                  <p className="notice">
                    Set every horizontal piece’s X/Y origin in its dimension
                    panel. Shapes use the orientation shown; rotated pieces must
                    be modeled as verified scaled polygons. Shared coordinates
                    apply across all drawings.
                  </p>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={project.placementConfirmed}
                    onChange={(e) =>
                      edit({ ...project, placementConfirmed: e.target.checked })
                    }
                  />{" "}
                  I have verified the relative positions and all possible
                  overlaps.
                </label>
                <h3>Measurement checklist</h3>
                {problems.length ? (
                  <ul className="issue-list">
                    {problems.map((s, i) => (
                      <li key={i}>
                        <AlertCircle size={17} />
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="success">
                    <CheckCircle2 size={20} /> Geometry and required
                    confirmations are complete.
                  </div>
                )}
                <p className="help">
                  You are responsible for checking actual measurements and
                  scale. Any project edits invalidate approval. Sink / cooktop
                  openings are not deducted. Backsplash and waterfall remain
                  separate.
                </p>
                <button
                  className="primary"
                  disabled={problems.length > 0 || approved}
                  onClick={() => {
                    const p = {
                      ...project,
                      approved: {
                        at: new Date().toISOString(),
                        fingerprint: fingerprint(project),
                      },
                    };
                    setProject(p);
                    persist(p);
                  }}
                >
                  <CheckCircle2 size={17} />
                  {approved ? "Project approved" : "Approve project snapshot"}
                </button>
              </section>
            ) : null}
          </div>
        )}
        <footer>
          <span>COUNTERTOP CALCULATOR</span>
          <span>Thoughtful measurements. Confident estimates.</span>
          <span>Manual measurements · No AI recognition</span>
        </footer>
      </main>
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,application/pdf,.dxf"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {dxfReview && project && (
        <DxfImport
          review={dxfReview}
          onCancel={() => setDxfReview(null)}
          onImport={({ drawing, pieces }) => {
            edit({
              ...project,
              drawings: [...project.drawings, drawing],
              pieces: [...project.pieces, ...pieces],
              placement: "unresolved",
              placementConfirmed: false,
            });
            setDrawingId(drawing.id);
            setSelected(pieces[0]?.id || "");
            setDxfReview(null);
          }}
        />
      )}
      <input
        ref={backupInput}
        type="file"
        hidden
        accept="application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void task(async () => {
              if (file.size > 100 * 1024 * 1024)
                throw Error("Backup exceeds 100 MB.");
              const raw = JSON.parse(await file.text());
              const { restoreProject } = await import("./restore");
              const p = restoreProject(raw);
              await saveProject(p);
              setProjects((prev) => [p, ...prev]);
              open(p);
            });
          e.target.value = "";
        }}
      />
    </div>
  );
}
