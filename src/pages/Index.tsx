// src/pages/Index.tsx
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
              Tool gratuito • STL manifold • PNG 16-bit • Nessun account
            </div>

           <div className="flex items-center gap-3">
  <div
    className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm"
    aria-hidden="true"
  >
 <img
  src="/home/reliefforge-logo.png"
  alt="ReliefForge"
  className="h-7 w-4.5"
  loading="eager"
/>


  </div>

 <h1 className="text-4xl font-extrabold tracking-tight text-[#1F4E5F] md:text-5xl">
  <span className="text-[#E26D5C]">R</span>elief
  <span className="text-[#E26D5C]">F</span>orge
</h1>
</div>

            <p className="text-sm text-slate-600 md:text-base">
              Carica un’immagine, regola profondità e dettaglio, scarica uno{" "}
              <span className="font-medium text-slate-900">
                STL chiuso (manifold)
              </span>{" "}
              pronto per la stampa 3D.
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
                JPG/PNG/WEBP. Va bene anche una foto “normale”. Se vuoi più resa
                (volti/loghi), puoi usare una depth map (PNG 8/16-bit).
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-[#1F4E5F]">
                2) Regola il rilievo
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Imposta profondità, dettaglio e base. Se il file è pesante,
                aumenta la decimazione per alleggerirlo.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-[#1F4E5F]">
                3) Scarica lo STL
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Export STL chiuso (manifold) e stampabile. Pronto per slicer e
                stampa 3D.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* DONAZIONE (non invasiva) */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-2xl bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-semibold text-[#1F4E5F]">
                Supporta lo sviluppo (facoltativo)
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Questo progetto resta gratuito. Se ti ha evitato Blender,
                booleane o mesh rotte, puoi offrire un caffè. Nessuna pressione:
                davvero.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="bg-[#E26D5C] text-white hover:bg-[#d85f50]"
              >
                <a
                  href="https://www.paypal.me/federicocordioli72"
                  target="_blank"
                  rel="noreferrer"
                >
                  Dona su PayPal
                </a>
              </Button>

              <div className="flex items-center gap-2 rounded-xl bg-[#ECECEC] px-3 py-2">
                <img
                  src="/home/paypal.webp"
                  alt="PayPal"
                  className="h-6 w-6"
                  loading="lazy"
                />
                <span className="text-xs text-slate-600">
                  Anche 1–2€ fanno la differenza
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Tip: se non puoi donare, il modo migliore per supportare è
            condividere il link con un maker o un amico che stampa in 3D.
          </p>
        </div>
      </section>

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500">
          ReliefForge • Generatore bassorilievi STL
        </div>
      </footer>
    </div>
  );
}
