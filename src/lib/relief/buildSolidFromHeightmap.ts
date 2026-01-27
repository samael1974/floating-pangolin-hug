// src/lib/relief/buildSolidFromHeightmap.ts
import * as THREE from "three";

export type BaseStyle = "flat" | "recessed" | "offset";

export type BuildSolidFromHeightmapInput = {
  // height normalized [0..1], length = width*height
  height01: Float32Array;
  width: number;
  height: number;

  // physical params
  outWidthMm: number;     // final STL X size in mm
  depthMm: number;        // relief amplitude (mm)
  baseMm: number;         // base thickness (mm)
  baseStyle: BaseStyle;   // flat | recessed | offset

  // optional
  invert?: boolean;       // invert height
  clampHeights?: boolean; // clamp height01 to [0..1]
};

export type BuildSolidFromHeightmapOutput = {
  geometry: THREE.BufferGeometry;
  vertices: Float32Array; // xyz packed
  indices: Uint32Array;   // triangle indices
};

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function idxOf(x: number, y: number, w: number) {
  return y * w + x;
}

/**
 * Build a CLOSED (manifold) mesh from a heightmap grid.
 *
 * Base styles (pragmatic + slicer-safe):
 * - flat:     bottom plane z=0, top z=depth*H
 * - recessed: top plane at z=baseMm, relief goes DOWN (carved) by depth*H (clamped at >=0)
 * - offset:   top z=depth*H + baseMm, bottom plane z=0 (stable, "vertical offset")
 *
 * NOTE: "CAD offset along normals" can be added later (v1.4). This version restores build and avoids holes.
 */
