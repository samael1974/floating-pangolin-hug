// src/components/relief/reliefStl.ts

export type HeightfieldToStlOptions = {
  widthMm: number;     // larghezza finale in mm (es. 100)
  depthMm: number;     // rilievo massimo in mm (da params.depthMm)
  baseMm: number;      // spessore base in mm (da params.baseMm)
  zMin?: number;       // default 0
  invert?: boolean;    // default false
  decimateStep?: number; // 1 = piena risoluzione; 2 dimezza; 3 terzo ecc.
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function vecSub(a: number[], b: number[]) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vecCross(a: number[], b: number[]) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function vecNormalize(v: number[]) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function facet(normal: number[], a: number[], b: number[], c: number[]) {
  return (
    `facet normal ${normal[0]} ${normal[1]} ${normal[2]}\n` +
    `  outer loop\n` +
    `    vertex ${a[0]} ${a[1]} ${a[2]}\n` +
    `    vertex ${b[0]} ${b[1]} ${b[2]}\n` +
    `    vertex ${c[0]} ${c[1]} ${c[2]}\n` +
    `  endloop\n` +
    `endfacet\n`
  );
}

function triToFacet(a: number[], b: number[], c: number[]) {
  const ab = vecSub(b, a);
  const ac = vecSub(c, a);
  const n = vecNormalize(vecCross(ab, ac));
  return facet(n, a, b, c);
}

/**
 * Convert a normalized heightmap (0..1) into an ASCII STL heightfield with a base.
 * normF32 length = w*h.
 */
export function heightmapToAsciiStl(
  normF32: Float32Array,
  w: number,
  h: number,
  opts: HeightfieldToStlOptions
): string {
  const widthMm = opts.widthMm;
  const step = Math.max(1, Math.floor(opts.decimateStep ?? 1));

  const zMin = opts.zMin ?? 0;
  const depthMm = opts.depthMm;
  const baseMm = opts.baseMm;
  const invert = !!opts.invert;

  // Keep aspect ratio: compute height in mm from image aspect
  const heightMm = widthMm * (h / w);

  // Grid spacing in mm (after decimation)
  const gw = Math.floor((w - 1) / step) + 1;
  const gh = Math.floor((h - 1) / step) + 1;

  const dx = widthMm / (gw - 1);
  const dy = heightMm / (gh - 1);

  // Height sampling helper
  function sample(ix: number, iy: number) {
    const x = clamp(ix * step, 0, w - 1);
    const y = clamp(iy * step, 0, h - 1);
    const v = normF32[y * w + x];
    const t = invert ? 1 - v : v;
    return zMin + baseMm + t * depthMm;
  }

  // Base bottom Z
  const zBase = zMin;

  let out = "solid relief\n";

  // --- TOP SURFACE (two triangles per cell) ---
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const x0 = x * dx;
      const y0 = y * dy;
      const x1 = (x + 1) * dx;
      const y1 = (y + 1) * dy;

      const z00 = sample(x, y);
      const z10 = sample(x + 1, y);
      const z01 = sample(x, y + 1);
      const z11 = sample(x + 1, y + 1);

      const p00 = [x0, y0, z00];
      const p10 = [x1, y0, z10];
      const p01 = [x0, y1, z01];
      const p11 = [x1, y1, z11];

      // winding so normals point outward/up
      out += triToFacet(p00, p10, p11);
      out += triToFacet(p00, p11, p01);
    }
  }

  // --- BOTTOM (single plane) ---
  // Note: we build it as two triangles with normals downward (outward from solid)
  const pA = [0, 0, zBase];
  const pB = [widthMm, 0, zBase];
  const pC = [widthMm, heightMm, zBase];
  const pD = [0, heightMm, zBase];

  out += triToFacet(pA, pC, pB);
  out += triToFacet(pA, pD, pC);

  // --- SIDES (walls) ---
  // Left (x=0)
  for (let y = 0; y < gh
