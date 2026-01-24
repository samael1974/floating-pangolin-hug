import * as THREE from "three";
import type { OutputMode, BaseStyle } from "@/lib/reliefTypes";

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

  const idx = (x: number, y: number) => y * w + x;

  const aspect = h / w;
  const heightMm = widthMm * aspect;

  const dx = widthMm / (w - 1);
  const dy = heightMm / (h - 1);

  const x0 = -widthMm / 2;

  // Y in canvas cresce verso il basso, in Three vogliamo “su” positivo.
  // Quindi: start da +height/2 e scendiamo sottraendo.
  const yTop = heightMm / 2;

  const topZ = (H: number) => {
    const h01 = Math.max(0, Math.min(1, H));

    if (baseStyle === "recessed") {
      // cavità dentro la base
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      return baseMm + depthMm * (1 - h01);
    }

    // relief positivo
    return baseMm + depthMm * h01;
  };

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);

  // TOP
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const xB = x0 + (ix + 1) * dx;

      const yA = yTop - iy * dy;
      const yC = yTop - (iy + 1) * dy;

      const xC = xA;
      const xD = xB;

      const yB = yA;
      const yD = yC;

      const zA = topZ(normF32[idx(ix, iy)]);
      const zB = topZ(normF32[idx(ix + 1, iy)]);
      const zC = topZ(normF32[idx(ix, iy + 1)]);
      const zD = topZ(normF32[idx(ix + 1, iy + 1)]);

      pushTri(xA, yA, zA, xB, yB, zB, xD, yD, zD);
      pushTri(xA, yA, zA, xD, yD, zD, xC, yC, zC);
    }
  }

  // BOTTOM piatto z=0
  const xL = x0;
  const xR = x0 + widthMm;
  const yT = yTop;
  const yB = yTop - heightMm;

  // winding verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // SIDES
  // Left
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = yTop - iy * dy;
    const y2 = yTop - (iy + 1) * dy;
    const z1 = topZ(normF32[idx(0, iy)]);
    const z2 = topZ(normF32[idx(0, iy + 1)]);
    pushTri(xL, y1, 0, xL, y1, z1, xL, y2, z2);
    pushTri(xL, y1, 0, xL, y2, z2, xL, y2, 0);
  }

  // Right
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = yTop - iy * dy;
    const y2 = yTop - (iy + 1) * dy;
    const z1 = topZ(normF32[idx(w - 1, iy)]);
    const z2 = topZ(normF32[idx(w - 1, iy + 1)]);
    pushTri(xR, y1, 0, xR, y2, z2, xR, y1, z1);
    pushTri(xR, y1, 0, xR, y2, 0, xR, y2, z2);
  }

  // Top edge (yT)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = topZ(normF32[idx(ix, 0)]);
    const z2 = topZ(normF32[idx(ix + 1, 0)]);
    pushTri(x1, yT, 0, x2, yT, z2, x1, yT, z1);
    pushTri(x1, yT, 0, x2, yT, 0, x2, yT, z2);
  }

  // Bottom edge (yB)
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
