import React from "react";
import { Link } from "react-router-dom";
import ReliefGenerate from "@/components/relief/ReliefGenerate";

import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";

export default function Relief() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const [params, setParams] = React.useState<ReliefParams>({
    projectType: "logo_text",
    depthMm: 3.0,
    baseMm: 2.0,
    detail: 0.5,
    smooth: 0.5,
    edge: "round",
  });

  // Create/revoke object URL safely
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ✅ Preset "furbi" quando cambia il tipo progetto
  React.useEffect(() => {
    setParams((p) => {
      // Non sovrascrivere depth/base scelti dall'utente
      const keepDepth = p.depthMm;
      const keepBase = p.baseMm;

      switch (p.projectType) {
        case "logo_text":
          return {
            ...p,
            depthMm: keepDepth,
            baseMm: keepBase,
            smooth: 0.15,
            detail: 0.55,
            edge: "sharp",
          };
        case "human_face":
          return {
            ...p,
            depthMm: keepDepth,
            baseMm: keepBase,
            smooth: 0.7,
            detail: 0.3,
            edge: "round",
          };
        case "animal":
          return {
            ...p,
            depthMm: keepDepth,
            baseMm: keepBase,
            smooth: 0.55,
            detail: 0.45,
            edge: "round",
          };
        case "nature_landscape":
          return {
            ...p,
            depthMm: keepDepth,
            baseMm: keepBase,
            smooth: 0.5,
            detail: 0.4,
            edge: "round",
          };
        case "decorative_pattern":
          return {
            ...p,
            depthMm: keepDepth,
            baseMm: keepBase,
            smooth: 0.25,
            detail: 0.6,
            edge: "sharp",
          };
        default:
          return p;
      }
    });
  }, [params.projectType]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Generatore Bassorilievi</h1>
            <p className="text-sm text-gray-600 mt-1">
              MVP: upload + parametri + heightmap preview. Prossimo step: STL.
            </p>
          </div>

          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        <ReliefUpload file={file} previewUrl={previewUrl} onPickFile={setFile} />

        <ReliefControls value={params} onChange={setParams} disabled={false} />

        {/* ✅ STEP 4A: Heightmap preview */}
        <ReliefHeightmapPreview file={file} params={params} />

        {/* Debug panel (temporaneo) */}
        <div className="rounded-lg bg-white p-4 shadow text-xs text-gray-600">
          <div className="font-medium mb-1">Debug params</div>
          <pre className="overflow-auto">{JSON.stringify(params, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
