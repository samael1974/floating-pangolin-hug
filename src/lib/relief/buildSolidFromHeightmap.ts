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
  // OFFSET (CAD-like) = SHELL CAVO + LIP XY
  // - baseMm = spessore guscio (min 0.6)
  // - depthMm = altezza rilievo
  // - offXY (lip) = distanza offset in XY (CAD) -> qui uguale a baseMm
  // =====================================================
  if (baseStyle === "offset") {
    const t = Math.max(baseMm, 0.6);     // spessore guscio
    const offXY = t;                     // offset CAD in XY (lip) -> costante come in immagine

    // In OFFSET vogliamo TOP da 0..depthMm (NON aggiungere baseMm qui)
    const zTopOffset = (H: number) => {
      const h01 = clamp01(H);
      if (outputMode === "mold") return depthMm * (1 - h01);
         };

    const zTopGrid = new Float32Array(w * h);
    const zBotGrid = new Float32Array(w * h);

    // bottom = top - t, poi shift globale per avere minZ=0
    let minZ = Number.POSITIVE_INFINITY;
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const zt = zTopOffset(normF32[idx(ix, iy)] ?? 0);
        const zb = zt - t;
        zTopGrid[idx(ix, iy)] = zt;
        zBotGrid[idx(ix, iy)] = zb;
        if (zb < minZ) minZ = zb;
      }
    }
    const zShift = -minZ;

    const zT = (ix: number, iy: number) => zTopGrid[idx(ix, iy)] + zShift;
    const zB = (ix: number, iy: number) => zBotGrid[idx(ix, iy)] + zShift;

    // --- TOP surface (come prima, ma usando zT)
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

        const zA = zT(ix, iy);
        const zB1 = zT(ix + 1, iy);
        const zC1 = zT(ix, iy + 1);
        const zD1 = zT(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xB, yBv, zB1, xD, yD, zD1);
        pushTri(xA, yA, zA, xD, yD, zD1, xC, yC, zC1);
      }
    }

    // --- BOTTOM surface (winding invertito, usando zB)
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

        const zA = zB(ix, iy);
        const zB1 = zB(ix + 1, iy);
        const zC1 = zB(ix, iy + 1);
        const zD1 = zB(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xD, yD, zD1, xB, yBv, zB1);
        pushTri(xA, yA, zA, xC, yC, zC1, xD, yD, zD1);
      }
    }

    // --- Side walls: collega bordo TOP e bordo BOTTOM lungo il perimetro rettangolare
    const wall = (
      x1: number, y1: number, zt1: number, zb1: number,
      x2: number, y2: number, zt2: number, zb2: number
    ) => {
      pushTri(x1, y1, zb1, x1, y1, zt1, x2, y2, zt2);
      pushTri(x1, y1, zb1, x2, y2, zt2, x2, y2, zb2);
    };

    const xL = x0, xR = x0 + widthMm;
    const yT0 = y0, yB0 = y0 - heightMm;

    // left
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;
      wall(xL, yy1, zT(0, iy), zB(0, iy), xL, yy2, zT(0, iy + 1), zB(0, iy + 1));
    }
    // right (ordine invertito per winding esterno coerente)
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;
      wall(xR, yy2, zT(w - 1, iy + 1), zB(w - 1, iy + 1), xR, yy1, zT(w - 1, iy), zB(w - 1, iy));
    }
    // top
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      wall(xx1, yT0, zT(ix, 0), zB(ix, 0), xx2, yT0, zT(ix + 1, 0), zB(ix + 1, 0));
    }
    // bottom (ordine invertito)
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      wall(xx2, yB0, zT(ix + 1, h - 1), zB(ix + 1, h - 1), xx1, yB0, zT(ix, h - 1), zB(ix, h - 1));
    }

    // =====================================================
    // LIP XY (offset CAD-like sul contorno) a Z=0
    // rettangolo esterno + ring + pareti esterne fino alla bottom locale
    // =====================================================
    const xL1 = xL - offXY;
    const xR1 = xR + offXY;
    const yT1 = yT0 + offXY;
    const yB1 = yB0 - offXY;

    // Ring bottom: due rettangoli complanari (esterno - interno) a z=0
    // (4 quad = 8 triangoli)
    // TOP band
    pushTri(xL1, yT1, 0, xR1, yT1, 0, xR, yT0, 0);
    pushTri(xL1, yT1, 0, xR, yT0, 0, xL, yT0, 0);
    // BOTTOM band
    pushTri(xL, yB0, 0, xR, yB0, 0, xR1, yB1, 0);
    pushTri(xL, yB0, 0, xR1, yB1, 0, xL1, yB1, 0);
    // LEFT band
    pushTri(xL1, yB1, 0, xL1, yT1, 0, xL, yT0, 0);
    pushTri(xL1, yB1, 0, xL, yT0, 0, xL, yB0, 0);
    // RIGHT band
    pushTri(xR, yT0, 0, xR1, yT1, 0, xR1, yB1, 0);
    pushTri(xR, yT0, 0, xR1, yB1, 0, xR, yB0, 0);

    // Pareti esterne: da z=0 al bottom locale sul bordo interno (zB sugli edge)
    // Left outer wall
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;
      const zb1 = zB(0, iy);
      const zb2 = zB(0, iy + 1);
      wall(xL1, yy1, 0, 0, xL1, yy2, 0, 0); // “nullo” (evita vuoti in caso di slicer)
      // collega esterno (xL1) a interno (xL) fino al bottom locale
      pushTri(xL1, yy1, 0, xL, yy1, zb1, xL, yy2, zb2);
      pushTri(xL1, yy1, 0, xL, yy2, zb2, xL1, yy2, 0);
    }
    // Right outer wall
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;
      const zb1 = zB(w - 1, iy);
      const zb2 = zB(w - 1, iy + 1);
      pushTri(xR, yy2, zb2, xR, yy1, zb1, xR1, yy1, 0);
      pushTri(xR, yy2, zb2, xR1, yy1, 0, xR1, yy2, 0);
    }
    // Top outer wall
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      const zb1 = zB(ix, 0);
      const zb2 = zB(ix + 1, 0);
      pushTri(xx1, yT1, 0, xx1, yT0, zb1, xx2, yT0, zb2);
      pushTri(xx1, yT1, 0, xx2, yT0, zb2, xx2, yT1, 0);
    }
    // Bottom outer wall
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      const zb1 = zB(ix, h - 1);
      const zb2 = zB(ix + 1, h - 1);
      pushTri(xx2, yB0, zb2, xx1, yB0, zb1, xx1, yB1, 0);
      pushTri(xx2, yB0, zb2, xx1, yB1, 0, xx2, yB1, 0);
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
