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

export function buildSolidFromHeightmap(args: BuildSolidArgs): THREE.BufferGeometry {
  const { normF32, w, h, widthMm, depthMm, baseMm, outputMode, baseStyle } = args;

  if (w < 2 || h < 2) throw new Error("Solid build: w/h too small");
  if (normF32.length !== w * h) throw new Error("Solid build: normF32 size mismatch");
  if (!(widthMm > 0)) throw new Error("Solid build: widthMm must be > 0");

  const idx = (x: number, y: number) => y * w + x;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;
  const y0 = heightMm / 2;

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // ---------------------------------------
  // Modalità NON-offset: solido classico
  // ---------------------------------------
  const baseEffMm = baseMm;

  const zTopClassic = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // “scavato” dentro la base
      return Math.max(0, baseEffMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      // stampo: inverti profondità
      return baseEffMm + depthMm * (1 - h01);
    }

    // relief normale
    return baseEffMm + depthMm * h01;
  };

  // ---------------------------------------
  // Modalità OFFSET (guscio cavo)
  // ---------------------------------------
  if (baseStyle === "offset") {
    verts.length = 0;

    const t = Math.max(baseMm, 0.6);   // spessore guscio
    const offXY = t;                  // lip XY (CAD-like)

    // TOP in range 0..depthMm (senza aggiungere baseMm)
    const zTopOffset = (H: number) => {
      const h01 = clamp01(H);
      if (outputMode === "mold") return depthMm * (1 - h01);
      return depthMm * h01;
    };

    const zTopGrid = new Float32Array(w * h);
    const zBotGrid = new Float32Array(w * h);

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

    const zShift = -minZ; // porta min(bottom)=0

    const zT = (ix: number, iy: number) => zTopGrid[idx(ix, iy)] + zShift;
    const zB = (ix: number, iy: number) => zBotGrid[idx(ix, iy)] + zShift;

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

        const zA = zT(ix, iy);
        const zB1 = zT(ix + 1, iy);
        const zC1 = zT(ix, iy + 1);
        const zD1 = zT(ix + 1, iy + 1);

        pushTri(xA, yA, zA, xB, yBv, zB1, xD, yD, zD1);
        pushTri(xA, yA, zA, xD, yD, zD1, xC, yC, zC1);
      }
    }

    // BOTTOM surface (winding invertito)
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

    // Side walls lungo il perimetro rettangolare
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
    // right
    for (let iy = 0; iy < h - 1; iy++) {
      const yy1 = y0 - iy * dy;
      const yy2 = y0 - (iy + 1) * dy;
      wall(xR, yy2, zT(w - 1, iy + 1), zB(w - 1, iy + 1), xR, yy1, zT(w - 1, iy), zB(w - 1, iy));
    }
    // top edge
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      wall(xx1, yT0, zT(ix, 0), zB(ix, 0), xx2, yT0, zT(ix + 1, 0), zB(ix + 1, 0));
    }
    // bottom edge
    for (let ix = 0; ix < w - 1; ix++) {
      const xx1 = x0 + ix * dx;
      const xx2 = x0 + (ix + 1) * dx;
      wall(xx2, yB0, zT(ix + 1, h - 1), zB(ix + 1, h - 1), xx1, yB0, zT(ix, h - 1), zB(ix, h - 1));
    }

    // Lip XY a Z=0 (ring rettangolare esterno)
    const xL1 = xL - offXY;
    const xR1 = xR + offXY;
    const yT1 = yT0 + offXY;
    const yB1 = yB0 - offXY;

    // ring a z=0 (8 triangoli)
    // top band
    pushTri(xL1, yT1, 0, xR1, yT1, 0, xR, yT0, 0);
    pushTri(xL1, yT1, 0, xR, yT0, 0, xL, yT0, 0);
    // bottom band
    pushTri(xL, yB0, 0, xR, yB0, 0, xR1, yB1, 0);
    pushTri(xL, yB0, 0, xR1, yB1, 0, xL1, yB1, 0);
    // left band
    pushTri(xL1, yB1, 0, xL1, yT1, 0, xL, yT0, 0);
    pushTri(xL1, yB1, 0, xL, yT0, 0, xL, yB0, 0);
    // right band
    pushTri(xR, yT0, 0, xR1, yT1, 0, xR1, yB1, 0);
    pushTri(xR, yT0, 0, xR1, yB1, 0, xR, yB0, 0);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------
  // CLASSICO (flat/recessed)
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

  const xL = x0;
  const xR = x0 + widthMm;
  const yT = y0;
  const yB = y0 - heightMm;

  // bottom plane z=0
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // sides
  for (let iy = 0; iy < h - 1; iy++) {
    const yy1 = y0 - iy * dy;
    const yy2 = y0 - (iy + 1) * dy;

    const zL1 = zTopClassic(normF32[idx(0, iy)] ?? 0);
    const zL2 = zTopClassic(normF32[idx(0, iy + 1)] ?? 0);
    pushTri(xL, yy1, 0, xL, yy1, zL1, xL, yy2, zL2);
    pushTri(xL, yy1, 0, xL, yy2, zL2, xL, yy2, 0);

    const zR1 = zTopClassic(normF32[idx(w - 1, iy)] ?? 0);
    const zR2 = zTopClassic(normF32[idx(w - 1, iy + 1)] ?? 0);
    pushTri(xR, yy1, 0, xR, yy2, zR2, xR, yy1, zR1);
    pushTri(xR, yy1, 0, xR, yy2, 0, xR, yy2, zR2);
  }

  for (let ix = 0; ix < w - 1; ix++) {
    const xx1 = x0 + ix * dx;
    const xx2 = x0 + (ix + 1) * dx;

    const zT1 = zTopClassic(normF32[idx(ix, 0)] ?? 0);
    const zT2 = zTopClassic(normF32[idx(ix + 1, 0)] ?? 0);
    pushTri(xx1, yT, 0, xx2, yT, zT2, xx1, yT, zT1);
    pushTri(xx1, yT, 0, xx2, yT, 0, xx2, yT, zT2);

    const zB1 = zTopClassic(normF32[idx(ix, h - 1)] ?? 0);
    const zB2 = zTopClassic(normF32[idx(ix + 1, h - 1)] ?? 0);
    pushTri(xx1, yB, 0, xx1, yB, zB1, xx2, yB, zB2);
    pushTri(xx1, yB, 0, xx2, yB, zB2, xx2, yB, 0);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
