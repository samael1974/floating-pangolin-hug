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
  // OFFSET MODE (guscio vero: offset lungo la normale)
  // ==========================
  if (baseStyle === "offset") {
    const t = Math.max(baseMm, 0.8); // spessore guscio (min più “stabile”)

    // In offset vogliamo TOP da 0..depthMm (no base aggiunta)
    const zTopOffset = (H: number) => {
      const h01 = clamp01(H);
      if (outputMode === "mold") return depthMm * (1 - h01);
      return depthMm * h01;
    };

    // Grid top positions
    const topX = new Float32Array(w * h);
    const topY = new Float32Array(w * h);
    const topZ = new Float32Array(w * h);

    for (let iy = 0; iy < h; iy++) {
      const yy = y0 - iy * dy;
      for (let ix = 0; ix < w; ix++) {
        const xx = x0 + ix * dx;
        const zt = zTopOffset(normF32[idx(ix, iy)] ?? 0);

        const i = idx(ix, iy);
        topX[i] = xx;
        topY[i] = yy;
        topZ[i] = zt;
      }
    }

    // Helpers for finite-diff gradient on Z
    const clampI = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const zAt = (ix: number, iy: number) => {
      const cx = clampI(ix, 0, w - 1);
      const cy = clampI(iy, 0, h - 1);
      return topZ[idx(cx, cy)];
    };

    // Bottom positions = Top - t * normal
    const botX = new Float32Array(w * h);
    const botY = new Float32Array(w * h);
    const botZ = new Float32Array(w * h);

    let minBotZ = Number.POSITIVE_INFINITY;

    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        // central differences (fallback to clamped edges)
        const dzdx = (zAt(ix + 1, iy) - zAt(ix - 1, iy)) / (2 * dx);
        const dzdy = (zAt(ix, iy + 1) - zAt(ix, iy - 1)) / (2 * dy);

        // Surface normal approx: [-dz/dx, -dz/dy, 1]
        let nx = -dzdx;
        let ny = -dzdy;
        let nz = 1;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const i = idx(ix, iy);

        const tx = topX[i];
        const ty = topY[i];
        const tz = topZ[i];

        const bx = tx - t * nx;
        const by = ty - t * ny;
        const bz = tz - t * nz;

        botX[i] = bx;
        botY[i] = by;
        botZ[i] = bz;

        if (bz < minBotZ) minBotZ = bz;
      }
    }

    // Shift so the lowest bottom point is at Z=0
    const zShift = -minBotZ;
    for (let i = 0; i < topZ.length; i++) {
      topZ[i] += zShift;
      botZ[i] += zShift;
    }

    const Vt = (ix: number, iy: number) => {
      const i = idx(ix, iy);
      return [topX[i], topY[i], topZ[i]] as const;
    };
    const Vb = (ix: number, iy: number) => {
      const i = idx(ix, iy);
      return [botX[i], botY[i], botZ[i]] as const;
    };

    // --- TOP surface
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const A = Vt(ix, iy);
        const B = Vt(ix + 1, iy);
        const C = Vt(ix, iy + 1);
        const D = Vt(ix + 1, iy + 1);

        pushTri(A[0], A[1], A[2], B[0], B[1], B[2], D[0], D[1], D[2]);
        pushTri(A[0], A[1], A[2], D[0], D[1], D[2], C[0], C[1], C[2]);
      }
    }

    // --- BOTTOM surface (winding invertito)
    for (let iy = 0; iy < h - 1; iy++) {
      for (let ix = 0; ix < w - 1; ix++) {
        const A = Vb(ix, iy);
        const B = Vb(ix + 1, iy);
        const C = Vb(ix, iy + 1);
        const D = Vb(ix + 1, iy + 1);

        pushTri(A[0], A[1], A[2], D[0], D[1], D[2], B[0], B[1], B[2]);
        pushTri(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
      }
    }

    // --- SIDE WALLS (perimetro) usando un loop CCW in XY (vista dall’alto)
    const wallQuad = (
      t1: readonly [number, number, number],
      t2: readonly [number, number, number],
      b2: readonly [number, number, number],
      b1: readonly [number, number, number]
    ) => {
      // quad: t1 -> t2 -> b2 -> b1
      pushTri(t1[0], t1[1], t1[2], t2[0], t2[1], t2[2], b2[0], b2[1], b2[2]);
      pushTri(t1[0], t1[1], t1[2], b2[0], b2[1], b2[2], b1[0], b1[1], b1[2]);
    };

    // Top edge: (0,0) -> (w-1,0)
    for (let ix = 0; ix < w - 1; ix++) {
      wallQuad(Vt(ix, 0), Vt(ix + 1, 0), Vb(ix + 1, 0), Vb(ix, 0));
    }
    // Right edge: (w-1,0) -> (w-1,h-1)
    for (let iy = 0; iy < h - 1; iy++) {
      wallQuad(Vt(w - 1, iy), Vt(w - 1, iy + 1), Vb(w - 1, iy + 1), Vb(w - 1, iy));
    }
    // Bottom edge: (w-1,h-1) -> (0,h-1)
    for (let ix = w - 1; ix > 0; ix--) {
      wallQuad(Vt(ix, h - 1), Vt(ix - 1, h - 1), Vb(ix - 1, h - 1), Vb(ix, h - 1));
    }
    // Left edge: (0,h-1) -> (0,0)
    for (let iy = h - 1; iy > 0; iy--) {
      wallQuad(Vt(0, iy), Vt(0, iy - 1), Vb(0, iy - 1), Vb(0, iy));
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }
}
