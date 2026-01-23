import * as React from "react";
import { Link } from "react-router-dom";

import type { ReliefParams } from "@/components/relief/ReliefControls";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefGenerate from "@/components/relief/ReliefGenerate";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

export default function Relief() {
  const [file, setFile] = React.useState<File | null>(null);

  // ✅ default sensati
  const [params, setParams] = React.useState<ReliefParams>({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
  });

  // ✅ valori calcolati dalla heightmap (servono per preview 3D)
  const [hm, setHm] = React.useState<{
    normF32: Float32Array;
    width: number;
    height: number;
  } | null>(null);

  // se rimuovo file, resetto anche hm
  const handleSetFile = React.useCallback((f: File | null) => {
    setFile(f);
    setHm(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Generatore Bassorilievi
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Upload → parametri → preview 2D → STL
            </p>
          </div>

          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        {/* Main layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Wizard */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1) Upload */}
            <ReliefUpload file={file} onChange={handleSetFile} />

            {/* 2) Controls */}
            <ReliefControls params={params} onChange={setParams} />

            {/* 3) Heightmap */}
            <ReliefHeightmapPreview
              file={file}
              params={params}
              // ✅ questo callback deve esistere nel componente: se non c’è, te lo aggiungo io
              onHeightmap={(next) =>
                setHm({
                  normF32: next.normF32,
                  width: next.width,
                  height: next.height,
                })
              }
            />

            {/* 4) STL */}
            <ReliefGenerate file={file} params={params} />
          </div>

          {/* Preview column */}
          <div className="lg:col-span-1 space-y-4">
            <ReliefPreview3D
              normF32={hm?.normF32}
              w={hm?.width}
              h={hm?.height}
              widthMm={120}
              depthMm={params.depthMm}
              baseMm={params.baseMm}
              previewDecimateStep={3}
            />

            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="text-sm font-semibold text-slate-900">Tip</h3>
              <p className="text-xs text-slate-600 mt-1">
                Se la preview 3D è lenta: aumenta <b>previewDecimateStep</b> (3→4) oppure
                riduci <b>maxSize</b> nell’heightmap.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
