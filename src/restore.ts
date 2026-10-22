import { slabBounds } from "./drawing-slabs";
import { validateBoundary } from "./cad-curves";
import {
  type Project,
  type Piece,
  type Drawing,
  makeProject,
  makePiece,
} from "./engine";
const shapeNames = [
  "Straight",
  "L-shape",
  "U-shape",
  "Island",
  "Peninsula",
  "Polygon",
  "Backsplash",
  "Waterfall",
];
export function restoreProject(value: unknown): Project {
  const v = value as Project;
  if (
    !v ||
    typeof v.name !== "string" ||
    !Array.isArray(v.pieces) ||
    !Array.isArray(v.drawings) ||
    v.pieces.length > 1000 ||
    v.drawings.length > 100
  )
    throw Error("Invalid project backup.");
  const drawings: Drawing[] = v.drawings.map((d) => {
    if (
      typeof d.id !== "string" ||
      typeof d.name !== "string" ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d.data) ||
      !Number.isFinite(d.width) ||
      !Number.isFinite(d.height) ||
      d.width <= 0 ||
      d.height <= 0 ||
      d.width * d.height > 40000000
    )
      throw Error("Invalid drawing in backup.");
    return {
      ...(d.kind === "dxf" ? { kind: "dxf" as const } : {}),
      id: d.id,
      name: d.name,
      data: d.data,
      width: d.width,
      height: d.height,
    };
  });
  const idMap = new Map<string, string>();
  const pieces: Piece[] = v.pieces.map((p) => {
    if (
      !p ||
      !shapeNames.includes(p.shape) ||
      typeof p.name !== "string" ||
      !Array.isArray(p.points) ||
      p.points.length > 10000 ||
      p.points.some(
        (q) =>
          !Array.isArray(q) ||
          q.length !== 2 ||
          q.some((n) => !Number.isFinite(n)),
      )
    )
      throw Error("Invalid piece in backup.");
    if (
      p.surface !== undefined &&
      !["horizontal", "backsplash", "waterfall"].includes(p.surface)
    )
      throw Error("Invalid surface category.");
    if (p.boundary !== undefined) {
      if (p.shape !== "Polygon") throw Error("CAD boundary must be a polygon.");
      validateBoundary(p.boundary);
    }
    if (typeof p.id !== "string" || idMap.has(p.id))
      throw Error("Invalid or duplicate piece identifier.");
    if (
      p.rotation !== undefined &&
      (typeof p.rotation !== "number" || !Number.isFinite(p.rotation))
    )
      throw Error("Invalid piece rotation.");
    const result = makePiece(p.shape);
    idMap.set(p.id, result.id);
    if (
      p.polishedEdges !== undefined &&
      (!Array.isArray(p.polishedEdges) ||
        !Number.isInteger(p.polishedEdgeCount) ||
        p.polishedEdgeCount! < 2 ||
        p.polishedEdges.some(
          (i) => !Number.isInteger(i) || i < 0 || i >= p.polishedEdgeCount!,
        ))
    )
      throw Error("Invalid polished edges in backup.");
    if (p.edgeSource) {
      const link = p.edgeSource;
      if (
        p.shape !== "Backsplash" ||
        typeof link.pieceId !== "string" ||
        !Number.isInteger(link.edgeIndex) ||
        link.edgeIndex < 0 ||
        !Number.isInteger(link.edgeCount) ||
        link.edgeCount < 2 ||
        link.edgeIndex >= link.edgeCount
      )
        throw Error("Invalid linked backsplash.");
    }

    for (const key of [
      "length",
      "width",
      "left",
      "right",
      "back",
      "scale",
      "x",
      "y",
      "drawingId",
    ] as const) {
      if (typeof p[key] !== "string") throw Error("Missing piece fields.");
      result[key] = p[key];
    }
    if (p.drawingId && !drawings.some((d) => d.id === p.drawingId))
      throw Error("Missing drawing reference.");
    if (
      !Array.isArray(p.annotation) ||
      p.annotation.length !== 2 ||
      p.annotation.some((n) => !Number.isFinite(n)) ||
      !Number.isInteger(p.quantity) ||
      p.quantity < 1
    )
      throw Error("Invalid annotation or quantity.");
    return {
      ...result,
      ...(p.surface ? { surface: p.surface } : {}),
      ...(p.edgeSource ? { edgeSource: { ...p.edgeSource } } : {}),
      ...(p.boundary ? { boundary: structuredClone(p.boundary) } : {}),
      ...(p.polishedEdges
        ? {
            polishedEdges: [...p.polishedEdges],
            polishedEdgeCount: p.polishedEdgeCount,
          }
        : {}),
      ...(p.rotation !== undefined ? { rotation: p.rotation } : {}),
      name: p.name,
      points: p.points,
      annotation: p.annotation,
      quantity: p.quantity,
      defaultUsed: !!p.defaultUsed,
      defaultConfirmed: false,
      scaleConfirmed: false,
    };
  });
  for (const p of pieces) {
    if (p.edgeSource) {
      const target = idMap.get(p.edgeSource.pieceId);
      if (!target) throw Error("Missing backsplash source in backup.");
      p.edgeSource = { ...p.edgeSource, pieceId: target };
    }
  }
  if (v.drawingSlabs !== undefined) {
    if (!Array.isArray(v.drawingSlabs) || v.drawingSlabs.length > 100)
      throw Error("Invalid drawing slabs.");
    const slabIds = new Set<string>();
    for (const s of v.drawingSlabs) {
      if (
        !s ||
        typeof s.id !== "string" ||
        slabIds.has(s.id) ||
        typeof s.length !== "string" ||
        typeof s.width !== "string" ||
        typeof s.drawingId !== "string" ||
        (s.drawingId && !drawings.some((d) => d.id === s.drawingId))
      )
        throw Error("Invalid drawing slab.");
      if (
        (s.name !== undefined && typeof s.name !== "string") ||
        (s.locked !== undefined && typeof s.locked !== "boolean")
      )
        throw Error("Invalid slab name or lock.");
      slabIds.add(s.id);
      slabBounds(s);
    }
  }
  if (v.slabSettings) {
    const s = v.slabSettings;
    if (
      !s ||
      ["length", "width", "gap", "margin"].some(
        (k) => typeof s[k as keyof typeof s] !== "string",
      ) ||
      typeof s.allowRotation !== "boolean" ||
      !Array.isArray(s.excludedIds) ||
      !Array.isArray(s.rotationLockedIds) ||
      [...s.excludedIds, ...s.rotationLockedIds].some(
        (id) => typeof id !== "string",
      )
    )
      throw Error("Invalid slab settings.");
  }
  return {
    ...(v.slabSettings
      ? {
          slabSettings: {
            ...v.slabSettings,
            excludedIds: v.slabSettings.excludedIds
              .map((id) => idMap.get(id))
              .filter((id): id is string => !!id),
            rotationLockedIds: v.slabSettings.rotationLockedIds
              .map((id) => idMap.get(id))
              .filter((id): id is string => !!id),
          },
        }
      : {}),
    ...makeProject(v.name + " (restored)"),
    ...(v.drawingSlabs
      ? {
          drawingSlabs: v.drawingSlabs.map((s) => ({
            ...s,
            id: crypto.randomUUID(),
          })),
        }
      : {}),
    drawings,
    pieces,
    placement: ["shared", "separate"].includes(v.placement)
      ? v.placement
      : "unresolved",
    placementConfirmed: false,
  };
}
