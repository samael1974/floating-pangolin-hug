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
  // OFFSET MODE (CAD-like): cornice piatta + relief al centro (mesh unica)
  // - Top: griglia allargata (w+2, h+2)
  //   * bordo esterno: z=t (piatta)
  //   * area interna: z = t + depth * H (relief o mold)
  // - Bottom: z=0
  // - Outer walls: chiusura esterna
  // ==========================
  if (baseStyle === "offset") {
    const t = Math.max(baseMm, 0.6);
    const offXY = t;

    const zRelief = (H: number) => {
      const h01 = clamp01(H);
      if (outputMode === "mold") return t + depthMm * (1 - h01);
      return t + depthMm * h01;
    };

    // coordinate griglia interna (coerenti con dx/dy)
    // xL,xR,yT,yB sono già calcolati sopra con dx/dy (NON ridefinirli!)
    // costruiamo una griglia allargata con 1 “anello” esterno piatto
    const w2 = w + 2;
    const h2 = h + 2;

    const xC = new Float32Array(w2);
    const yC = new Float32Array(h2);

    // X: [outer-left] + [inner 0..w-1] + [outer-right]
    xC[0] = xL - offXY;
    for (let ix = 0; ix < w; ix++) xC[ix + 1] = x0 + ix * dx;
    xC[w2 - 1] = xR + offXY;

    // Y: [outer-top] + [inner 0..h-1] + [outer-bottom]
    yC[0] = yT + offXY;
    for (let iy = 0; iy < h; iy++) yC[iy + 1] = y0 - iy * dy;
    yC[h2 - 1] = yB - offXY;

    const idx2 = (ix: number, iy: number) => iy * w2 + ix;

    // Top Z grid
    const zTop = new Float32Array(w2 * h2);
    for (let iy = 0; iy < h2; iy++) {
      for (let ix = 0; ix < w2; ix++) {
        const innerX = ix - 1;
        const innerY = iy - 1;
        const isInner = innerX >= 0 && innerX < w && innerY >= 0 && innerY < h;
        if (isInner) {
          zTop[idx2(ix, iy)] = zRelief(normF32[idx(innerX, innerY)] ?? 0);
        } else {
          zTop[idx2(ix, iy)] = t; // cornice piatta
        }
      }
    }

    // --- TOP surface (mesh unica)
    for (let iy = 0; iy < h2 - 1; iy++) {
      for (let ix = 0; ix < w2 - 1; ix++) {
        const xA = xC[ix],     yA = yC[iy];
        const xB = xC[ix + 1], yBv = yC[iy];
        const xC_ = xC[ix],    yC_ = yC[iy + 1];
        const xD = xC[ix + 1], yD = yC[iy + 1];

        const zA = zTop[idx2(ix, iy)];
        const zB = zTop[idx2(ix + 1, iy)];
        const zCz = zTop[idx2(ix, iy + 1)];
        const zD = zTop[idx2(ix + 1, iy + 1)];

        // stesso winding del resto del file
        pushTri(xA, yA, zA, xB, yBv, zB, xD, yD, zD);
        pushTri(xA, yA, zA, xD, yD, zD, xC_, yC_, zCz);
      }
    }

    // --- BOTTOM surface z=0 (stessa griglia, winding invertito)
    for (let iy = 0; iy < h2 - 1; iy++) {
      for (let ix = 0; ix < w2 - 1; ix++) {
        const xA = xC[ix],     yA = yC[iy];
        const xB = xC[ix + 1], yBv = yC[iy];
        const xC_ = xC[ix],    yC_ = yC[iy + 1];
        const xD = xC[ix + 1], yD = yC[iy + 1];

        // inverti winding per puntare verso -Z
        pushTri(xA, yA, 0, xD, yD, 0, xB, yBv, 0);
        pushTri(xA, yA, 0, xC_, yC_, 0, xD, yD, 0);
      }
    }

    // --- OUTER WALLS (chiusura esterna): perimetro della griglia allargata
    const wallSeg = (
      x1: number, y1: number, z1t: number,
      x2: number, y2: number, z2t: number
    ) => {
      // quad tra top(zTop) e bottom(0)
      // winding coerente (esterno)
      pushTri(x1, y1, 0,  x1, y1, z1t,  x2, y2, z2t);
      pushTri(x1, y1, 0,  x2, y2, z2t,  x2, y2, 0);
    };

    // top outer edge (iy=0), segmentata lungo X
    for (let ix = 0; ix < w2 - 1; ix++) {
      const x1 = xC[ix], x2 = xC[ix + 1];
      const y = yC[0];
      const z1t = zTop[idx2(ix, 0)];
      const z2t = zTop[idx2(ix + 1, 0)];
      wallSeg(x2, y, z2t, x1, y, z1t); // invertito per outward
    }

    // bottom outer edge (iy=h2-1)
    for (let ix = 0; ix < w2 - 1; ix++) {
      const x1 = xC[ix], x2 = xC[ix + 1];
      const y = yC[h2 - 1];
      const z1t = zTop[idx2(ix, h2 - 1)];
      const z2t = zTop[idx2(ix + 1, h2 - 1)];
      wallSeg(x1, y, z1t, x2, y, z2t);
    }

    // left outer edge (ix=0), segmentata lungo Y
    for (let iy = 0; iy < h2 - 1; iy++) {
      const y1 = yC[iy], y2 = yC[iy + 1];
      const x = xC[0];
      const z1t = zTop[idx2(0, iy)];
      const z2t = zTop[idx2(0, iy + 1)];
      wallSeg(x, y2, z2t, x, y1, z1t); // invertito per outward
    }

    // right outer edge (ix=w2-1)
    for (let iy = 0; iy < h2 - 1; iy++) {
      const y1 = yC[iy], y2 = yC[iy + 1];
      const x = xC[w2 - 1];
      const z1t = zTop[idx2(w2 - 1, iy)];
      const z2t = zTop[idx2(w2 - 1, iy + 1)];
      wallSeg(x, y1, z1t, x, y2, z2t);
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
