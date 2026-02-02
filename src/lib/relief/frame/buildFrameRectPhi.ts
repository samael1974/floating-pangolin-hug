// src/lib/relief/frame/buildFrameRectPhi.ts
const PHI_DEFAULT = 1.61803398875;

export type FrameRectSimpleParams = {
  innerWmm: number;
  innerHmm: number;
  thicknessMm: number;      // spessore cornice (lato)
  heightMm: number;         // altezza totale cornice
  glassMm: 2 | 3;           // spessore vetro
  glassClearanceMm: number; // clearance per il vetro
  glueLipMm: number;        // spalla/bordo interno dove incollare vetro
  pocketDepthMm?: number;   // profondità scanso vetro
  phiRatio?: number;
};

export type MeshOut = {
  vertices: Float32Array;
  indices: Uint32Array;
};

export function buildFrameRectPhi(
  params: FrameRectSimpleParams
): MeshOut {
  const phi = Number.isFinite(params.phiRatio) ? Number(params.phiRatio) : PHI_DEFAULT;
  const w = Math.max(1, params.innerWmm);
  const h = Math.max(1, params.innerHmm);

  const thickness = Math.max(0.5, params.thicknessMm);
  const height = Math.max(1, params.heightMm);

  const glass = params.glassMm;
  const clearance = Math.max(0, params.glassClearanceMm);
  const lip = clamp(Math.max(0, params.glueLipMm), 0, thickness / phi);
  const pocketDepthRaw = Number(params.pocketDepthMm ?? glass + 0.6);
  const pocketDepth = clamp(pocketDepthRaw, glass + 0.4, height / phi);

  const y0 = 0;
  const yH = height;
  const yPocket = yH - pocketDepth;

  const outerW = w + 2 * thickness;
  const outerH = h + 2 * thickness;

  const pocketW = clamp(w + 2 * (lip + clearance), w + 0.4, outerW - 0.4);
  const pocketH = clamp(h + 2 * (lip + clearance), h + 0.4, outerH - 0.4);

  const rectOuter = { hx: outerW / 2, hy: outerH / 2 };
  const rectPocket = { hx: pocketW / 2, hy: pocketH / 2 };
  const rectInner = { hx: w / 2, hy: h / 2 };

  const V: number[] = [];
  const I: number[] = [];

  const addV = (x: number, y: number, z: number) => {
    V.push(x, y, z);
    return (V.length / 3) - 1;
  };

  const tri = (a: number, b: number, c: number) => {
    I.push(a, b, c);
  };

  const addRingFace = (inner: Rect, outer: Rect, y: number, up: boolean) => {
    const o = rectCorners(outer);
    const inn = rectCorners(inner);
    addQuad(o.tl, o.tr, inn.tr, inn.tl, y, up, addV, tri);
    addQuad(o.tr, o.br, inn.br, inn.tr, y, up, addV, tri);
    addQuad(o.br, o.bl, inn.bl, inn.br, y, up, addV, tri);
    addQuad(o.bl, o.tl, inn.tl, inn.bl, y, up, addV, tri);
  };

  const addRectWall = (r: Rect, yB: number, yT: number, outward: boolean) => {
    const c = rectCorners(r);
    const sides: Array<[Pt2, Pt2]> = [
      [c.tl, c.tr],
      [c.tr, c.br],
      [c.br, c.bl],
      [c.bl, c.tl],
    ];

    for (const [p0, p1] of sides) {
      const a0 = addV(p0.x, yB, p0.y);
      const b0 = addV(p1.x, yB, p1.y);
      const b1 = addV(p1.x, yT, p1.y);
      const a1 = addV(p0.x, yT, p0.y);

      if (outward) {
        tri(a0, b0, b1);
        tri(a0, b1, a1);
      } else {
        tri(a0, b1, b0);
        tri(a0, a1, b1);
      }
    }
  };

  // Top face and pocket ledge
  addRingFace(rectPocket, rectOuter, yH, true);
  if (pocketDepth > 0.1) {
    addRingFace(rectInner, rectPocket, yPocket, true);
  }

  // Outer walls
  addRectWall(rectOuter, y0, yH, true);

  // Pocket inner wall
  if (pocketDepth > 0.1) {
    addRectWall(rectPocket, yPocket, yH, false);
  }

  // Inner opening walls
  addRectWall(rectInner, y0, Math.max(yPocket, y0), false);

  // Bottom face
  addRingFace(rectInner, rectOuter, y0, false);

  return {
    vertices: new Float32Array(V),
    indices: new Uint32Array(I),
  };
}

type Rect = { hx: number; hy: number };
type Pt2 = { x: number; y: number };

function rectCorners(r: Rect) {
  const hx = r.hx;
  const hy = r.hy;
  return {
    tl: { x: -hx, y: +hy },
    tr: { x: +hx, y: +hy },
    br: { x: +hx, y: -hy },
    bl: { x: -hx, y: -hy },
  };
}

function addQuad(
  p0: Pt2,
  p1: Pt2,
  p2: Pt2,
  p3: Pt2,
  y: number,
  up: boolean,
  addV: (x: number, y: number, z: number) => number,
  tri: (a: number, b: number, c: number) => void
) {
  const a = addV(p0.x, y, p0.y);
  const b = addV(p1.x, y, p1.y);
  const c = addV(p2.x, y, p2.y);
  const d = addV(p3.x, y, p3.y);

  if (up) {
    tri(a, b, c);
    tri(a, c, d);
  } else {
    tri(a, c, b);
    tri(a, d, c);
  }
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}
