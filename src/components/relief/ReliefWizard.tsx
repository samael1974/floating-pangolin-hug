import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { decode as decodePng } from "fast-png";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type SourceMode = "image" | "depthmap";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function depthU16ToNormF32(u16: Uint16Array, invert: boolean) {
  const out = new Float32Array(u16.length);
  const denom = 65535;
  for (let i = 0; i < u16.length; i++) {
    let v = u16[i] / denom;
    if (invert) v = 1 - v;
    out[i] = clamp01(v);
  }
  return out;
}

function depthU8ToNormF32(u8: Uint8Array, invert: boolean) {
  const out = new Float32Array(u8.length);
  const denom = 255;
  for (let i = 0; i < u8.length; i++) {
    let v = u8[i] / denom;
    if (invert) v = 1 - v;
    out[i] = clamp01(v);
  }
  return out;
}

// fallback per JPG/WEBP/PNG (8bit via canvas): luminanza -> Float32
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

async function decodeDepthMapToHmState(file: File, invert: boolean, maxSize = 512): Promise<HeightmapState> {
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

  // ✅ PNG: tenta decode “vero” (supporta 16-bit)
  if (isPng) {
    const buf = await readAsArrayBuffer(file);
    const png = decodePng(new Uint8Array(buf));

    const w = png.width;
    const h = png.height;
    const channels = png.channels;
    const depth = (png as any).depth ?? (png as any).bitDepth ?? 8; // compat

    // Se è troppo grande, per ora facciamo fallback canvas (rescale rapido).
    // (Rescale 16bit “pro” si può fare dopo, ma non è indispensabile per MVP.)
    if (Math.max(w, h) > maxSize) {
      const img = await loadImageFromFile(file);
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSize / Math.max(iw, ih));
      const w2 = Math.max(2, Math.round(iw * scale));
      const h2 = Math.max(2, Math.round(ih * scale));

      const off = document.createElement("canvas");
      off.width = w2;
      off.height = h2;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D non disponibile");
      ctx.drawImage(img, 0, 0, w2, h2);
      const imgData = ctx.getImageData(0, 0, w2, h2);
      return imageDataToNormF32(imgData, invert);
    }

    // ✅ 16-bit: data spesso è Uint16Array (dipende dalla lib); gestiamo entrambi i casi
    // png.data può essere Uint8Array o Uint16Array
    const data: any = (png as any).data;

    if (depth === 16 && data instanceof Uint16Array) {
      // grayscale: channels==1 (ideale), ma se RGBA prendiamo R
      if (channels === 1) {
        return { normF32: depthU16ToNormF32(data, invert), w, h };
      }
      const gray = new Uint16Array(w * h);
      for (let i = 0, p = 0; p < gray.length; p++, i += channels) {
        gray[p] = data[i]; // prendo il canale R
      }
      return { normF32: depthU16ToNormF32(gray, invert), w, h };
    }

    // ✅ 8-bit PNG (o 16-bit ma la lib ti ha già “flattenato”): usa Uint8
    if (data instanceof Uint8Array) {
      if (channels === 1) {
        return { normF32: depthU8ToNormF32(data, invert), w, h };
      }
      const gray = new Uint8Array(w * h);
      for (let i = 0, p = 0; p < gray.length; p++, i += channels) {
        gray[p] = data[i];
      }
      return { normF32: depthU8ToNormF32(gray, invert), w, h };
    }

    // fallback finale
    // (non dovrebbe succedere)
  }

  // ✅ Non-PNG (JPG/WEBP): canvas fallback
  const img = await loadImageFromFile(file);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSize / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * scale));
  const h = Math.max(2, Math.round(ih * scale));

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D non disponibile");
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  return imageDataToNormF32(imgData, invert);
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
    let v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0..1
    if (invert) v = 1 - v;
    out[p] = v;
  }

  return { normF32: out, w, h };
}

