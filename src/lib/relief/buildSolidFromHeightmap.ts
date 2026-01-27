import * as THREE from "three";
import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";

type BuildSolidArgs = {
  normF32: Float32Array;
  w: number;
  h: number;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode;
  baseStyle: BaseStyle;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function buildSolidFromHeightmap(args: BuildSolidArgs): THREE.BufferGeometry {
  const { normF32, w, h, widthMm, depthMm, baseMm, outputMode, baseStyle } = args;

  if (w < 2 || h < 2) throw new Error("Solid build: w/h too small");
  if (normF32.length !== w * h) throw new Error("Solid build: normF32 size mismatch");
  if (!(widthMm > 0)) throw new Error("Solid build: widthMm must be > 0");

  const idx = (x: number, y: number) => y * w + x;

  // XY plane, Z thickness (slicer-friendly)
  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const xL = x0;
  const xR = x0 + widthMm;      // più robusto di (w-1)*dx
  const yT = y0;
  const yB = y0 - heightMm;     // più robusto di (h-1)*dy

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    // guard-rail anti NaN/Infinity
    if (
      !Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
      !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz) ||
      !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)
    ) {
      throw new Error("buildSolidFromHeightmap: non-finite vertex");
    }
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // --- “height” del rilievo (0..depth) ---
  const reliefH = (H: number) => {
    const h01 = clamp01(H);
    if (outputMode === "mold") return depthMm * (1 - h01);
    return depthMm * h01;
  };

  // ---------- TOP Z (flat / recessed / mold) ----------
  const zTopClassic = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // incavo verso il basso dentro la base (0..base)
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      return baseMm + depthMm * (1 - h01);
    }

    return baseMm + depthMm * h01;
  };

  // ==========================
  // OFFSET MODE (cornice XY + base solida + rilievo sopra)
  // ==========================
  if (baseStyle === "offset") {
    const baseTop = Math.max(baseMm, 0.8);   // top della base (minimo “fisico”)
    const offXY = baseTop;                  // offset XY = spessore base (semplice e stabile)

    const xL1 = xL - offXY;
    const xR1 = xR + offXY;
    const yT1 = yT + offXY;
    const yB1 = yB - offXY;

    // ---- TOP rilievo: parte da baseTop ----
    const zTop = (ix: number, iy: number) => baseTop + reliefH(normF32[idx(ix, iy)] ?? 0);

    // 1) TOP SURFACE (rilievo)
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const xA = x0 + ix * dx;
        const yA = y0 - iy * dy;
        const xB = x0 + (ix + 1) * dx;
        const yBv = yA;
        const xC = xA;
        const yC = y0 - (iy + 1) * dy;
        const xD = xB;
        const yD = yC;

        const zA = zTop(ix, iy);
        const zB2 = zTop(ix + 1, iy);
        const zC2 = zTop(ix, iy + 1);
        const zD2 = zTop(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xB, yBv, zB2, xD, yD, zD2);
        pushTri(xA, yA, zA, xD, yD, zD2, xC, yC, zC2);
      }
    }

    // 2) OUTER BOTTOM (rettangolo esterno) a Z=0
    // winding verso -Z
    pushTri(xL1, yT1, 0, xR1, yB1, 0, xR1, yT1, 0);
    pushTri(xL1, yT1, 0, xL1, yB1, 0, xR1, yB1, 0);

    // 3) OUTER WALLS: da Z=0 a Z=baseTop sul perimetro esterno
    const outerWall = (
      ax: number, ay: number,
      bx: number, by: number
    ) => {
      // (a0 -> aT -> bT) + (a0 -> bT -> b0)
      pushTri(ax, ay, 0, ax, ay, baseTop, bx, by, baseTop);
      pushTri(ax, ay, 0, bx, by, baseTop, bx, by, 0);
    };

    // top outer edge (yT1): xL1 -> xR1
    outerWall(xL1, yT1, xR1, yT1);
    // right outer edge (xR1): yT1 -> yB1
    outerWall(xR1, yT1, xR1, yB1);
    // bottom outer edge (yB1): xR1 -> xL1
    outerWall(xR1, yB1, xL1, yB1);
    // left outer edge (xL1): yB1 -> yT1
    outerWall(xL1, yB1, xL1, yT1);

    // 4) RING TOP (solo cornice) a Z=baseTop: collega esterno ↔ interno
    // ring: 4 bande (8 triangoli) a z=baseTop
    // top band
    pushTri(xL1, yT1, baseTop, xR1, yT1, baseTop, xR, yT, baseTop);
    pushTri(xL1, yT1, baseTop, xR, yT, baseTop, xL, yT, baseTop);
    // bottom band
    pushTri(xL, yB, baseTop, xR, yB, baseTop, xR1, yB1, baseTop);
    pushTri(xL, yB, baseTop, xR1, yB1, baseTop, xL1, yB1, baseTop);
    // left band
    pushTri(xL1, yB1, baseTop, xL1, yT1, baseTop, xL, yT, baseTop);
    pushTri(xL1, yB1, baseTop, xL, yT, baseTop, xL, yB, baseTop);
    // right band
    pushTri(xR, yT, baseTop, xR1, yT1, baseTop, xR1, yB1, baseTop);
    pushTri(xR, yT, baseTop, xR1, yB1, baseTop, xR, yB, baseTop);

    // 5) RELIEF SIDE WALLS: dal ring top (Z=baseTop) al top rilievo (Z=zTop)
    const makeReliefWall = (
      x1: number, y1: number, zT1: number,
      x2: number, y2: number, zT2: number,
      flip: boolean
    ) => {
      const b1 = baseTop;
      const b2 = baseTop;

      if (!flip) {
        pushTri(x1, y1, b1, x1, y1, zT1, x2, y2, zT2);
        pushTri(x1, y1, b1, x2, y2, zT2, x2, y2, b2);
      } else {
        pushTri(x1, y1, b1, x2, y2, zT2, x1, y1, zT1);
        pushTri(x1, y1, b1, x2, y2, b2, x2, y2, zT2);
      }
    };

    // LEFT / RIGHT
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;

      const zL_a = zTop(0, iy);
      const zL_b = zTop(0, iy + 1);
      makeReliefWall(xL, y1, zL_a, xL, y2, zL_b, false);

      const zR_a = zTop(w - 1, iy);
      const zR_b = zTop(w - 1, iy + 1);
      makeReliefWall(xR, y1, zR_a, xR, y2, zR_b, true);
    }

    // TOP / BOTTOM edges
    for (let ix = 0; ix < w - 1; ix++) {
      const x1 = x0 + ix * dx;
      const x2 = x0 + (ix + 1) * dx;

      const zT_a = zTop(ix, 0);
      const zT_b = zTop(ix + 1, 0);
      makeReliefWall(x1, yT, zT_a, x2, yT, zT_b, false);

      const zB_a = zTop(ix, h - 1);
      const zB_b = zTop(ix + 1, h - 1);
      makeReliefWall(x1, yB, zB_a, x2, yB, zB_b, true);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  // ==========================
  // NON-OFFSET (flat/recessed/mold classico)
  // ==========================

  // TOP surface
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const yA = y0 - iy * dy;
      const xB = x0 + (ix + 1) * dx;
      const yBv = yA;
      const xC = xA;
      const yC = y0 - (iy + 1) * dy;
      const xD = xB;
      const yD = yC;

      const zA = zTopClassic(normF32[idx(ix, iy)] ?? 0);
      const zB2 = zTopClassic(normF32[idx(ix + 1, iy)] ?? 0);
      const zC2 = zTopClassic(normF32[idx(ix, iy + 1)] ?? 0);
      const zD2 = zTopClassic(normF32[idx(ix + 1, iy + 1)] ?? 0);

      pushTri(xA, yA, zA, xB, yBv, zB2, xD, yD, zD2);
      pushTri(xA, yA, zA, xD, yD, zD2, xC, yC, zC2);
    }
  }

  // BOTTOM rectangle (z=0), winding verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // side walls from z=0 to zTopClassic along perimeter
  const makeWallClassic = (
    x1: number, y1: number, zT1: number,
    x2: number, y2: number, zT2: number,
    flip: boolean
  ) => {
    const b1 = 0;
    const b2 = 0;

    if (!flip) {
      pushTri(x1, y1, b1, x1, y1, zT1, x2, y2, zT2);
      pushTri(x1, y1, b1, x2, y2, zT2, x2, y2, b2);
    } else {
      pushTri(x1, y1, b1, x2, y2, zT2, x1, y1, zT1);
      pushTri(x1, y1, b1, x2, y2, b2, x2, y2, zT2);
    }
  };

  // LEFT / RIGHT
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;

    const zL1 = zTopClassic(normF32[idx(0, iy)] ?? 0);
    const zL2 = zTopClassic(normF32[idx(0, iy + 1)] ?? 0);
    makeWallClassic(xL, y1, zL1, xL, y2, zL2, false);

    const zR1 = zTopClassic(normF32[idx(w - 1, iy)] ?? 0);
    const zR2 = zTopClassic(normF32[idx(w - 1, iy + 1)] ?? 0);
    makeWallClassic(xR, y1, zR1, xR, y2, zR2, true);
  }

  // TOP / BOTTOM edges
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;

    const zT1 = zTopClassic(normF32[idx(ix, 0)] ?? 0);
    const zT2 = zTopClassic(normF32[idx(ix + 1, 0)] ?? 0);
    makeWallClassic(x1, yT, zT1, x2, yT, zT2, false);

    const zB1 = zTopClassic(normF32[idx(ix, h - 1)] ?? 0);
    const zB2 = zTopClassic(normF32[idx(ix + 1, h - 1)] ?? 0);
    makeWallClassic(x1, yB, zB1, x2, yB, zB2, true);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
