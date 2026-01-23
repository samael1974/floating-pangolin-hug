import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefGenerate from "@/components/relief/ReliefGenerate";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

export default function ReliefWizard() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const [params, setParams] = React.useState<ReliefParams>({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
  });

  // heightmap per preview 3D (opzionale, ma utile)
  const [hm, setHm] = React.useState<{
    normF32: Float32Array;
    w: number;
    h: number;
  } | null>(null);

  // preview url lifecycle
  React.useEffect(() => {
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return (
    <div className="space-y-6">
      <ReliefUpload file={file} previewUrl={previewUrl} onPickFile={setFile} />

      <ReliefControls value={params} onChange={setParams} disabled={!file} />

      {/* 2D preview: lo lasciamo com'è */}
      <ReliefHeightmapPreview file={file} params={params} maxSize={512} />

      {/* 3D preview: la facciamo dipendere dai dati; per ora hm è opzionale */}
      <ReliefPreview3D
        normF32={hm?.normF32}
        w={hm?.w}
        h={hm?.h}
        widthMm={120}
        depthMm={params.depthMm}
        baseMm={params.baseMm}
        invert={false}
        previewDecimateStep={3}
      />

      {/* STL generate */}
      <ReliefGenerate file={file} params={params} maxSize={512} />
    </div>
  );
}

