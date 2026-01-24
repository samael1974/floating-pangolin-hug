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

return (
  <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
    {/* Desktop layout: controlli a sinistra, preview sticky a destra */}
    <div className="grid gap-6 md:grid-cols-[420px_1fr] lg:grid-cols-[460px_1fr]">
      {/* LEFT: Controls */}
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
                Consigliati: JPG/JPEG/PNG/WEBP. Per Depth map: PNG consigliato.
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

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
              }}
              className="block w-full text-sm"
            />
          </div>

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
            {/* IMPORTANT: non disabilitare in depthmap */}
            <ReliefControls value={params} onChange={setParams} disabled={!file} />
          </div>
        </div>

        {/* STL Options */}
        <div className="rounded-lg bg-white p-4 shadow space-y-4">
          <div>
            <div className="text-sm font-semibold">3) Genera STL</div>
            <div className="text-xs text-gray-500">
              STL binario chiuso (stampabile). Base/Modalità influenzano il risultato.
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
              Suggerimento: x2–x3 spesso migliora rumore e rende più leggero lo STL.
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

      {/* RIGHT: Preview (sticky on desktop) */}
      <div className="md:sticky md:top-4 self-start">
        <div className="rounded-lg bg-white p-4 shadow space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Anteprime</div>
              <div className="text-xs text-gray-500">
                Il 3D resta sempre visibile mentre modifichi i parametri (desktop).
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

          {/* 3D ALWAYS ON TOP */}
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <div className="text-sm font-medium">Preview 3D</div>
              <div className="text-xs text-gray-500">Drag per ruotare • Zoom rotellina/pinch</div>
            </div>

            <div className="h-[420px] lg:h-[520px]">
              {/* Se hai un componente 3D dedicato, usalo qui.
                  Assumo che ReliefPreview3D accetti hmState e parametri STL (se diverso, dimmelo e lo adatto). */}
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

          {/* Secondary previews: tabs */}
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
                  ) : hmState ? (
                    <div className="text-xs text-gray-500">
                      La depth map viene generata dalla pipeline immagine (vedi 3D).
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Nessuna depth map disponibile.</div>
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
                    <span className="font-medium">
                      {hmState ? `${hmState.w} × ${hmState.h}` : "—"}
                    </span>
                  </div>
                  <div>
                    Output:{" "}
                    <span className="font-medium">
                      {params.outputMode} / {params.baseStyle}
                    </span>
                  </div>
                  <div>
                    Nota: su desktop la preview 3D resta sempre visibile per evitare scroll continui.
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

      {/* Step 1: Upload */}
      <ReliefUpload file={file} previewUrl={previewUrl} onPickFile={setFile} />

      {/* Step 2: Controls */}
     <ReliefControls
  value={params}
  onChange={setParams}
  disabled={!file}
/>
      {/* Step 3: Preview 2D */}
      {sourceMode === "image" ? (
        <ReliefHeightmapPreview file={file} params={params} maxSize={512} />
      ) : (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-semibold mb-2">Anteprima Depth Map (PRO)</div>
          <p className="text-xs text-gray-500 mb-3">
            PNG 16-bit supportato. Se il rilievo è al contrario, abilita “Inverti depth map”.
          </p>
          <div className="overflow-auto rounded border bg-white p-2">
            <canvas ref={dmCanvasRef} className="block max-h-[320px] w-auto" />
          </div>
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
