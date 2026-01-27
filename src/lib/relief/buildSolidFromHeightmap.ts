// src/lib/relief/buildSolidFromHeightmap.ts
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

  // XY plane, Z thickness (STL slicer friendly: Z-up)
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

  // TOP Z per modalità "classiche" (flat/recessed + relief/mold)
  const zTopClassic = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // incavo verso il basso dentro la base
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      // stampo inverso
      return baseMm + depthMm * (1 - h01);
    }

    // relief standard
    return baseMm + depthMm * h01;
  };

  const verts: number[] = [];

  // pushTri con guard-rail anti NaN e anti triangoli degeneri
  const EPS_AREA = 1e-18;
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    if (
      !finite(ax) || !finite(ay) || !finite(az) ||
      !finite(bx) || !finite(by) || !finite(bz) ||
      !finite(cx) || !finite(cy) || !finite(cz)
    ) return;

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const area2 = nx * nx + ny * ny + nz * nz;
    if (area2 < EPS_AREA) return;

    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // =====================================================
  // OFFSET MODE = guscio vero (TOP + BOTTOM parallelo) + pareti + shift minZ=0
  // =====================================================
  if (baseStyle === "offset") {
    // spessore guscio minimo (non stampabile sotto)
    const t = Math.max(baseMm, 0.8);

    // in offset: TOP sta in 0..depthMm (non aggiungere "baseMm +")
    const zTopOff = (H: number) => {
      const h01 = clamp01(H);
      return outputMode === "mold" ? depthMm * (1 - h01) : depthMm * h01;
    };

    // precompute top/bottom + shift per portare min(bottom)=0
    const zT = new Float32Array(w * h);
    const zB = new Float32Array(w * h);

    let minZ = Number.POSITIVE_INFINITY;
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const zt = zTopOff(normF32[idx(ix, iy)] ?? 0);
        const zb = zt - t;
        zT[idx(ix, iy)] = zt;
        zB[idx(ix, iy)] = zb;
        if (zb < minZ) minZ = zb;
      }
    }
    const zShift = -minZ;

    const topZ = (ix: number, iy: number) => zT[idx(ix, iy)] + zShift;
    const botZ = (ix: number, iy: number) => zB[idx(ix, iy)] + zShift;

    // TOP surface
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const xA = x0 + ix * dx;
        const yA = y0 - iy * dy;
        const xB = x0 + (ix + 1) * dx;
        const yBcell = yA;
        const xC = xA;
        const yC = y0 - (iy + 1) * dy;
        const xD = xB;
        const yD = yC;

        const zA = topZ(ix, iy);
        const zB1 = topZ(ix + 1, iy);
        const zC1 = topZ(ix, iy + 1);
        const zD1 = topZ(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xB, yBcell, zB1, xD, yD, zD1);
        pushTri(xA, yA, zA, xD, yD, zD1, xC, yC, zC1);
      }
    }

    // BOTTOM surface (winding verso -Z)
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const xA = x0 + ix * dx;
        const yA = y0 - iy * dy;
        const xB = x0 + (ix + 1) * dx;
        const yBcell = yA;
        const xC = xA;
        const yC = y0 - (iy + 1) * dy;
        const xD = xB;
        const yD = yC;

        const zA = botZ(ix, iy);
        const zB1 = botZ(ix + 1, iy);
        const zC1 = botZ(ix, iy + 1);
        const zD1 = botZ(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xD, yD, zD1, xB, yBcell, zB1);
        pushTri(xA, yA, zA, xC, yC, zC1, xD, yD, zD1);
      }
    }

    // pareti perimetrali tra top e bottom
    const wall = (
      x1: number, y1: number, zt1: number, zb1: number,
      x2: number, y2: number, zt2: number, zb2: number,
      flip: boolean
    ) => {
      if (!flip) {
        pushTri(x1, y1, zb1, x1, y1, zt1, x2, y2, zt2);
        pushTri(x1, y1, zb1, x2, y2, zt2, x2, y2, zb2);
      } else {
        pushTri(x1, y1, zb1, x2, y2, zt2, x1, y1, zt1);
        pushTri(x1, y1, zb1, x2, y2, zb2, x2, y2, zt2);
      }
    };

    // LEFT / RIGHT
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;

      wall(xL, yy1, topZ(0, iy), botZ(0, iy), xL, yy2, topZ(0, iy + 1), botZ(0, iy + 1), false);
      wall(xR, yy1, topZ(w - 1, iy), botZ(w - 1, iy), xR, yy2, topZ(w - 1, iy + 1), botZ(w - 1, iy + 1), true);
    }

    // TOP / BOTTOM edges
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;

      wall(xx1, yT, topZ(ix, 0), botZ(ix, 0), xx2, yT, topZ(ix + 1, 0), botZ(ix + 1, 0), false);
      wall(xx1, yB, topZ(ix, h - 1), botZ(ix, h - 1), xx2, yB, topZ(ix + 1, h - 1), botZ(ix + 1, h - 1), true);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  // =====================================================
  // CLASSIC MODE (flat/recessed + relief/mold) = base chiusa classica
  // =====================================================

  // TOP surface (sempre)
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const yA = y0 - iy * dy;
      const xB = x0 + (ix + 1) * dx;
      const yBcell = yA;
      const xC = xA;
      const yC = y0 - (iy + 1) * dy;
      const xD = xB;
      const yD = yC;

      const zA = zTopClassic(normF32[idx(ix, iy)] ?? 0);
      const zB1 = zTopClassic(normF32[idx(ix + 1, iy)] ?? 0);
      const zC1 = zTopClassic(normF32[idx(ix, iy + 1)] ?? 0);
      const zD1 = zTopClassic(normF32[idx(ix + 1, iy + 1)] ?? 0);

      pushTri(xA, yA, zA, xB, yBcell, zB1, xD, yD, zD1);
      pushTri(xA, yA, zA, xD, yD, zD1, xC, yC, zC1);
    }
  }

  // bottom rectangle (z=0), winding verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // Left side
  for (let iy = 0; iy < h - 1; iy++) {
    const yy1 = y0 - iy * dy;
    const yy2 = y0 - (iy + 1) * dy;

    const z1 = zTopClassic(normF32[idx(0, iy)] ?? 0);
    const z2 = zTopClassic(normF32[idx(0, iy + 1)] ?? 0);

    pushTri(xL, yy1, 0, xL, yy1, z1, xL, yy2, z2);
    pushTri(xL, yy1, 0, xL, yy2, z2, xL, yy2, 0);
  }

  // Right side
  for (let iy = 0; iy < h - 1; iy++) {
    const yy1 = y0 - iy * dy;
    const yy2 = y0 - (iy + 1) * dy;

    const z1 = zTopClassic(normF32[idx(w - 1, iy)] ?? 0);
    const z2 = zTopClassic(normF32[idx(w - 1, iy + 1)] ?? 0);

    pushTri(xR, yy1, 0, xR, yy2, z2, xR, yy1, z1);
    pushTri(xR, yy1, 0, xR, yy2, 0, xR, yy2, z2);
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
