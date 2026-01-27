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
    // guard-rail anti-NaN / Infinity
    if (!finite(ax) || !finite(ay) || !finite(az) ||
        !finite(bx) || !finite(by) || !finite(bz) ||
        !finite(cx) || !finite(cy) || !finite(cz)) {
      throw new Error("buildSolidFromHeightmap: non-finite vertex");
    }
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // ---------- TOP Z (flat/recessed/mold) ----------
  const zTop = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // dentro la base
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      return baseMm + depthMm * (1 - h01);
    }

    // relief
    return baseMm + depthMm * h01;
  };

  // ==========================
  // OFFSET MODE (guscio + ring XY)
  // ==========================
 if (baseStyle === "offset") {
  const t = Math.max(baseMm, 0.6); // spessore guscio (min)
  const offXY = t; // cornice in XY

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

  const zShift = -minZ; // porta min(bottom)=0 (tipicamente = t)
  const zT = (ix: number, iy: number) => zTopGrid[idx(ix, iy)] + zShift;
  const zB = (ix: number, iy: number) => zBotGrid[idx(ix, iy)] + zShift;

  // Griglia allargata (w+2, h+2)
  const w2 = w + 2;
  const h2 = h + 2;

  const xG = new Float32Array(w2);
  const yG = new Float32Array(h2);

  // bounds coerenti con dx/dy (evita drift numerico)
  const xL = x0;
  const xR = x0 + (w - 1) * dx;
  const yT0 = y0;
  const yB0 = y0 - (h - 1) * dy;

  xG[0] = xL - offXY;
  for (let ix = 0; ix < w; ix++) xG[ix + 1] = x0 + ix * dx;
  xG[w2 - 1] = xR + offXY;

  yG[0] = yT0 + offXY;
  for (let iy = 0; iy < h; iy++) yG[iy + 1] = y0 - iy * dy;
  yG[h2 - 1] = yB0 - offXY;

  const idx2 = (ix: number, iy: number) => iy * w2 + ix;

  const zTop2 = new Float32Array(w2 * h2);
  const zBot2 = new Float32Array(w2 * h2);

  for (let iy = 0; iy < h2; iy++) {
    for (let ix = 0; ix < w2; ix++) {
      const innerX = ix - 1;
      const innerY = iy - 1;
      const isInner = innerX >= 0 && innerX < w && innerY >= 0 && innerY < h;

      if (isInner) {
        zTop2[idx2(ix, iy)] = zT(innerX, innerY);
        zBot2[idx2(ix, iy)] = zB(innerX, innerY);
      } else {
        // cornice solida: spessore t (top=t, bottom=0)
        zTop2[idx2(ix, iy)] = t;
        zBot2[idx2(ix, iy)] = 0;
      }
    }
  }

  // TOP surface (winding coerente col resto)
  for (let iy = 0; iy < h2 - 1; iy++) {
    for (let ix = 0; ix < w2 - 1; ix++) {
      const xA = xG[ix],
        yA = yG[iy];
      const xB = xG[ix + 1],
        yBv = yG[iy];
      const xC = xG[ix],
        yC = yG[iy + 1];
      const xD = xG[ix + 1],
        yD = yG[iy + 1];

      const zA = zTop2[idx2(ix, iy)];
      const zBv2 = zTop2[idx2(ix + 1, iy)];
      const zC2 = zTop2[idx2(ix, iy + 1)];
      const zD2 = zTop2[idx2(ix + 1, iy + 1)];

      pushTri(xA, yA, zA, xB, yBv, zBv2, xD, yD, zD2);
      pushTri(xA, yA, zA, xD, yD, zD2, xC, yC, zC2);
    }
  }

  // BOTTOM surface (winding invertito, verso -Z)
  for (let iy = 0; iy < h2 - 1; iy++) {
    for (let ix = 0; ix < w2 - 1; ix++) {
      const xA = xG[ix],
        yA = yG[iy];
      const xB = xG[ix + 1],
        yBv = yG[iy];
      const xC = xG[ix],
        yC = yG[iy + 1];
      const xD = xG[ix + 1],
        yD = yG[iy + 1];

      const zA = zBot2[idx2(ix, iy)];
      const zBv2 = zBot2[idx2(ix + 1, iy)];
      const zC2 = zBot2[idx2(ix, iy + 1)];
      const zD2 = zBot2[idx2(ix + 1, iy + 1)];

      pushTri(xA, yA, zA, xD, yD, zD2, xB, yBv, zBv2);
      pushTri(xA, yA, zA, xC, yC, zC2, xD, yD, zD2);
    }
  }

  // OUTER WALLS: chiusura solo sul perimetro esterno
  const wallSeg = (
    x1: number,
    y1: number,
    z1t: number,
    z1b: number,
    x2: number,
    y2: number,
    z2t: number,
    z2b: number
  ) => {
    pushTri(x1, y1, z1b, x1, y1, z1t, x2, y2, z2t);
    pushTri(x1, y1, z1b, x2, y2, z2t, x2, y2, z2b);
  };

  // top edge (iy=0)
  for (let ix = 0; ix < w2 - 1; ix++) {
    wallSeg(
      xG[ix + 1],
      yG[0],
      zTop2[idx2(ix + 1, 0)],
      zBot2[idx2(ix + 1, 0)],
      xG[ix],
      yG[0],
      zTop2[idx2(ix, 0)],
      zBot2[idx2(ix, 0)]
    );
  }

  // bottom edge (iy=h2-1)
  for (let ix = 0; ix < w2 - 1; ix++) {
    wallSeg(
      xG[ix],
      yG[h2 - 1],
      zTop2[idx2(ix, h2 - 1)],
      zBot2[idx2(ix, h2 - 1)],
      xG[ix + 1],
      yG[h2 - 1],
      zTop2[idx2(ix + 1, h2 - 1)],
      zBot2[idx2(ix + 1, h2 - 1)]
    );
  }

  // left edge (ix=0)
  for (let iy = 0; iy < h2 - 1; iy++) {
    wallSeg(
      xG[0],
      yG[iy + 1],
      zTop2[idx2(0, iy + 1)],
      zBot2[idx2(0, iy + 1)],
      xG[0],
      yG[iy],
      zTop2[idx2(0, iy)],
      zBot2[idx2(0, iy)]
    );
  }

  // right edge (ix=w2-1)
  for (let iy = 0; iy < h2 - 1; iy++) {
    wallSeg(
      xG[w2 - 1],
      yG[iy],
      zTop2[idx2(w2 - 1, iy)],
      zBot2[idx2(w2 - 1, iy)],
      xG[w2 - 1],
      yG[iy + 1],
      zTop2[idx2(w2 - 1, iy + 1)],
      zBot2[idx2(w2 - 1, iy + 1)]
    );
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}
