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

<div className="mt-4 flex items-center gap-3">
  <div
    className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm"
    aria-hidden="true"
  >
    <img
      src="/home/reliefforge-logo.svg"
      alt=""
      className="h-7 w-7"
      style={{ color: "#1F4E5F" }}
      loading="eager"
    />
  </div>

  <h1 className="text-4xl font-extrabold tracking-tight text-[#1F4E5F] md:text-5xl">
    ReliefForge
  </h1>
</div>


        <div className="mt-6 h-px w-full bg-black/5" />
      </div>
    </header>
  );
}
