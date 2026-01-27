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
  const xR = x0 + (w - 1) * dx;   // << usa dx (stesso identico calcolo della griglia)
  const yT = y0;
  const yB = y0 - (h - 1) * dy;   // << usa dy (stesso identico calcolo della griglia)


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
  if (baseStyle === "offset") {
    const t = Math.max(baseMm, 0.6); // spessore base/top band (min)
    const offXY = t;                // margine XY (per ora legato a t)

    const zRelief = (H: number) => {
      const h01 = clamp01(H);
      if (outputMode === "mold") return t + depthMm * (1 - h01);
      return t + depthMm * h01;
    };

    // IMPORTANTISSIMO: usa SEMPRE i bordi derivati dalla griglia (dx/dy)
    // (xL, xR, yT, yB) sono già definiti sopra in modo coerente con i vertici.
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

    // helper: quad as 2 tris
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
    // Inner edge = segmentato (match con inner walls)
    // Outer edge = SOLO 4 angoli (match con outer walls)

    // TOP band polygon: outerTL -> outerTR -> innerTop from right->left
    const outerTL: [number, number] = [xL1, yT1];
    const outerTR: [number, number] = [xR1, yT1];

    // Fan from outerTL
    {
      // sequence: outerTR, then inner-top vertices from right to left
      let prevX = outerTR[0], prevY = outerTR[1];
      for (let ix = w - 1; ix >= 0; ix--) {
        const x = x0 + ix * dx;
        const y = yT;
        // triangle: outerTL -> prev -> current
        pushTri(outerTL[0], outerTL[1], t,  prevX, prevY, t,  x, y, t);
        prevX = x; prevY = y;
      }
    }

    // BOTTOM band polygon: outerBL -> innerBottom left->right -> outerBR
    const outerBL: [number, number] = [xL1, yB1];
    const outerBR: [number, number] = [xR1, yB1];

    // Fan from outerBL
    {
      // sequence: inner-bottom vertices from left to right, then outerBR
      let prevX = x0 + 0 * dx, prevY = yB;
      for (let ix = 1; ix < w; ix++) {
        const x = x0 + ix * dx;
        const y = yB;
        pushTri(outerBL[0], outerBL[1], t,  prevX, prevY, t,  x, y, t);
        prevX = x; prevY = y;
      }
      // last triangle to outerBR
      pushTri(outerBL[0], outerBL[1], t,  prevX, prevY, t,  outerBR[0], outerBR[1], t);
    }

    // LEFT band polygon: outerBL -> outerTL -> innerLeft top->bottom
    const outerLT: [number, number] = [xL1, yT1]; // same as outerTL
    const outerLB: [number, number] = [xL1, yB1]; // same as outerBL

    // Fan from outerLB
    {
      let prevX = outerLT[0], prevY = outerLT[1];
      for (let iy = 0; iy < h; iy++) {
        const x = xL;
        const y = y0 - iy * dy;
        pushTri(outerLB[0], outerLB[1], t,  prevX, prevY, t,  x, y, t);
        prevX = x; prevY = y;
      }
    }

    // RIGHT band polygon: outerRT -> outerRB -> innerRight bottom->top
    const outerRT: [number, number] = [xR1, yT1];
    const outerRB: [number, number] = [xR1, yB1];

    // Fan from outerRT
    {
      let prevX = outerRB[0], prevY = outerRB[1];
      for (let iy = h - 1; iy >= 0; iy--) {
        const x = xR;
        const y = y0 - iy * dy;
        pushTri(outerRT[0], outerRT[1], t,  prevX, prevY, t,  x, y, t);
        prevX = x; prevY = y;
      }
    }


    // --- 3) INNER WALLS: connect relief edge down to top band (z=t) along inner rect

    // left inner wall (x = xL)
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;
      const z1 = zRelief(normF32[idx(0, iy)] ?? 0);
      const z2 = zRelief(normF32[idx(0, iy + 1)] ?? 0);
      pushTri(xL, y1, t,  xL, y1, z1, xL, y2, z2);
      pushTri(xL, y1, t,  xL, y2, z2, xL, y2, t);
    }

    // right inner wall (x = xR)
    for (let iy = 0; iy < h - 1; iy++) {
      const y1 = y0 - iy * dy;
      const y2 = y0 - (iy + 1) * dy;
      const z1 = zRelief(normF32[idx(w - 1, iy)] ?? 0);
      const z2 = zRelief(normF32[idx(w - 1, iy + 1)] ?? 0);
      pushTri(xR, y1, t,  xR, y2, z2, xR, y1, z1);
      pushTri(xR, y1, t,  xR, y2, t,  xR, y2, z2);
    }

    // top inner wall (y = yT)
    for (let ix = 0; ix < w - 1; ix++) {
      const x1 = x0 + ix * dx;
      const x2 = x0 + (ix + 1) * dx;
      const z1 = zRelief(normF32[idx(ix, 0)] ?? 0);
      const z2 = zRelief(normF32[idx(ix + 1, 0)] ?? 0);
      pushTri(x1, yT, t,  x2, yT, z2, x1, yT, z1);
      pushTri(x1, yT, t,  x2, yT, t,  x2, yT, z2);
    }

    // bottom inner wall (y = yB)
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
    pushTri(xL1, yB1, 0,  xL1, yB1, t,  xL1, yT1, t);
    pushTri(xL1, yB1, 0,  xL1, yT1, t,  xL1, yT1, 0);

    // right outer (x = xR1)
    pushTri(xR1, yB1, 0,  xR1, yT1, t,  xR1, yB1, t);
    pushTri(xR1, yB1, 0,  xR1, yT1, 0,  xR1, yT1, t);

    // top outer (y = yT1)
    pushTri(xL1, yT1, 0,  xR1, yT1, t,  xL1, yT1, t);
    pushTri(xL1, yT1, 0,  xR1, yT1, 0,  xR1, yT1, t);

    // bottom outer (y = yB1)
    pushTri(xL1, yB1, 0,  xL1, yB1, t,  xR1, yB1, t);
    pushTri(xL1, yB1, 0,  xR1, yB1, t,  xR1, yB1, 0);

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
