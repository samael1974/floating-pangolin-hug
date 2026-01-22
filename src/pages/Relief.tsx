import React from "react";
import { Link } from "react-router-dom";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, {
  ReliefParams,
} from "@/components/relief/ReliefControls";

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

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Generatore Bassorilievi</h1>
            <p className="text-sm text-gray-600 mt-1">
              MVP: upload + parametri. Prossimo step: heightmap preview + STL.
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

        <ReliefControls
          value={params}
          onChange={setParams}
          disabled={false}
        />

        {/* Debug panel (puoi rimuoverlo dopo) */}
        <div className="rounded-lg bg-white p-4 shadow text-xs text-gray-600">
          <div className="font-medium mb-1">Debug params</div>
          <pre className="overflow-auto">{JSON.stringify(params, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
