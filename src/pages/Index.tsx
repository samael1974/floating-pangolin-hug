import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Index() {
  return (
    <div className="min-h-screen bg-[#ECECEC]">
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
              Tool gratuito • STL stampabile • Flow rapido
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-[#1F4E5F] md:text-5xl">
              Trasforma immagini in bassorilievi STL
            </h1>

            <p className="text-base text-slate-700 md:text-lg">
              Carica un’immagine, regola i parametri e scarica uno STL chiuso e pronto
              per la stampa 3D. Nessun account. Nessun fronzolo.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="bg-[#E26D5C] text-white hover:bg-[#d85f50]"
              >
                <Link to="/relief">Vai al generatore</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="border-[#F5A623] text-[#1F4E5F] hover:bg-white"
              >
                <a
                  href="https://chatgpt.com/g/g-69416cfae0f881918529c92c5f1e0ce9-generatore-mappe-di-prodontita-depth-map-v2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Genera Depth Map (GPT)
                </a>
              </Button>
            </div>

            {/* Persuasione sobria (inversa soft) */}
            <p className="text-sm text-slate-600">
              Se non vuoi donare, va benissimo: usalo e basta.{" "}
              <span className="font-medium text-slate-700">
                Se però ti ha risparmiato tempo
              </span>
              , anche un caffè aiuta a mantenerlo gratuito e migliorarlo.
            </p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl bg-white shadow">
              <img
                src="/home/hero-relief.webp"
                alt="Da immagine a depth map a rilievo STL"
                className="h-auto w-full object-cover"
                loading="eager"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Originale → Depth Map → Rilievo STL
            </p>
          </div>
        </div>
      </section>

      {/* 3 CARD: COME FUNZIONA */}
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-[#1F4E5F]">
                1) Carica un’immagine
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                JPG/PNG/WEBP
