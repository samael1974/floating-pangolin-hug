import * as React from "react";

import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

type SourceMode = "image" | "depthmap";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
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
 * Decodifica depthmap via Canvas:
 * - Funziona per JPG/PNG/WEBP 8-bit (e per PNG 16-bit solo se il browser lo “schiaccia” a 8-bit in canvas)
 * - Il “vero 16-bit” lo facciamo dopo con parser PNG
 */
async function decodeDepthMapToHmState(file: File, invert: boolean, maxSize = 512): Promise<HeightmapState> {
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

export default function ReliefWizard() {
  // ✅ Preview tab (colonna destra)
  const [previewTab, setPreviewTab] = React.useState<"image" | "depth" | "stl">("stl");

  // ✅ Sorgente
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("image");
  const [invertDepthMap, setInvertDepthMap] = React.useState(false);

  // ✅ Upload
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // ✅ Canvas preview depthmap
  const dmCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // ✅ Params (sempre modificabili, anche in depthmap)
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

  // ✅ Heightmap state/status
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [hmStatus, setHmStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");

  // ✅ STL options
  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(2);

  const canGenerate = !!file && hmStatus === "ready" && !!hmState;

  // ✅ preview url
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ✅ UX: quando carichi un file vai su "Immagine"
  React.useEffect(() => {
    if (file) setPreviewTab("image");
  }, [file]);

  // ✅ UX: quando hm pronta vai su "STL"
  React.useEffect(() => {
    if (hmStatus === "ready") setPreviewTab("stl");
  }, [hmStatus]);

  // ✅ pipeline heightmap
  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!file) {
        setHmState(null);
        setHmStatus("idle");
        return;
      }

      setHmStatus("loading");
      const maxSize = 512;

      try {
        if (sourceMode === "depthmap") {
          const hm = await decodeDepthMapToHmState(file, invertDepthMap, maxSize);
          if (!cancelled) {
            setHmState(hm);
            setHmStatus("ready");
          }
          return;
        }

        // IMAGE -> tua pipeline
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

        const hmAny: any = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        const outW = Number(hmAny?.w ?? hmAny?.width ?? w);
        const outH = Number(hmAny?.h ?? hmAny?.height ?? h);

        let normF32: Float32Array;
        if (hmAny?.normF32 instanceof Float32Array) {
          normF32 = hmAny.normF32;
        } else if (hmAny?.grayU8 instanceof Uint8Array) {
          const g = hmAny.grayU8 as Uint8Array;
          normF32 = new Float32Array(g.length);
          for (let i = 0; i < g.length; i++) normF32[i] = g[i] / 255;
        } else {
          throw new Error("Heightmap pipeline: output non valido (manca normF32/grayU8)");
        }

        if (normF32.length !== outW * outH) {
          throw new Error(`Heightmap mismatch: normF32(${normF32.length}) != ${outW}*${outH}`);
        }

        if (!cancelled) {
          setHmState({ normF32, w: outW, h: outH });
          setHmStatus("ready");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setHmState(null);
          setHmStatus("error");
        }
      }
    }

    run();
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

  // ✅ canvas draw (depthmap tab)
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
      const v = Math.round(clamp01(hmState.normF32[i]) * 255);
      const j = i * 4;
      d[j] = v;
      d[j + 1] = v;
      d[j + 2] = v;
      d[j + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
  }, [sourceMode, hmState]);

  function downloadStl() {
    if (!hmState) return;

    downloadReliefStlBinary({
      hm: hmState,
      stlWidthMm,
      decimateStep,
      depthMm: params.depthMm,
      baseMm: params.baseMm,
      outputMode: params.outputMode as any,
      baseStyle: params.baseStyle as any,
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      <div className="grid gap-6 md:grid-cols-[420px_1fr] lg:grid-cols-[460px_1fr]">
        {/* LEFT */}
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
                Depth map (8/16-bit)
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

          {/* Upload */}
          <div className="rounded-lg bg-white p-4 shadow space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">1) Carica un file</div>
                <div className="text-xs text-gray-500">JPG/JPEG/PNG/WEBP. Per Depth map: PNG consigliato.</div>
              </div>

              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Rimuovi
                </button>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />

            {file && (
              <div className="text-xs text-gray-600">
                <div className="font-medium">File:</div>
                <div className="break-all">{file.name}</div>
                <div className="mt-1">
                  Stato heightmap:{" "}
                  <span
                    className={`font-medium ${
                      hmStatus === "ready"
                        ? "text-green-700"
                        : hmStatus === "loading"
                        ? "text-amber-700"
                        : hmStatus === "error"
                        ? "text-red-700"
                        : "text-gray-600"
                    }`}
                  >
                    {hmStatus}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Params */}
          <div className="rounded-lg bg-white p-4 shadow space-y-3">
            <div>
              <div className="text-sm font-semibold">2) Parametri bassorilievo</div>
              <div className="text-xs text-gray-500">I parametri restano attivi anche in modalità Depth map.</div>
            </div>

            <div className="pt-2">
              <ReliefControls value={params} onChange={setParams} disabled={!file} />
            </div>
          </div>

          {/* STL Options */}
          <div className="rounded-lg bg-white p-4 shadow space-y-4">
            <div>
              <div className="text-sm font-semibold">3) Genera STL</div>
              <div className="text-xs text-gray-500">STL binario chiuso (stampabile).</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Larghezza STL (mm)</span>
                <span className="tabular-nums text-gray-700">{Math.round(stlWidthMm)} mm</span>
              </div>
              <input
                type="range"
                min={30}
                max={300}
                step={1}
                value={stlWidthMm}
                onChange={(e) => setStlWidthMm(Number(e.target.value))}
                className="w-full"
                disabled={!file}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Qualità (Decimazione)</span>
                <span className="tabular-nums text-gray-700">x{decimateStep}</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={decimateStep}
                onChange={(e) => setDecimateStep(Number(e.target.value))}
                className="w-full"
                disabled={!file}
              />
              <div className="text-xs text-gray-500">Suggerimento: x2–x3 spesso riduce rumore e alleggerisce lo STL.</div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={downloadStl}
                disabled={!canGenerate}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  canGenerate ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                Scarica STL
              </button>

              <a
                href="https://www.paypal.me/federicocordioli72"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border px-4 py-2 text-center text-sm hover:bg-gray-50"
              >
                Dona su PayPal
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT (sticky): preview sempre visibile su desktop */}
        <div className="md:sticky md:top-4 self-start">
          <div className="rounded-lg bg-white p-4 shadow space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Anteprime</div>
                <div className="text-xs text-gray-500">Il 3D resta visibile mentre modifichi i parametri.</div>
              </div>

              <div className="text-xs">
                {hmStatus === "ready" ? (
                  <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">Heightmap pronta</span>
                ) : hmStatus === "loading" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">Calcolo…</span>
                ) : hmStatus === "error" ? (
                  <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">Errore</span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">In attesa</span>
                )}
              </div>
            </div>

            {/* 3D sempre in alto */}
            <div className="rounded-md border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                <div className="text-sm font-medium">Preview 3D</div>
                <div className="text-xs text-gray-500">Drag • Zoom</div>
              </div>

              <div className="h-[420px] lg:h-[520px]">
                {/* NOTE: adattiamo i props appena mi incolli la signature di ReliefPreview3D */}
                <ReliefPreview3D {...({
                  hmState,
                  stlWidthMm,
                  decimateStep,
                  depthMm: params.depthMm,
                  baseMm: params.baseMm,
                  outputMode: params.outputMode,
                  baseStyle: params.baseStyle,
                } as any)} />
              </div>
            </div>

            {/* Tabs secondari */}
            <div className="rounded-md border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
                <button
                  type="button"
                  onClick={() => setPreviewTab("image")}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    previewTab === "image" ? "bg-gray-900 text-white" : "bg-white text-gray-700 border"
                  }`}
                >
                  Immagine
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("depth")}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    previewTab === "depth" ? "bg-gray-900 text-white" : "bg-white text-gray-700 border"
                  }`}
                >
                  Depth map
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("stl")}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    previewTab === "stl" ? "bg-gray-900 text-white" : "bg-white text-gray-700 border"
                  }`}
                >
                  Info
                </button>
              </div>

              <div className="p-3">
                {previewTab === "image" && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Anteprima immagine</div>
                    {previewUrl ? (
                      <img src={previewUrl} alt="Anteprima" className="w-full rounded-md border object-contain max-h-[240px]" />
                    ) : (
                      <div className="text-xs text-gray-500">Carica un file per vedere l’anteprima.</div>
                    )}
                  </div>
                )}

                {previewTab === "depth" && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Anteprima depth map</div>

                    {sourceMode === "depthmap" ? (
                      <canvas ref={dmCanvasRef} className="w-full rounded-md border max-h-[240px]" />
                    ) : (
                      <div className="text-xs text-gray-500">
                        In modalità Immagine, la depthmap è interna alla pipeline (vedi 3D).
                      </div>
                    )}
                  </div>
                )}

                {previewTab === "stl" && (
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="font-medium text-gray-700">Stato</div>
                    <div>
                      Sorgente: <span className="font-medium">{sourceMode}</span>
                    </div>
                    <div>
                      Risoluzione hm:{" "}
                      <span className="font-medium">{hmState ? `${hmState.w} × ${hmState.h}` : "—"}</span>
                    </div>
                    <div>
                      Output:{" "}
                      <span className="font-medium">
                        {params.outputMode} / {params.baseStyle}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-gray-500">
              Nota: il “vero 16-bit PNG” lo implementiamo dopo (parser PNG), qui la preview depthmap passa da canvas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
