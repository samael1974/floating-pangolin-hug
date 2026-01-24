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

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

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

  // immagine: Y cresce verso il basso -> in THREE vogliamo Y verso l’alto
  const y0 = heightMm / 2;

  // --- TOP Z ---
  const zTop = (H: number) => {
    const h01 = clamp01(H);

    if (baseStyle === "recessed") {
      // cavità: scende dentro la base
      return Math.max(0, baseMm - depthMm * h01);
    }

    if (outputMode === "mold") {
      // stampo invertito (senza cavità)
      return baseMm + depthMm * (1 - h01);
    }

    // rilievo positivo
    return baseMm + depthMm * h01;
  };

  // --- BOTTOM Z per OFFSET (mesh aperta) ---
  // vogliamo “due pelli” identiche: bottom = top - baseMm
  const zBottomOffset = (H: number) => zTop(H) - baseMm;

  const verts: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);

  // --------------------------
  // TOP surface (sempre)
  // --------------------------
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const xA = x0 + ix * dx;
      const yA = y0 - iy * dy;           // ✅ invert Y
      const xB = x0 + (ix + 1) * dx;
      const yB = yA;
      const xC = xA;
      const yC = y0 - (iy + 1) * dy;     // ✅ invert Y
      const xD = xB;
      const yD = yC;

      const zA = zTop(normF32[idx(ix, iy)] ?? 0);
      const zB = zTop(normF32[idx(ix + 1, iy)] ?? 0);
      const zC = zTop(normF32[idx(ix, iy + 1)] ?? 0);
      const zD = zTop(normF32[idx(ix + 1, iy + 1)] ?? 0);

      // winding coerente
      pushTri(xA, yA, zA, xB, yB, zB, xD, yD, zD);
      pushTri(xA, yA, zA, xD, yD, zD, xC, yC, zC);
    }
  }

  // --------------------------
  // OFFSET: aggiungi BOTTOM “displacement duplicato”
  // (mesh APERTA: niente fianchi, niente tappo)
  // --------------------------
  if (baseStyle === "offset") {
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const xA = x0 + ix * dx;
        const yA = y0 - iy * dy;           // ✅ invert Y
        const xB = x0 + (ix + 1) * dx;
        const yB = yA;
        const xC = xA;
        const yC = y0 - (iy + 1) * dy;     // ✅ invert Y
        const xD = xB;
        const yD = yC;

        const zA = zBottomOffset(normF32[idx(ix, iy)] ?? 0);
        const zB = zBottomOffset(normF32[idx(ix + 1, iy)] ?? 0);
        const zC = zBottomOffset(normF32[idx(ix, iy + 1)] ?? 0);
        const zD = zBottomOffset(normF32[idx(ix + 1, iy + 1)] ?? 0);

        // winding INVERTITO (così le normali puntano “giù”)
        pushTri(xA, yA, zA, xD, yD, zD, xB, yB, zB);
        pushTri(xA, yA, zA, xC, yC, zC, xD, yD, zD);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  // --------------------------
  // NON-OFFSET: qui resta la tua mesh CHIUSA
  // bottom piatto + fianchi
  // --------------------------
  const xL = x0;
  const xR = x0 + widthMm;
  const yT = y0;
  const yB = y0 - heightMm; // ✅ invert Y (top is +, bottom is -)

  // BOTTOM (z=0)
  // winding per normali verso -Z
  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // SIDES
  // Left
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 - iy * dy;
    const y2 = y0 - (iy + 1) * dy;
    const z1 = zTop(normF32[idx(0, iy)] ?? 0);
    const z2 = zTop(normF32[idx(0, iy + 1)] ?? 0);
    pushTri(xL, y1, 0, xL, y1, z1, xL, y2, z2);
    pushTri(xL, y1, 0, xL, y2, z2, xL, y2, 0);
  }

  // Right
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.computeVertexNormals();
  return geometry;
}
