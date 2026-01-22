// src/components/relief/reliefHeightmap.ts
import type { ReliefParams } from "@/components/relief/ReliefControls";

export type HeightmapResult = {
  width: number;
  height: number;
  grayU8: Uint8ClampedArray; // 0..255 (len = w*h)
  normF32: Float32Array; // 0..1 (len = w*h)
  min: number; // min gray before normalization (0..255)
  max: number; // max gray before normalization (0..255)
};

export type HeightmapOptions = {
  /** If true, invert grayscale (useful when you want dark areas raised). */
  invert?: boolean;
  /** Gamma correction for grayscale before normalization. 1 = none. Typical: 0.8..1.4 */
  gamma?: number;
  /**
   * Normalize to use full 0..255 range based on min/max of image.
   * Usually helps contrast for relief.
   */
  normalize?: boolean;
  /**
   * If provided, clamps low/high percentiles to reduce outliers (0..0.49).
   * Example: 0.02 clips 2% low and 2% high.
   */
  percentileClip?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function clampByte(n: number) {
  return clamp(n, 0, 255) | 0;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Convert RGBA ImageData -> grayscale (0..255) using luminance.
 */
export function rgbaToGrayU8(imageData: ImageData): Uint8ClampedArray {
  const { data } = imageData;
  const out = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    out[j] = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
  }
  return out;
}

/**
 * Simple box blur on grayscale buffer.
 * radius: 0..3 recommended for preview; for STL you might go a bit higher but watch cost.
 */
export function boxBlurGrayU8(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  if (radius <= 0) return src;
  const r = Math.floor(radius);
  const dst = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let yy = y - r; yy <= y + r; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = x - r; xx <= x + r; xx++) {
          if (xx < 0 || xx >= w) continue;
          sum += src[yy * w + xx];
          cnt++;
        }
      }
      dst[y * w + x] = (sum / cnt) | 0;
    }
  }
  return dst;
}

/**
 * Detail enhancement (local contrast): adds back (src - blurred) scaled by strength.
 * detail: 0..1 recommended.
 */
export function enhanceDetailU8(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  detail: number
): Uint8ClampedArray {
  if (detail <= 0) return src;
  const blurred = boxBlurGrayU8(src, w, h, 1);
  const dst = new Uint8ClampedArray(src.length);

  const k = lerp(0.0, 1.5, clamp(detail, 0, 1)); // strength
  for (let i = 0; i < src.length; i++) {
    const hi = src[i] - blurred[i];
    dst[i] = clampByte(src[i] + hi * k);
  }
  return dst;
}

/**
 * Edge mode: if sharp, apply an S-curve to increase contrast (good for logos).
 */
export function applyEdgeModeU8(
  src: Uint8ClampedArray,
  edge: "round" | "sharp"
): Uint8ClampedArray {
  if (edge !== "sharp") return src;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i++) {
    const v = src[i] / 255;
    // S-curve
    const c = v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
    dst[i] = clampByte(Math.round(c * 255));
  }
  return dst;
}

/**
 * Optional gamma correction on grayscale.
 */
export function applyGammaU8(src: Uint8ClampedArray, gamma = 1): Uint8ClampedArray {
  const g = gamma ?? 1;
  if (!isFinite(g) || g <= 0 || Math.abs(g - 1) < 1e-6) return src;

  const dst = new Uint8ClampedArray(src.length);
  const inv = 1 / g;
  for (let i = 0; i < src.length; i++) {
    const v = src[i] / 255;
    const vg = Math.pow(v, inv);
    dst[i] = clampByte(Math.round(vg * 255));
  }
  return dst;
}

/**
 * Compute min/max of U8 grayscale buffer.
 * Returns lo/hi to stay consistent with percentileClipU8.
 */
export function minMaxU8(src: Uint8ClampedArray): { lo: number; hi: number } {
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

/**
 * Percentile clip helper (simple: sort copy; ok for preview sizes).
 * For STL large sizes, consider histogram.
 */
export function percentileClipU8(
  src: Uint8ClampedArray,
  p: number
): { lo: number; hi: number } {
  const pp = clamp(p, 0, 0.49);
  if (pp <= 0) return minMaxU8(src);

  const arr = Array.from(src);
  arr.sort((a, b) => a - b);
  const n = arr.length;
  const lo = arr[Math.floor(n * pp)];
  const hi = arr[Math.floor(n * (1 - pp)) - 1];
  return { lo, hi };
}

/**
 * Normalize grayscale to full 0..255 range using min/max (or percentile clipped).
 */
export function normalizeU8(
  src: Uint8ClampedArray,
  lo: number,
  hi: number
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  const denom = Math.max(1, hi - lo);
  for (let i = 0; i < src.length; i++) {
    const v = clamp(src[i], lo, hi);
    const nv = ((v - lo) / denom) * 255;
    dst[i] = clampByte(Math.round(nv));
  }
  return dst;
}

/**
 * Invert grayscale (0..255 -> 255..0)
 */
export function invertU8(src: Uint8ClampedArray): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = 255 - src[i];
  return dst;
}

/**
 * Convert grayscale U8 -> normalized Float32 0..1
 */
export function toNormF32(src: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] / 255;
  return out;
}

/**
 * Main pipeline: ImageData -> HeightmapResult
 * Applies params.smooth, params.detail, params.edge + optional options.
 */
export function buildHeightmapFromImageData(
  imageData: ImageData,
  params: Pick<ReliefParams, "smooth" | "detail" | "edge">,
  options: HeightmapOptions = {}
): HeightmapResult {
  const w = imageData.width;
  const h = imageData.height;

  // 1) grayscale
  let gray = rgbaToGrayU8(imageData);

  // 2) smoothing: 0..1 -> radius 0..3
  const blurRadius = Math.round(lerp(0, 3, clamp(params.smooth, 0, 1)));
  if (blurRadius > 0) gray = boxBlurGrayU8(gray, w, h, blurRadius);

  // 3) detail enhancement
  gray = enhanceDetailU8(gray, w, h, clamp(params.detail, 0, 1));

  // 4) edge mode
  gray = applyEdgeModeU8(gray, params.edge);

  // 5) optional gamma
  if (options.gamma && Math.abs(options.gamma - 1) > 1e-6) {
    gray = applyGammaU8(gray, options.gamma);
  }

  // 6) optional invert
  if (options.invert) {
    gray = invertU8(gray);
  }

  // 7) optional normalize
  let min = 0, max = 255;
  if (options.normalize) {
    const p = options.percentileClip ?? 0;
    const { lo, hi } = p > 0 ? percentileClipU8(gray, p) : minMaxU8(gray);
    gray = normalizeU8(gray, lo, hi);
    min = lo;
    max = hi;
  } else {
    const { lo, hi } = minMaxU8(gray);
    min = mm.min;
    max = mm.max;
  }

  // 8) normalized float 0..1
  const normF32 = toNormF32(gray);

  return { width: w, height: h, grayU8: gray, normF32, min, max };
}

/**
 * Utility: draw grayU8 heightmap to a canvas.
 */
export function drawHeightmapToCanvas(
  canvas: HTMLCanvasElement,
  grayU8: Uint8ClampedArray,
  w: number,
  h: number
) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  canvas.width = w;
  canvas.height = h;

  const out = ctx.createImageData(w, h);
  for (let i = 0, j = 0; j < grayU8.length; j++, i += 4) {
    const v = grayU8[j];
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}
