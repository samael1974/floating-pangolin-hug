import * as React from "react";
import { Link } from "react-router-dom";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

export default function Relief() {
  // ✅ placeholder sicuro: la preview 3D non renderizza nulla se normF32/w/h non ci sono
  // Quindi possiamo già montare il componente senza rischi.
  const previewProps = React.useMemo(
    () => ({
      widthMm: 120,
      depthMm: 3,
      baseMm: 2,
      previewDecimateStep: 3,
      // normF32/w/h volutamente assenti finché non colleghiamo la pipeline
    }),
    []
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Generatore Bassorilievi (MVP)
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Upload → parametri → preview 2D → STL. Step successivo: preview 3D stabile.
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
          {/* Wizard area */}
          <div className="lg:col-span-2 rounded-lg bg-white p-6 shadow space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Wizard
              </h2>
              <p className="text-sm text-slate-600">
                Qui ricolleghiamo i componenti reali: Upload, Parametri, Heightmap, STL.
              </p>
            </div>

            <div className="rounded-md border border-dashed p-4 text-sm text-slate-600">
              Relief Wizard Placeholder (inseriamo qui i tuoi step reali)
            </div>
          </div>

          {/* Preview side */}
          <div className="lg:col-span-1 space-y-4">
            <ReliefPreview3D {...previewProps} />

            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="text-sm font-semibold text-slate-900">
                Tip
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                La preview 3D apparirà appena colleghiamo <code>normF32</code>, <code>w</code>, <code>h</code>.
                Per ora il box resta stabile senza rompere l’app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
