// ===============================
// Heightmap helpers & types
// ===============================

type SourceMode = "image" | "depthmap";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type HeightmapBuildOutput =
  | { normF32: Float32Array; w: number; h: number }
  | { grayU8: Uint8Array; w?: number; h?: number; width?: number; height?: number };

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;

  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Impossibile caricare immagine"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  return img;
}

function imageDataToNormF32(imgData: ImageData, invert: boolean): HeightmapState {
  const { data, width: w, height: h } = imgData;
  const out = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    let v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (invert) v = 1 - v;

    out[p] = clamp01(v);
  }

  return { normF32: out, w, h };
}

/**
 * Fallback Canvas (8-bit) per JPG/WEBP/PNG.
 * Il vero 16-bit passa da decodeDepthmapPng (solo PNG).
 */
async function decodeDepthMapToHmStateCanvas(
  file: File,
  invert: boolean,
  maxSize = 512
): Promise<HeightmapState> {
  const img = await loadImageFromFile(file);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSize / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * scale));
  const h = Math.max(2, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D non disponibile");

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);

  return imageDataToNormF32(imgData, invert);
}

function invertHmInPlace(hm: HeightmapState): void {
  const a = hm.normF32;
  for (let i = 0; i < a.length; i++) {
    a[i] = 1 - clamp01(a[i] ?? 0);
  }
}
