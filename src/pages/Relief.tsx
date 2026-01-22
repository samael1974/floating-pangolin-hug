import React from "react";
import { Link } from "react-router-dom";
import ReliefUpload from "@/components/relief/ReliefUpload";

export default function Relief() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Generatore Bassorilievi</h1>
            <p className="text-sm text-gray-600 mt-1">
              MVP: upload + anteprima. Prossimo step: slider + generazione STL.
            </p>
          </div>

          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        <ReliefUpload
          file={file}
          previewUrl={previewUrl}
          onPickFile={setFile}
        />

        {/* Placeholder per step successivi */}
        <div className="rounded-lg bg-white p-6 shadow space-y-2">
          <h2 className="text-lg font-semibold">2) Parametri (prossimo step)</h2>
          <p className="text-sm text-gray-600">
            Aggiungeremo: tipo progetto (logo/volto/animale…), depth mm, base mm,
            detail, smooth, edge, preview heightmap.
          </p>
        </div>
      </div>
    </div>
  );
}
