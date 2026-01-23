import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, {
  type ReliefParams,
} from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

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

export default function ReliefWizard() {
  // 1) Upload
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

  // 2) Params (✅ NO invert)
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
      const w = Math.max(2, Math.round(iw * scale));
      const h = Math.max(2, Math.round(ih * scale));

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
      const outW = Number(hm?.w ?? hm?.width ?? w);
      const outH = Number(hm?.h ?? hm?.height ?? h);

      if (hm?.normF32 instanceof Float32Array) {
        normF32 = hm.normF32;
      } else if (hm?.grayU8 instanceof Uint8Array) {
        const g = hm.grayU8 as Uint8Array;
        normF32 = new Float32Array(g.length);
        for (let i = 0; i < g.length; i++) normF32[i] = g[i] / 255;
      } else {
        throw new Error("Heightmap pipeline: output non valido (manca normF32/grayU8)");
      }

      if (normF32.length !== outW * outH) {
        throw new Error(
          `Heightmap mismatch: normF32(${normF32.length}) != ${outW}*${outH}`
        );
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
            <div className="text-xs text-gray-500">
              (Orbit/zoom lo riabilitiamo dopo: ora preview stabile)
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
      </div>
    </div>
  );
}
