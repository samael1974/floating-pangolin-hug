// src/lib/relief/buildSolidFromHeightmap.ts
import * as THREE from "three";

type OutputMode = "relief" | "mold";
type BaseStyle = "flat" | "recessed";

type BuildSolidArgs = {
  normF32: Float32Array; // length = w*h, values 0..1
  w: number;
  h: number;
  widthMm: number;       // final model width in mm
  depthMm: number;       // relief depth in mm
  baseMm: number;        // base thickness in mm (>=0)
  outputMode: OutputMode;
  baseStyle: BaseStyle;
};

/**
 * Creates a CLOSED manifold solid:
 * - top: heightfield
 * - bottom: z=0 plane
 * - sides: 4 walls
 *
 * Logic:
 * - relief+flat: top z = baseMm + depthMm*H
 * - mold+recessed: top z = baseMm - depthMm*H  (cavity carved from top downwards)
 *
 * Note: for mold, baseStyle should typically be recessed; we still support combos.
 */
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

  // Centered in XY
  const x0 = -widthMm / 2;
  const y0 = -heightMm / 2;

  // Height function (mm)
  const topZ = (H: number) => {
    // “flat” just means no special behavior; “recessed” matters mainly for mold use-case.
    // We encode the product decision via outputMode.
    if (outputMode === "relief") {
      // positive relief above base
      return baseMm + depthMm * H;
    }
    // mold: cavity carved into base (recess)
    // If baseStyle is flat, you still get "negative" (it goes down) but visually it's still a cavity.
    const z = baseMm - depthMm * H;
    return Math.max(0, z); // keep non-negative to avoid going below bottom plane
  };

  // Collect triangles as raw positions (non-indexed)
  const verts: number[] = [];

  const pushTri = (ax:number,ay:number,az:number, bx:number,by:number,bz:number, cx:number,cy:number,cz:number) => {
    verts.push(ax,ay,az, bx,by,bz, cx,cy,cz);
  };

  const idx = (ix: number, iy: number) => iy * w + ix;

  // --- TOP SURFACE (two tris per cell)
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

      // Winding: CCW when looking from outside (+Z)
      pushTri(xA, yA, zA, xB, yB, zB, xD, yD, zD);
      pushTri(xA, yA, zA, xD, yD, zD, xC, yC, zC);
    }
  }

  // --- BOTTOM PLANE (z=0), two tris covering rectangle
  // Winding: CCW when looking from outside (-Z) -> we want normals downward
  // So we reverse winding compared to top.
  const xL = x0;
  const xR = x0 + widthMm;
  const yT = y0;
  const yB = y0 + heightMm;

  pushTri(xL, yT, 0, xR, yB, 0, xR, yT, 0);
  pushTri(xL, yT, 0, xL, yB, 0, xR, yB, 0);

  // --- SIDE WALLS
  // We stitch the boundary of the top to the bottom edges.

  // Top boundary samples:
  // Left edge (ix=0), Right edge (ix=w-1), Top edge (iy=0), Bottom edge (iy=h-1)

  // Left wall (x = xL)
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 + iy * dy;
    const y2 = y0 + (iy + 1) * dy;
    const z1 = topZ(normF32[idx(0, iy)]);
    const z2 = topZ(normF32[idx(0, iy + 1)]);
    // Outside normal points -X, so winding should be CCW when looking from -X
    pushTri(xL, y1, 0, xL, y2, z2, xL, y1, z1);
    pushTri(xL, y1, 0, xL, y2, 0, xL, y2, z2);
  }

  // Right wall (x = xR)
  for (let iy = 0; iy < h - 1; iy++) {
    const y1 = y0 + iy * dy;
    const y2 = y0 + (iy + 1) * dy;
    const z1 = topZ(normF32[idx(w - 1, iy)]);
    const z2 = topZ(normF32[idx(w - 1, iy + 1)]);
    // Outside normal +X
    pushTri(xR, y1, 0, xR, y1, z1, xR, y2, z2);
    pushTri(xR, y1, 0, xR, y2, z2, xR, y2, 0);
  }

  // Top wall (y = yT)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = topZ(normF32[idx(ix, 0)]);
    const z2 = topZ(normF32[idx(ix + 1, 0)]);
    // Outside normal -Y
    pushTri(x1, yT, 0, x1, yT, z1, x2, yT, z2);
    pushTri(x1, yT, 0, x2, yT, z2, x2, yT, 0);
  }

  // Bottom wall (y = yB)
  for (let ix = 0; ix < w - 1; ix++) {
    const x1 = x0 + ix * dx;
    const x2 = x0 + (ix + 1) * dx;
    const z1 = topZ(normF32[idx(ix, h - 1)]);
    const z2 = topZ(normF32[idx(ix + 1, h - 1)]);
    // Outside normal +Y
    pushTri(x1, yB, 0, x2, yB, z2, x1, yB, z1);
    pushTri(x1, yB, 0, x2, yB, 0, x2, yB, z2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  return geometry;
}
