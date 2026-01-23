import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, {
  type ReliefParams,
  type OutputMode,
  type BaseStyle,
} from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import { geometryToBinaryStl } from "@/lib/stl/binaryStl";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function downloadArrayBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downsample heightmap by step (nearest-neighbor).
 * step=1 => no change
 */
function decimateHeightmap(
  normF32: Float32Array,
  w: number,
  h: number,
  step: number
): HeightmapState {
  const s = Math.max(1, Math.floor(step));
  if (s === 1) return { normF32, w, h };

  const w2 = Math.max(2, Math.floor((w - 1) / s) + 1);
  const h2 = Math.max(2, Math.floor((h - 1) / s) + 1);

  const out = new Float32Array(w2 * h2);

  for (let y2 = 0; y2 < h2; y2++) {
    const y = Math.min(h - 1, y2 * s);
    for (let x2 = 0; x2 < w2; x2++) {
      const x = Math.min(w - 1, x2 * s);
      out[y2 * w2 + x2] = normF32[y * w + x];
    }
  }

  return { normF32: out, w: w2, h: h2 };
}

export default function ReliefWizard() {
  // -----------------------------
  // 1) Upload
  // -----------------------------
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // -----------------------------
  // 2) Params (✅ NO invert)
  // -----------------------------
  const [params, setParams] = React.useState<ReliefParams>(() => ({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief" as OutputMode,
    baseStyle: "flat" as BaseStyle,
  }));

  // -----------------------------
  // 3) Heightmap pipeline -> normF32/w/h
  // -----------------------------
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [hmStatus, setHmStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

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
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D non disponibile");

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      const hm: any = buildHeightmapFromImageData(imgData, params, {
        normalize: true,
        percentileClip: 0.02,
      });

      let normF32: Float32Array;
      if (hm?.normF32 instanceof Float32Array) {
        normF32 = hm.normF32;
      } else if (hm?.grayU8 instanceof Uint8Array) {
        const g = hm.grayU8 as Uint8Array;
        normF32 = new Float32Array(g.length);
        for (let i = 0; i < g.length; i++) normF32[i] = g[i] / 255;
      } else {
        throw new Error(
          "Heightmap pipeline: output non valido (manca normF32/grayU8)"
        );
      }

      const hw = Number(hm?.width ?? w);
      const hh = Number(hm?.height ?? h);

      if (!cancelled) {
        setHmState({ normF32, w: hw, h: hh });
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
    params.projectType,
    params.depthMm,
    params.baseMm,
    params.detail,
    params.smooth,
    params.edge,
    params.outputMode,
    params.baseStyle,
  ]);

  // -----------------------------
  // 4) STL options (mm)
  // -----------------------------
  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(1);

  const canGenerate = !!file && hmStatus === "ready" && !!hmState;

  function downloadStl() {
    if (!hmState) return;

    // Apply decimation to reduce triangle count
    const dm = decimateHeightmap(hmState.normF32, hmState.w, hmState.h, decimateStep);

    // Build CLOSED solid geometry in mm
    const geometry = buildSolidFromHeightmap({
      normF32: dm.normF32,
      w: dm.w,
      h: dm.h,
      widthMm: stlWidthMm,
      depthMm: params.depthMm,
      baseMm: params.baseMm,
      outputMode: params.outputMode,
      baseStyle: params.baseStyle,
    });

    // Binary STL
    const stl = geometryToBinaryStl(geometry);

    const tag = `${params.outputMode}_${params.baseStyle}`; // es: relief_flat / mold_recessed
    const filename = `reliefforge_${tag}_${stlWidthMm.toFixed(0)}mm.stl`;
    downloadArrayBuffer(stl, filename);
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      <ReliefUpload file={file} previewUrl={previewUrl} onPickFile={setFile} />

      {/* Step 2: Controls */}
      <ReliefControls value={params} onChange={setParams} disabled={!file} />

      {/* Step 3: Heightmap preview (2D) */}
      <ReliefHeightmapPreview file={file} params={params} maxSize={512} />

      {/* Step 4: STL + Preview 3D */}
      <div className="rounded-lg bg-white p-6 shadow space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">4) Genera STL</h2>
            <p className="text-sm text-gray-600">
              STL chiuso e stampabile. In base a Modalità/Base generiamo positivo o stampo.
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
          {/* STL width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Larghezza STL (mm)</Label>
              <div className="text-sm tabular-nums text-gray-700">
                {stlWidthMm.toFixed(0)} mm
              </div>
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

          {/* Decimation */}
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

        {/* Preview 3D */}
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold">Preview 3D</div>
            <div className="text-xs text-gray-500">
              Ruota con drag • Zoom con rotellina/pinch
            </div>
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

        {/* Debug params */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer select-none">Debug params</summary>
          <pre className="mt-2 rounded bg-gray-50 p-3 overflow-auto">
{JSON.stringify(
  {
    ...params,
    stlWidthMm,
    decimateStep,
  },
  null,
  2
)}
          </pre>
        </details>
      </div>
    </div>
  );
}
