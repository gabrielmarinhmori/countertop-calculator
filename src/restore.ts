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
      id: d.id,
      name: d.name,
      data: d.data,
      width: d.width,
      height: d.height,
    };
  });
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
    const result = makePiece(p.shape);
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
      name: p.name,
      points: p.points,
      annotation: p.annotation,
      quantity: p.quantity,
      defaultUsed: !!p.defaultUsed,
      defaultConfirmed: false,
      scaleConfirmed: false,
    };
  });
  return {
    ...makeProject(v.name + " (restored)"),
    drawings,
    pieces,
    placement: ["shared", "separate"].includes(v.placement)
      ? v.placement
      : "unresolved",
    placementConfirmed: false,
  };
}
