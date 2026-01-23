import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

// Se hai già un generatore STL, importalo qui (nome indicativo)
// import { buildReliefSTL } from "@/components/relief/reliefStl";

const DEFAULT_PARAMS: ReliefParams = {
  projectType: "logo_text",
  depthMm: 3,
  baseMm: 2,
  detail: 0.55,
  smooth: 0.15,
  edge: "sharp",

  outputMode: "relief",   // NEW
  baseStyle: "flat",      // NEW
  invert: false,          // NEW
};

export default function ReliefWizard() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [params, setParams] = React.useState<ReliefParams>(DEFAULT_PARAMS);

  // Preview URL (cleanup corretto)
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Props 3D: il tuo ReliefPreview3D renderizza solo se normF32/w/h esistono.
  // Quindi per ora lo montiamo “safe”.
  const preview3DProps = React.useMemo(
    () => ({
      widthMm: 120,
      depthMm: params.depthMm,
      baseMm: params.baseMm,
      invert: params.invert,
      previewDecimateStep: 3,
      // normF32/w/h arriveranno quando colleghi la pipeline heightmap->mesh
    }),
    [params.depthMm, params.baseMm, params.invert]
  );

  // Download STL: placeholder (non rompe nulla). Lo colleghiamo dopo.
  async function handleDownloadStl() {
    // Qui ci agganciamo quando hai la funzione vera che produce STL.
    // Per ora non facciamo nulla (evita casini).
    alert("Colleghiamo lo STL generator nel prossimo step 🙂");
  }

  return (
    <div className="space-y-6">
      <ReliefUpload
        file={file}
        previewUrl={previewUrl}
        onPickFile={setFile}
      />

      <ReliefControls
        value={params}
        onChange={setParams}
        disabled={!file}
      />

      <ReliefHeightmapPreview
        file={file}
        params={params}
        maxSize={512}
      />

      {/* Sezione STL + Preview 3D */}
      <div className="rounded-lg bg-white p-6 shadow space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">4) Genera STL</h2>
            <p className="text-sm text-gray-600">
              STL chiuso e stampabile. In base a Modalità/Base/Invert generiamo positivo o stampo.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadStl}
            className="inline-flex items-center justify-center rounded-md bg-[#E46A52] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            disabled={!file}
          >
            Scarica STL
          </button>
        </div>

        <ReliefPreview3D {...preview3DProps} />
      </div>
    </div>
  );
}