export function buildSolidFromHeightmap(input: BuildSolidFromHeightmapInput): BuildSolidFromHeightmapOutput {
  const {
    height01,
    width: w,
    height: h,
    outWidthMm,
    depthMm,
    baseMm,
    baseStyle,
    invert = false,
    clampHeights = true,
  } = input;

  if (w <= 1 || h <= 1) throw new Error("Heightmap too small.");
  if (height01.length !== w * h) throw new Error("height01 length mismatch.");
  if (!(outWidthMm > 0)) throw new Error("outWidthMm must be > 0.");
  if (!(depthMm >= 0)) throw new Error("depthMm must be >= 0.");
  if (!(baseMm >= 0)) throw new Error("baseMm must be >= 0.");

  // maintain aspect ratio
  const outHeightMm = outWidthMm * (h / w);

  // grid spacing in mm
  const dx = outWidthMm / (w - 1);
  const dy = outHeightMm / (h - 1);

  // --- vertex counts:
  // We build:
  // - top surface grid: w*h vertices
  // - bottom surface grid: w*h vertices
  // Total vertices = 2*w*h
  const vCount = 2 * w * h;
  const verts = new Float32Array(vCount * 3);

  // helper to set vertex
  const setV = (vi: number, x: number, y: number, z: number) => {
    const o = vi * 3;
    verts[o] = x;
    verts[o + 1] = y;
    verts[o + 2] = z;
  };

  // map grid to centered coordinates (nice for preview)
  const x0 = -outWidthMm / 2;
  const y0 = -outHeightMm / 2;

  // compute Z for a pixel
  const getH = (i: number) => {
    let v = height01[i];
    if (clampHeights) v = clamp01(v);
    if (invert) v = 1 - v;
    return v;
  };

  const topZ = (v01: number) => {
    if (baseStyle === "flat") {
      return depthMm * v01;
    }
    if (baseStyle === "recessed") {
      // base slab on top; carve down
      const z = baseMm - depthMm * v01;
      return z < 0 ? 0 : z;
    }
    // offset: raise everything by baseMm (so you always have thickness)
    return baseMm + depthMm * v01;
  };

  const bottomZ = (_v01: number) => {
    // slicer-safe: always a flat bottom
    return 0;
  };

  // Fill vertices
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idxOf(x, y, w);
      const v01 = getH(i);

      const px = x0 + x * dx;
      const py = y0 + y * dy;

      const topIndex = i;           // 0..w*h-1
      const bottomIndex = i + w*h;  // w*h..2*w*h-1

      setV(topIndex, px, py, topZ(v01));
      setV(bottomIndex, px, py, bottomZ(v01));
    }
  }

  // --- triangles
  // Estimate triangle count:
  // top:    2*(w-1)*(h-1)
  // bottom: 2*(w-1)*(h-1)
  // sides:  perimeter quads -> 2 tris each
  //  left/right: 2*(h-1) quads
  //  top/bot:    2*(w-1) quads
  // total side quads = 2*(h-1)+2*(w-1)
  // total side tris = 2 * sideQuads
  const topTris = 2 * (w - 1) * (h - 1);
  const bottomTris = topTris;
  const sideQuads = 2 * (h - 1) + 2 * (w - 1);
  const sideTris = 2 * sideQuads;

  const triCount = topTris + bottomTris + sideTris;
  const indices = new Uint32Array(triCount * 3);

  let ti = 0;
  const pushTri = (a: number, b: number, c: number) => {
    indices[ti++] = a;
    indices[ti++] = b;
    indices[ti++] = c;
  };

  // TOP surface (winding: CCW looking from outside => +Z)
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = idxOf(x, y, w);
      const b = idxOf(x + 1, y, w);
      const c = idxOf(x, y + 1, w);
      const d = idxOf(x + 1, y + 1, w);

      // a-b-d and a-d-c
      pushTri(a, b, d);
      pushTri(a, d, c);
    }
  }

  // BOTTOM surface (winding reversed to face outward => -Z)
  const bottomOffset = w * h;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = bottomOffset + idxOf(x, y, w);
      const b = bottomOffset + idxOf(x + 1, y, w);
      const c = bottomOffset + idxOf(x, y + 1, w);
      const d = bottomOffset + idxOf(x + 1, y + 1, w);

      // reverse
      pushTri(a, d, b);
      pushTri(a, c, d);
    }
  }

  // SIDES: connect perimeter (top to bottom), consistent winding outward

  // Left edge (x=0): for each segment y->y+1
  for (let y = 0; y < h - 1; y++) {
    const topA = idxOf(0, y, w);
    const topB = idxOf(0, y + 1, w);
    const botA = bottomOffset + idxOf(0, y, w);
    const botB = bottomOffset + idxOf(0, y + 1, w);

    // outward is -X
    pushTri(topA, topB, botB);
    pushTri(topA, botB, botA);
  }

  // Right edge (x=w-1)
  for (let y = 0; y < h - 1; y++) {
    const topA = idxOf(w - 1, y, w);
    const topB = idxOf(w - 1, y + 1, w);
    const botA = bottomOffset + idxOf(w - 1, y, w);
    const botB = bottomOffset + idxOf(w - 1, y + 1, w);

    // outward is +X
    pushTri(topB, topA, botA);
    pushTri(topB, botA, botB);
  }

  // Bottom edge (y=0)
  for (let x = 0; x < w - 1; x++) {
    const topA = idxOf(x, 0, w);
    const topB = idxOf(x + 1, 0, w);
    const botA = bottomOffset + idxOf(x, 0, w);
    const botB = bottomOffset + idxOf(x + 1, 0, w);

    // outward is -Y
    pushTri(topB, topA, botA);
    pushTri(topB, botA, botB);
  }

  // Top edge (y=h-1)
  for (let x = 0; x < w - 1; x++) {
    const topA = idxOf(x, h - 1, w);
    const topB = idxOf(x + 1, h - 1, w);
    const botA = bottomOffset + idxOf(x, h - 1, w);
    const botB = bottomOffset + idxOf(x + 1, h - 1, w);

    // outward is +Y
    pushTri(topA, topB, botB);
    pushTri(topA, botB, botA);
  }

  // Build THREE geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, vertices: verts, indices };
}
