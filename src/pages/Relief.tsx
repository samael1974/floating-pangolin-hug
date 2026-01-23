import * as React from "react";
import { Link } from "react-router-dom";
import ReliefWizard from "@/components/relief/ReliefWizard";

export default function Relief() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Generatore Bassorilievi
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Upload → Parametri → Heightmap → STL.
            </p>
          </div>

          <Link
            to="/"
            className="text-sm underline underline-offset-4 hover:opacity-80"
          >
            Torna alla Home
          </Link>
        </div>

        <ReliefWizard />
      </div>
    </div>
  );
}
