import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

// ✅ fast-png (16-bit)

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};
export default function ReliefWizard() {
  // ...tutti gli useState/useEffect/funzioni...
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
            <div className="text-xs text-gray-500">
              JPG/JPEG/PNG/WEBP. Per Depth map: PNG consigliato.
            </div>
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
          <div className="text-xs text-gray-500">
            I parametri restano attivi anche in modalità Depth map.
          </div>
        </div>

        <div className="pt-2">
          <ReliefControls value={params} onChange={setParams} disabled={!file} />
        </div>
      </div>

      {/* STL Options */}
      <div className="rounded-lg bg-white p-4 shadow space-y-4">
        <div>
          <div className="text-sm font-semibold">3) Genera STL</div>
          <div className="text-xs text-gray-500">
            STL binario chiuso (stampabile).
          </div>
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
          <div className="text-xs text-gray-500">
            Suggerimento: x2–x3 spesso riduce rumore e alleggerisce lo STL.
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={downloadStl}
            disabled={!canGenerate}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              canGenerate
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
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
            <div className="text-xs text-gray-500">
              Il 3D resta visibile mentre modifichi i parametri.
            </div>
          </div>

          <div className="text-xs">
            {hmStatus === "ready" ? (
              <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">
                Heightmap pronta
              </span>
            ) : hmStatus === "loading" ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                Calcolo…
              </span>
            ) : hmStatus === "error" ? (
              <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">
                Errore
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">
                In attesa
              </span>
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
            <ReliefPreview3D
              hmState={hmState}
              stlWidthMm={stlWidthMm}
              decimateStep={decimateStep}
              depthMm={params.depthMm}
              baseMm={params.baseMm}
              outputMode={params.outputMode}
              baseStyle={params.baseStyle}
            />
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
                  <img
                    src={previewUrl}
                    alt="Anteprima"
                    className="w-full rounded-md border object-contain max-h-[240px]"
                  />
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
      </div>
    </div>
  </div>
</div>
  );
}