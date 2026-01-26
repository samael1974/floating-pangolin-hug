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

export function buildSolidFromHeightmap(args: BuildSolidArgs): THREE.BufferGeometry {
  const { normF32, w, h, widthMm, depthMm, baseMm, outputMode, baseStyle } = args;

  if (w < 2 || h < 2) throw new Error("Solid build: w/h too small");
  if (normF32.length !== w * h) throw new Error("Solid build: normF32 size mismatch");
  if (widthMm <= 0) throw new Error("Solid build: widthMm must be > 0");

  const idx = (x: number, y: number) => y * w + x;

  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  // In offset mode, imponiamo una base minima ma SOLO sul top (non sotto lo zero)
  const baseEffMm = baseStyle === "offset" ? Math.max(baseMm, 0.8) : baseMm;

  // ---------- TOP Z ----------
  const zTop = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      return Math.max(0, baseEffMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      return baseEffMm + depthMm * (1 - h01);
    }

    return baseEffMm + depthMm * h01;
  };

  const verts: number[] = [];
  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) => {
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // ==========================
  // TOP SURFACE (sempre)
  // ==========================
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const yA = y0 - iy * dy;
      const xB = x0 + (ix + 1) * dx;
      const yB = yA;
      const xC = xA;
      const yC = y0 - (iy + 1) * dy;
      const xD = xB;
      const yD = yC;

      const zA = zTop(normF32[idx(ix, iy)] ?? 0);
      const zB = zTop(normF32[idx(ix + 1, iy)] ?? 0);
      const zC = zTop(normF32[idx(ix, iy + 1)] ?? 0);
      const zD = zTop(normF32[idx(ix + 1, iy + 1)] ?? 0);

      pushTri(xA, yA, zA, xB, yB, zB, xD, yD, zD);
      pushTri(xA, yA, zA, xD, yD, zD, xC, yC, zC);
    }
  }

   // =====================================================
  // OFFSET (CAD-like) → base "allargata" in XY + bottom a z=0
  // =====================================================
  if (baseStyle === "offset") {
    // base minima “stampabile” senza inventare quote sotto lo zero
    const effBaseMm = Math.max(baseMm, 0.8);

    // Offset CAD-like in XY (visibile nello slicer)
    // 0.8 mm funziona bene con nozzle 0.6; puoi alzare a 1.2 se vuoi più "cornice"
    const off = 0.8;

    const xL0 = x0;
    const xR0 = x0 + widthMm;
    const yT0 = y0;
    const yB0 = y0 - heightMm;

    // rettangolo "offsettato" esterno (base più grande)
    const xL1 = xL0 - off;
    const xR1 = xR0 + off;
    const yT1 = yT0 + off;
    const yB1 = yB0 - off;

    // ---- BOTTOM (rettangolo offset) a z=0, winding verso -Z
    pushTri(xL1, yT1, 0, xR1, yB1, 0, xR1, yT1, 0);
    pushTri(xL1, yT1, 0, xL1, yB1, 0, xR1, yB1, 0);

    // ---- WALLS: collegano il bordo TOP (rettangolo originale) al bordo BOTTOM (rettangolo offset)
    // chiusura SEMPRE su z=0 → watertight
    const wallLeft = (y1: number, zT1: number, y2: number, zT2: number) => {
      // esterno verso -X
      pushTri(xL1, y1, 0, xL0, y1, zT1, xL0, y2, zT2);
      pushTri(xL1, y1, 0, xL0, y2, zT2, xL1, y2, 0);
    };

    const wallRight = (y1: number, zT1: number, y2: number, zT2: number) => {
      // esterno verso +X (invertiamo winding)
      pushTri(xR1, y2, 0, xR0, y2, zT2, xR0, y1, zT1);
      pushTri(xR1, y2, 0, xR0, y1, zT1, xR1, y1, 0);
    };

    const wallTop = (x1: number, zT1: number, x2: number, zT2: number) => {
      // esterno verso +Y
      pushTri(x1, yT1, 0, x1, yT0, zT1, x2, yT0, zT2);
      pushTri(x1, yT1, 0, x2, yT0, zT2, x2, yT1, 0);
    };

    const wallBottom = (x1: number, zT1: number, x2: number, zT2: number) => {
      // esterno verso -Y (invertiamo winding)
      pushTri(x2, yB1, 0, x2, yB0, zT2, x1, yB0, zT1);
      pushTri(x2, yB1, 0, x1, yB0, zT1, x1, yB1, 0);
    };

    // LEFT / RIGHT walls (segmentate lungo Y con Z variabile)
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;

      // zTop deve stare sopra una base minima "effettiva"
      const zT1L = Math.max(zTop(normF32[idx(0, iy)] ?? 0), effBaseMm);
      const zT2L = Math.max(zTop(normF32[idx(0, iy + 1)] ?? 0), effBaseMm);
      wallLeft(y1, zT1L, y2, zT2L);

      const zT1R = Math.max(zTop(normF32[idx(w - 1, iy)] ?? 0), effBaseMm);
      const zT2R = Math.max(zTop(normF32[idx(w - 1, iy + 1)] ?? 0), effBaseMm);
      wallRight(y1, zT1R, y2, zT2R);
    }

    // TOP / BOTTOM walls (segmentate lungo X con Z variabile)
    for (let ix = 0; ix < w - 1; ix++) {
      const x1 = x0 + ix * dx;
      const x2 = x0 + (ix + 1) * dx;

      const zT1T = Math.max(zTop(normF32[idx(ix, 0)] ?? 0), effBaseMm);
      const zT2T = Math.max(zTop(normF32[idx(ix + 1, 0)] ?? 0), effBaseMm);
      wallTop(x1, zT1T, x2, zT2T);

      const zT1B = Math.max(zTop(normF32[idx(ix, h - 1)] ?? 0), effBaseMm);
      const zT2B = Math.max(zTop(normF32[idx(ix + 1, h - 1)] ?? 0), effBaseMm);
      wallBottom(x1, zT1B, x2, zT2B);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }


  // =====================================================
  // NON-OFFSET → BASE PIATTA CLASSICA (come prima)
  // =====================================================
  const xL = x0;
  const xR = x0 + widthMm;
  const yT = y0;
  const yB = y0 - heightMm;

  // BOTTOM (z=0) -> normali verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // Left side
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;
    const z1 = zTop(normF32[idx(0, iy)] ?? 0);
    const z2 = zTop(normF32[idx(0, iy + 1)] ?? 0);
    pushTri(xL, y1, 0, xL, y1, z1, xL, y2, z2);
    pushTri(xL, y1, 0, xL, y2, z2, xL, y2, 0);
  }

  // Right side
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;
    const z1 = zTop(normF32[idx(w - 1, iy)] ?? 0);
    const z2 = zTop(normF32[idx(w - 1, iy + 1)] ?? 0);
    pushTri(xR, y1, 0, xR, y2, z2, xR, y1, z1);
    pushTri(xR, y1, 0, xR, y2, 0, xR, y2, z2);
  }

  // Top edge (yT)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = zTop(normF32[idx(ix, 0)] ?? 0);
    const z2 = zTop(normF32[idx(ix + 1, 0)] ?? 0);
    pushTri(x1, yT, 0, x2, yT, z2, x1, yT, z1);
    pushTri(x1, yT, 0, x2, yT, 0, x2, yT, z2);
  }

  // Bottom edge (yB)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = zTop(normF32[idx(ix, h - 1)] ?? 0);
    const z2 = zTop(normF32[idx(ix + 1, h - 1)] ?? 0);
    pushTri(x1, yB, 0, x1, yB, z1, x2, yB, z2);
    pushTri(x1, yB, 0, x2, yB, z2, x2, yB, 0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
