// src/lib/relief/depth/estimateDepth.ts
//
// Stima di profondita' monoculare IN-BROWSER (niente server, niente account)
// con Depth Anything V2 Small (licenza Apache-2.0) via transformers.js + WebGPU,
// con fallback automatico a WASM.
//
// Requisito: npm i @huggingface/transformers
//
// Output: heightmap normalizzata Float32Array [0..1] alle dimensioni dell'immagine
// di input, pronta per buildSolidFromHeightmap() o per la fusione ibrida.

import { pipeline, RawImage, env } from "@huggingface/transformers";

// I pesi vengono scaricati da Hugging Face e messi in cache dal browser.
const MODEL_ID = "onnx-community/depth-anything-v2-small";

export type DepthSource = string | HTMLCanvasElement | ImageData | HTMLImageElement;

export interface EstimateDepthOptions {
  /** Inverti la profondita' (Depth Anything da' "vicino = alto"; default false). */
  invert?: boolean;
  /** Callback di avanzamento del download/caricamento modello (0..1 se disponibile). */
  onProgress?: (info: { status: string; progress?: number; file?: string }) => void;
  /** Forza il device. Default: prova "webgpu", poi "wasm". */
  device?: "webgpu" | "wasm";
}

export interface DepthResult {
  normF32: Float32Array;
  w: number;
  h: number;
  device: "webgpu" | "wasm";
}

type DepthPipeline = Awaited<ReturnType<typeof pipeline>>;

let cached: { pipe: DepthPipeline; device: "webgpu" | "wasm" } | null = null;
let loading: Promise<{ pipe: DepthPipeline; device: "webgpu" | "wasm" }> | null = null;

function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function loadPipeline(
  opts: EstimateDepthOptions
): Promise<{ pipe: DepthPipeline; device: "webgpu" | "wasm" }> {
  if (cached) return cached;
  if (loading) return loading;

  const wantGpu = (opts.device ?? (webgpuAvailable() ? "webgpu" : "wasm")) === "webgpu";

  loading = (async () => {
    const progress = (p: any) =>
      opts.onProgress?.({ status: p.status, progress: p.progress, file: p.file });

    try {
      if (wantGpu && webgpuAvailable()) {
        const pipe = await pipeline("depth-estimation", MODEL_ID, {
          device: "webgpu",
          dtype: "fp16",
          progress_callback: progress,
        });
        cached = { pipe, device: "webgpu" };
        return cached;
      }
    } catch (e) {
      // se WebGPU fallisce (driver/browser) si ripiega su WASM
      console.warn("[estimateDepth] WebGPU non disponibile, fallback WASM:", e);
    }

    const pipe = await pipeline("depth-estimation", MODEL_ID, {
      device: "wasm",
      dtype: "q8",
      progress_callback: progress,
    });
    cached = { pipe, device: "wasm" };
    return cached;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

async function toRawImage(src: DepthSource): Promise<RawImage> {
  if (typeof src === "string") return await RawImage.fromURL(src);
  if (src instanceof ImageData) {
    return new RawImage(new Uint8ClampedArray(src.data), src.width, src.height, 4);
  }
  // HTMLCanvasElement | HTMLImageElement -> via canvas
  const canvas =
    src instanceof HTMLCanvasElement ? src : drawToCanvas(src as HTMLImageElement);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(new Uint8ClampedArray(id.data), canvas.width, canvas.height, 4);
}

function drawToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

/** (Opzionale) precarica il modello, utile per mostrare il progress prima dell'uso. */
export async function warmupDepthModel(opts: EstimateDepthOptions = {}): Promise<void> {
  await loadPipeline(opts);
}

export async function estimateDepth(
  src: DepthSource,
  opts: EstimateDepthOptions = {}
): Promise<DepthResult> {
  const { pipe, device } = await loadPipeline(opts);
  const image = await toRawImage(src);

  // La pipeline ritorna { depth: RawImage (grayscale, stessa dimensione input), predicted_depth: Tensor }
  const out: any = await (pipe as any)(image);
  const depthImg: RawImage = out.depth;
  const w = depthImg.width;
  const h = depthImg.height;
  const data = depthImg.data as Uint8Array | Uint8ClampedArray; // channels === 1

  const f = new Float32Array(w * h);
  if (opts.invert) {
    for (let i = 0; i < f.length; i++) f[i] = 1 - data[i] / 255;
  } else {
    for (let i = 0; i < f.length; i++) f[i] = data[i] / 255;
  }

  return { normF32: f, w, h, device };
}

export { env as transformersEnv };