export default function ReliefWizard() {
  // -----------------------------
  // STATE
  // -----------------------------
  const [file, setFile] = React.useState<File | null>(null);
  const [params, setParams] = React.useState<ReliefParams>(...);
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [sourceMode, setSourceMode] = React.useState<"image" | "depthmap">("image");
  const [invertDepthMap, setInvertDepthMap] = React.useState(false);

  // ✅ REF del canvas (QUESTO DEVE ESISTERE)
  const dmCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // -----------------------------
  // useEffect: genera heightmap
  // -----------------------------
  React.useEffect(() => {
    // tua pipeline (image o depthmap)
  }, [file, params, sourceMode, invertDepthMap]);

  // -----------------------------
  // ✅ useEffect: DISEGNA PREVIEW DEPTH MAP
  // -----------------------------
  React.useEffect(() => {
    if (sourceMode !== "depthmap") return;
    if (!hmState) return;

    const c = dmCanvasRef.current;
    if (!c) return;

    c.width = hmState.w;
    c.height = hmState.h;

    const ctx = c.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(hmState.w, hmState.h);
    const d = img.data;

    for (let i = 0; i < hmState.normF32.length; i++) {
      const v = Math.round(Math.max(0, Math.min(1, hmState.normF32[i])) * 255);
      const j = i * 4;
      d[j] = v;
      d[j + 1] = v;
      d[j + 2] = v;
      d[j + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
  }, [sourceMode, hmState]);

  // -----------------------------
  // JSX
  // -----------------------------
  return (
    <div className="space-y-6">
      {/* altri step */}

      {sourceMode === "depthmap" && (
        <div className="rounded-lg border p-4">
          <div className="text-sm font-semibold mb-2">
            Anteprima Depth Map (16-bit)
          </div>
          <canvas
            ref={dmCanvasRef}
            className="block max-h-[320px] w-auto border"
          />
        </div>
      )}
    </div>
  );
}

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 2) Params (NO invert)
  const [params, setParams] = React.useState<ReliefParams>(() => ({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief",
    baseStyle: "flat",
  }));

  // 3) Heightmap pipeline -> normF32/w/h
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [hmStatus, setHmStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!file) {
        setHmState(null);
        setHmStatus("idle");
        return;
      }

      setHmStatus("loading");

      const img = await loadImageFromFile(file);
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;

      const maxSize = 512;
      const scale = Math.min(1, maxSize / Math.max(iw, ih));
      const w = Math.max(2, Math.round(iw * scale));
      const h = Math.max(2, Math.round(ih * scale));

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;

      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D non disponibile");

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      let normF32: Float32Array;
      let outW = w;
      let outH = h;

      if (sourceMode === "depthmap") {
        const hm2 = imageDataToNormF32(imgData, invertDepthMap);
        normF32 = hm2.normF32;
        outW = hm2.w;
        outH = hm2.h;
      } else {
        const hm: any = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        outW = Number(hm?.w ?? hm?.width ?? w);
        outH = Number(hm?.h ?? hm?.height ?? h);

        if (hm?.normF32 instanceof Float32Array) {
          normF32 = hm.normF32;
        } else if (hm?.grayU8 instanceof Uint8Array) {
          const g = hm.grayU8 as Uint8Array;
          normF32 = new Float32Array(g.length);
          for (let i = 0; i < g.length; i++) normF32[i] = g[i] / 255;
        } else {
          throw new Error("Heightmap pipeline: output non valido (manca normF32/grayU8)");
        }
      }

      if (normF32.length !== outW * outH) {
        throw new Error(`Heightmap mismatch: normF32(${normF32.length}) != ${outW}*${outH}`);
      }

      if (!cancelled) {
        setHmState({ normF32, w: outW, h: outH });
        setHmStatus("ready");
      }
    }

    run().catch((e) => {
      console.error(e);
      if (!cancelled) {
        setHmState(null);
        setHmStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    file,
    sourceMode,
    invertDepthMap,
    params.projectType,
    params.depthMm,
    params.baseMm,
    params.detail,
    params.smooth,
    params.edge,
    params.outputMode,
    params.baseStyle,
  ]);

  // 4) STL options
  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(1);

  const canGenerate = !!file && hmStatus === "ready" && !!hmState;

  function downloadStl() {
    if (!hmState) {
      console.warn("downloadStl: hmState non disponibile");
      return;
    }

    downloadReliefStlBinary({
      hm: hmState,
      stlWidthMm,
      decimateStep,
      depthMm: params.depthMm,
      baseMm: params.baseMm,
      outputMode: params.outputMode,
      baseStyle: params.baseStyle,
    });
  }

  return (
    <div className="space-y-6">
      {/* Source Mode */}
      <div className="rounded-lg bg-white p-4 shadow flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">Sorgente</div>

        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            type="button"
            onClick={() => setSourceMode("image")}
            className={`px-3 py-1.5 text-sm ${
              sourceMode === "image" ? "bg-gray-900 text-white" : "bg-white text-gray-800"
            }`}
          >
            Immagine
          </button>
          <button
            type="button"
            onClick={() => setSourceMode("depthmap")}
            className={`px-3 py-1.5 text-sm ${
              sourceMode === "depthmap" ? "bg-gray-900 text-white" : "bg-white text-gray-800"
            }`}
          >
            Depth map
          </button>
        </div>

        {sourceMode === "depthmap" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={invertDepthMap}
              onChange={(e) => setInvertDepthMap(e.target.checked)}
            />
            Inverti depth map
          </label>
        )}
      </div>

      {/* Step 1: Upload */}
      <ReliefUpload file={file} previewUrl={previewUrl} onPickFile={setFile} />

      {/* Step 2: Controls (disabilitati se usi depthmap esterna) */}
      <ReliefControls
        value={params}
        onChange={setParams}
        disabled={!file || sourceMode === "depthmap"}
      />

      {/* Step 3: Preview 2D */}
      {sourceMode === "image" ? (
        <ReliefHeightmapPreview file={file} params={params} maxSize={512} />
      ) : (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-semibold mb-2">Anteprima Depth Map</div>
          <p className="text-xs text-gray-500 mb-3">
            Carica una depth map in scala di grigi (PNG/JPG/WebP). Se il rilievo è al contrario,
            abilita “Inverti depth map”.
          </p>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Depth map preview"
              className="max-h-[320px] w-auto rounded border"
            />
          ) : (
            <div className="text-sm text-gray-500">Carica una depth map.</div>
          )}
        </div>
      )}

      {/* Step 4: STL + Preview 3D */}
      <div className="rounded-lg bg-white p-6 shadow space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">4) Genera STL</h2>
            <p className="text-sm text-gray-600">
              STL binario chiuso (stampabile). In base a Modalità/Base generiamo positivo o stampo.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Stato heightmap:{" "}
              {hmStatus === "loading"
                ? "Elaborazione…"
                : hmStatus === "error"
                ? "Errore"
                : hmStatus === "ready"
                ? "Pronto"
                : "In attesa"}
            </p>
          </div>

          <button
            type="button"
            onClick={downloadStl}
            disabled={!canGenerate}
            className="px-4 py-2 rounded-md bg-[#E35B4F] text-white text-sm font-semibold disabled:opacity-50"
            title={!canGenerate ? "Carica immagine e attendi preview" : "Scarica STL"}
          >
            Scarica STL
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Larghezza STL (mm)</Label>
              <div className="text-sm tabular-nums text-gray-700">{stlWidthMm.toFixed(0)} mm</div>
            </div>
            <Slider
              value={[stlWidthMm]}
              min={30}
              max={300}
              step={1}
              onValueChange={(v) => setStlWidthMm(clamp(v[0] ?? 120, 30, 300))}
            />
            <p className="text-xs text-gray-500">
              Manteniamo le proporzioni dell’immagine (altezza calcolata automaticamente).
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Qualità (Decimazione)</Label>
              <div className="text-sm tabular-nums text-gray-700">x{decimateStep}</div>
            </div>
            <Slider
              value={[decimateStep]}
              min={1}
              max={6}
              step={1}
              onValueChange={(v) => setDecimateStep(clamp(v[0] ?? 1, 1, 6))}
            />
            <p className="text-xs text-gray-500">
              x1 = massimo dettaglio · x2–x3 = STL più leggero · x4+ = molto leggero
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold">Preview 3D</div>
            <div className="text-xs text-gray-500">(Orbit/zoom lo riabilitiamo dopo: ora preview stabile)</div>
          </div>

          <div className="p-4">
            {hmState ? (
              <ReliefPreview3D
                normF32={hmState.normF32}
                w={hmState.w}
                h={hmState.h}
                widthMm={stlWidthMm}
                depthMm={params.depthMm}
                baseMm={params.baseMm}
                previewDecimateStep={decimateStep}
              />
            ) : (
              <div className="h-[360px] w-full grid place-items-center text-sm text-gray-500">
                La preview 3D appare dopo la generazione della heightmap (normF32/w/h).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
