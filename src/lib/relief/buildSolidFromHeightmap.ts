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

  // ==========================
  // OFFSET MODE (baseOffset "CAD": bordo XY + top band + bottom unico)
  // ==========================
  if (baseStyle === "offset") {downloadReliefStlBinary
    const t = Math.max(baseMm, 0.6); // spessore base/top band (min)
    const offXY = t;                // margine XY (per ora legato a t)

    const zRelief = (H: number) => {
      const h01 = clamp01(H);
      // relief: base top = t, sopra aggiungi depth
      if (outputMode === "mold") return t + depthMm * (1 - h01);
      return t + depthMm * h01;
    };

    const xL = x0, xR = x0 + widthMm;
    const yT = y0, yB = y0 - heightMm;

    const xL1 = xL - offXY;
    const xR1 = xR + offXY;
    const yT1 = yT + offXY;
    const yB1 = yB - offXY;

    // --- 1) TOP relief surface (inner rect)
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

        const zA = zRelief(normF32[idx(ix, iy)] ?? 0);
        const zB2 = zRelief(normF32[idx(ix + 1, iy)] ?? 0);
        const zC2 = zRelief(normF32[idx(ix, iy + 1)] ?? 0);
        const zD2 = zRelief(normF32[idx(ix + 1, iy + 1)] ?? 0);

        pushTri(xA, yA, zA, xB, yBv, zB2, xD, yD, zD2);
        pushTri(xA, yA, zA, xD, yD, zD2, xC, yC, zC2);
      }
    }

    // helper: quad as 2 tris (keep winding like your other surfaces)
    const quad = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      dx_: number, dy_: number, dz_: number
    ) => {
      pushTri(ax, ay, az, bx, by, bz, cx, cy, cz);
      pushTri(ax, ay, az, cx, cy, cz, dx_, dy_, dz_);
    };

    // --- 2) TOP BAND (flat) around inner rect at z = t
    // top band (between yT..yT1)
    quad(xL1, yT1, t,  xR1, yT1, t,  xR, yT, t,  xL, yT, t);
    // bottom band (between yB1..yB)
    quad(xL,  yB,  t,  xR,  yB,  t,  xR1, yB1, t,  xL1, yB1, t);
    // left band (between xL1..xL)
    quad(xL1, yB1, t,  xL1, yT1, t,  xL,  yT,  t,  xL,  yB,  t);
    // right band (between xR..xR1)
    quad(xR,  yT,  t,  xR1, yT1, t,  xR1, yB1, t,  xR,  yB,  t);

    // --- 3) INNER WALLS: connect relief edge down to top band (z=t) along inner rect
    // left inner wall (x = xL) outward normal ~ -X
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;
      const z1 = zRelief(normF32[idx(0, iy)] ?? 0);
      const z2 = zRelief(normF32[idx(0, iy + 1)] ?? 0);
      pushTri(xL, y1, t,  xL, y1, z1, xL, y2, z2);
      pushTri(xL, y1, t,  xL, y2, z2, xL, y2, t);
    }

    // right inner wall (x = xR) outward normal ~ +X
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;
      const z1 = zRelief(normF32[idx(w - 1, iy)] ?? 0);
      const z2 = zRelief(normF32[idx(w - 1, iy + 1)] ?? 0);
      pushTri(xR, y1, t,  xR, y2, z2, xR, y1, z1);
      pushTri(xR, y1, t,  xR, y2, t,  xR, y2, z2);
    }

    // top inner wall (y = yT) outward normal ~ +Y
    for (let ix = 0; ix < w - 1; ix++) {
      const x1 = x0 + ix * dx;
      const x2 = x0 + (ix + 1) * dx;
      const z1 = zRelief(normF32[idx(ix, 0)] ?? 0);
      const z2 = zRelief(normF32[idx(ix + 1, 0)] ?? 0);
      pushTri(x1, yT, t,  x2, yT, z2, x1, yT, z1);
      pushTri(x1, yT, t,  x2, yT, t,  x2, yT, z2);
    }

    // bottom inner wall (y = yB) outward normal ~ -Y
    for (let ix = 0; ix < w - 1; ix++) {
      const x1 = x0 + ix * dx;
      const x2 = x0 + (ix + 1) * dx;
      const z1 = zRelief(normF32[idx(ix, h - 1)] ?? 0);
      const z2 = zRelief(normF32[idx(ix + 1, h - 1)] ?? 0);
      pushTri(x1, yB, t,  x1, yB, z1, x2, yB, z2);
      pushTri(x1, yB, t,  x2, yB, z2, x2, yB, t);
    }

    // --- 4) OUTER WALLS: outer rect from z=0 to z=t
    // left outer (x = xL1)
    for (let s = 0; s < 1; s++) {
      // segment yB1..yT1 as single quad split in 2 tris
      pushTri(xL1, yB1, 0,  xL1, yB1, t,  xL1, yT1, t);
      pushTri(xL1, yB1, 0,  xL1, yT1, t,  xL1, yT1, 0);
    }
    // right outer (x = xR1)
    for (let s = 0; s < 1; s++) {
      pushTri(xR1, yB1, 0,  xR1, yT1, t,  xR1, yB1, t);
      pushTri(xR1, yB1, 0,  xR1, yT1, 0,  xR1, yT1, t);
    }
    // top outer (y = yT1)
    for (let s = 0; s < 1; s++) {
      pushTri(xL1, yT1, 0,  xR1, yT1, t,  xL1, yT1, t);
      pushTri(xL1, yT1, 0,  xR1, yT1, 0,  xR1, yT1, t);
    }
    // bottom outer (y = yB1)
    for (let s = 0; s < 1; s++) {
      pushTri(xL1, yB1, 0,  xL1, yB1, t,  xR1, yB1, t);
      pushTri(xL1, yB1, 0,  xR1, yB1, t,  xR1, yB1, 0);
    }

    // --- 5) BOTTOM (outer rect) z=0
    pushTri(xL1, yT1, 0,  xR1, yB1, 0,  xR1, yT1, 0);
    pushTri(xL1, yT1, 0,  xL1, yB1, 0,  xR1, yB1, 0);

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
