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
const finite = (n: number) => Number.isFinite(n) && !Number.isNaN(n);

export function buildSolidFromHeightmap(args: BuildSolidArgs): THREE.BufferGeometry {
  const { normF32, w, h, widthMm, depthMm, baseMm, outputMode, baseStyle } = args;

  if (w < 2 || h < 2) throw new Error("Solid build: w/h too small");
  if (normF32.length !== w * h) throw new Error("Solid build: normF32 size mismatch");
  if (!(widthMm > 0)) throw new Error("Solid build: widthMm must be > 0");

  const idx = (x: number, y: number) => y * w + x;

  // Grid in XY, thickness in Z (Z-up, slicer-friendly)
  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const xL = x0;
  const xR = x0 + (w - 1) * dx;
  const yT = y0;
  const yB = y0 - (h - 1) * dy;

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    if (
      !finite(ax) || !finite(ay) || !finite(az) ||
      !finite(bx) || !finite(by) || !finite(bz) ||
      !finite(cx) || !finite(cy) || !finite(cz)
    ) {
      throw new Error("buildSolidFromHeightmap: non-finite vertex");
    }
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // ---------- Z per modalità NON-OFFSET (base piatta classica) ----------
  const zTopClassic = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // incavo dentro la base (verso -Z, ma clamp a 0)
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      return baseMm + depthMm * (1 - h01);
    }

    return baseMm + depthMm * h01;
  };

  // ===================================================================
  // OFFSET MODE = SHELL: bottom segue la forma (top - thickness), NON piatto
  // ===================================================================
  if (baseStyle === "offset") {
    // spessore minimo per evitare pareti zero
    const t = Math.max(baseMm, 0.6);

    // in offset, il "rilievo" vive in 0..depth (senza aggiungere baseMm)
    const zTopOffset = (H: number) => {
      const h01 = clamp01(H);
      return outputMode === "mold" ? depthMm * (1 - h01) : depthMm * h01;
    };

    // Precalcolo top/bottom per griglia e shift a terra (min bottom => 0)
    const zTGrid = new Float32Array(w * h);
    const zBGrid = new Float32Array(w * h);

    let minBottom = Number.POSITIVE_INFINITY;

    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const zt = zTopOffset(normF32[idx(ix, iy)] ?? 0);
        const zb = zt - t;
        zTGrid[idx(ix, iy)] = zt;
        zBGrid[idx(ix, iy)] = zb;
        if (zb < minBottom) minBottom = zb;
      }
    }

    const zShift = -minBottom; // porta il bottom minimo a 0

    const zT = (ix: number, iy: number) => zTGrid[idx(ix, iy)] + zShift;
    const zBf = (ix: number, iy: number) => zBGrid[idx(ix, iy)] + zShift;

    // ---------- TOP surface ----------
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

    // ---------- BOTTOM surface (winding verso -Z) ----------
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

        const zA = zBf(ix, iy);
        const zB1 = zBf(ix + 1, iy);
        const zC1 = zBf(ix, iy + 1);
        const zD1 = zBf(ix + 1, iy + 1);

        // invertito rispetto al top
        pushTri(xA, yA, zA, xD, yD, zD1, xB, yBv, zB1);
        pushTri(xA, yA, zA, xC, yC, zC1, xD, yD, zD1);
      }
    }

    // ---------- SIDE WALLS: perimetro rettangolare della griglia ----------
    const wall = (
      x1: number, y1: number, zt1: number, zb1: number,
      x2: number, y2: number, zt2: number, zb2: number,
      flip: boolean
    ) => {
      if (!flip) {
        pushTri(x1, y1, zb1, x1, y1, zt1, x2, y2, zt2);
        pushTri(x1, y1, zb1, x2, y2, zt2, x2, y2, zb2);
      } else {
        // winding opposto
        pushTri(x1, y1, zb1, x2, y2, zt2, x1, y1, zt1);
        pushTri(x1, y1, zb1, x2, y2, zb2, x2, y2, zt2);
      }
    };

    // left / right
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;

      // LEFT (flip=false)
      wall(xL, yy1, zT(0, iy), zBf(0, iy), xL, yy2, zT(0, iy + 1), zBf(0, iy + 1), false);

      // RIGHT (flip=true)
      wall(xR, yy1, zT(w - 1, iy), zBf(w - 1, iy), xR, yy2, zT(w - 1, iy + 1), zBf(w - 1, iy + 1), true);
    }

    // top / bottom edges
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;

      // TOP edge (flip=false)
      wall(xx1, yT, zT(ix, 0), zBf(ix, 0), xx2, yT, zT(ix + 1, 0), zBf(ix + 1, 0), false);

      // BOTTOM edge (flip=true)
      wall(xx1, yB, zT(ix, h - 1), zBf(ix, h - 1), xx2, yB, zT(ix + 1, h - 1), zBf(ix + 1, h - 1), true);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  // ===================================================================
  // NON-OFFSET = base piatta classica (bottom z=0 + 4 lati)
  // ===================================================================

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
      const zB1 = zTopClassic(normF32[idx(ix + 1, iy)] ?? 0);
      const zC1 = zTopClassic(normF32[idx(ix, iy + 1)] ?? 0);
      const zD1 = zTopClassic(normF32[idx(ix + 1, iy + 1)] ?? 0);

      pushTri(xA, yA, zA, xB, yBv, zB1, xD, yD, zD1);
      pushTri(xA, yA, zA, xD, yD, zD1, xC, yC, zC1);
    }
  }

  // BOTTOM rectangle (z=0), winding verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // Left side
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;
    const z1 = zTopClassic(normF32[idx(0, iy)] ?? 0);
    const z2 = zTopClassic(normF32[idx(0, iy + 1)] ?? 0);

    pushTri(xL, y1, 0, xL, y1, z1, xL, y2, z2);
    pushTri(xL, y1, 0, xL, y2, z2, xL, y2, 0);
  }

  // Right side
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;
    const z1 = zTopClassic(normF32[idx(w - 1, iy)] ?? 0);
    const z2 = zTopClassic(normF32[idx(w - 1, iy + 1)] ?? 0);

    pushTri(xR, y1, 0, xR, y2, z2, xR, y1, z1);
    pushTri(xR, y1, 0, xR, y2, 0, xR, y2, z2);
  }

  // Top edge
  for (let ix = 0; ix < w - 1; ix++) {
    const xx1 = x0 + ix * dx;
    const xx2 = x0 + (ix + 1) * dx;
    const z1 = zTopClassic(normF32[idx(ix, 0)] ?? 0);
    const z2 = zTopClassic(normF32[idx(ix + 1, 0)] ?? 0);

    pushTri(xx1, yT, 0, xx2, yT, z2, xx1, yT, z1);
    pushTri(xx1, yT, 0, xx2, yT, 0, xx2, yT, z2);
  }

  // Bottom edge
  for (let ix = 0; ix < w - 1; ix++) {
    const xx1 = x0 + ix * dx;
    const xx2 = x0 + (ix + 1) * dx;
    const z1 = zTopClassic(normF32[idx(ix, h - 1)] ?? 0);
    const z2 = zTopClassic(normF32[idx(ix + 1, h - 1)] ?? 0);

    pushTri(xx1, yB, 0, xx1, yB, z1, xx2, yB, z2);
    pushTri(xx1, yB, 0, xx2, yB, z2, xx2, yB, 0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
