import * as THREE from "three";
import type { OutputMode, BaseStyle } from "@/components/relief/ReliefControls";

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
  if (depthMm < 0) throw new Error("Solid build: depthMm must be >= 0");
  if (baseMm < 0) throw new Error("Solid build: baseMm must be >= 0");

  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;
  const y0 = -heightMm / 2;

  const idx = (ix: number, iy: number) => iy * w + ix;

  // --- TOP surface Z ---
  // relief + flat:     z = baseMm + depthMm * H
  // mold + recessed:   z = baseMm - depthMm * H  (clamp >= 0)
  // altri mix: comportamenti coerenti e non ambigui
  const topZ = (H: number) => {
    const h01 = Math.max(0, Math.min(1, H));

    if (outputMode === "relief") {
      // rilievo positivo
      return baseMm + depthMm * h01;
    }

    // outputMode === "mold"
    if (baseStyle === "recessed") {
      // cavità: scende dentro la base
      return Math.max(0, baseMm - depthMm * h01);
    }

    // baseStyle === "flat": stampo "piatto" (in pratica inversione senza cavità)
    // tiene la stessa "altezza totale" ma invertita
    return baseMm + depthMm * (1 - h01);
  };

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);

  // TOP (due triangoli per cella)
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const yA = y0 + iy * dy;
      const xB = x0 + (ix + 1) * dx;
      const yB = yA;
      const xC = xA;
      const yC = y0 + (iy + 1) * dy;
      const xD = xB;
      const yD = yC;

      const zA = topZ(normF32[idx(ix, iy)]);
      const zB = topZ(normF32[idx(ix + 1, iy)]);
      const zC = topZ(normF32[idx(ix, iy + 1)]);
      const zD = topZ(normF32[idx(ix + 1, iy + 1)]);

      pushTri(xA, yA, zA, xB, yB, zB, xD, yD, zD);
      pushTri(xA, yA, zA, xD, yD, zD, xC, yC, zC);
    }
  }

  // BOTTOM (z=0) – winding for normals DOWN
  const xL = x0;
  const xR = x0 + widthMm;
  const yT = y0;
  const yB = y0 + heightMm;

  // Triangles oriented clockwise when seen from +Z => normals -Z
  pushTri(xL, yT, 0, xR, yT, 0, xR, yB, 0);
  pushTri(xL, yT, 0, xR, yB, 0, xL, yB, 0);

  // SIDES (collegano topZ al bottom z=0)
  // Left (-X)
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 + iy * dy;
    const y2 = y0 + (iy + 1) * dy;
    const z1 = topZ(normF32[idx(0, iy)]);
    const z2 = topZ(normF32[idx(0, iy + 1)]);
    pushTri(xL, y1, 0, xL, y1, z1, xL, y2, z2);
    pushTri(xL, y1, 0, xL, y2, z2, xL, y2, 0);
  }

  // Right (+X)
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 + iy * dy;
    const y2 = y0 + (iy + 1) * dy;
    const z1 = topZ(normF32[idx(w - 1, iy)]);
    const z2 = topZ(normF32[idx(w - 1, iy + 1)]);
    pushTri(xR, y1, 0, xR, y2, z2, xR, y1, z1);
    pushTri(xR, y1, 0, xR, y2, 0, xR, y2, z2);
  }

  // Top edge (-Y)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = topZ(normF32[idx(ix, 0)]);
    const z2 = topZ(normF32[idx(ix + 1, 0)]);
    pushTri(x1, yT, 0, x2, yT, z2, x1, yT, z1);
    pushTri(x1, yT, 0, x2, yT, 0, x2, yT, z2);
  }

  // Bottom edge (+Y)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = topZ(normF32[idx(ix, h - 1)]);
    const z2 = topZ(normF32[idx(ix + 1, h - 1)]);
    pushTri(x1, yB, 0, x1, yB, z1, x2, yB, z2);
    pushTri(x1, yB, 0, x2, yB, z2, x2, yB, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.computeVertexNormals();
  return geometry;
}
