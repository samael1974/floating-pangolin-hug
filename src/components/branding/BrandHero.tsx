// src/components/branding/BrandHero.tsx
import { Link } from "react-router-dom";

type BrandHeroProps = {
  showBackLink?: boolean;
};

export default function BrandHero({ showBackLink = false }: BrandHeroProps) {
  return (
    <header className="bg-[#ECECEC]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
              Tool gratuito • STL manifold • PNG 16-bit • Nessun account
            </div>

            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#1F4E5F] md:text-5xl">
              ReliefForge
            </h1>

            <p className="mt-3 text-base text-slate-700 md:text-lg">
              <span className="font-semibold">Da foto a bassorilievo STL</span>{" "}
              pronto da stampare in pochi minuti.
            </p>

            <div className="mt-3 inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-slate-700">
              <span className="font-medium">Preview 3D</span>
              <span className="mx-2 opacity-50">·</span>
              <span className="font-medium">Controlli precisi</span>
              <span className="mx-2 opacity-50">·</span>
              <span className="font-medium">Export STL</span>
            </div>
          </div>

          {showBackLink ? (
            <Link
              to="/"
              className="shrink-0 text-sm underline text-gray-700 hover:text-gray-900"
            >
              Torna alla Home
            </Link>
          ) : null}
        </div>

        <div className="mt-6 h-px w-full bg-black/5" />
      </div>
    </header>
  );
}
