import React from "react";
import { Link } from "react-router-dom";
import ReliefWizard from "@/components/relief/ReliefWizard";
import type { ReliefParams } from "@/components/relief/ReliefControls";

export default function Relief() {
  const [params, setParams] = React.useState<ReliefParams>({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief",
    baseStyle: "flat",
    invert: false,
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Generatore Bassorilievi (MVP)
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Upload → parametri → preview 2D → STL.
            </p>
          </div>

          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        <ReliefWizard params={params} onParamsChange={setParams} />
      </div>
    </div>
  );
}
