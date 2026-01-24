import * as React from "react";

import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { downloadReliefStlBinary } from "@/components/relief/reliefStl";
import { inspectPng, pngCompatibilityMessage } from "@/lib/relief/inspectPng";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";


// ✅ 16-bit PNG support
import { decodeDepthmapPng } from "@/lib/relief/decodeDepthmapPng";
import { renderDepthmapToCanvas } from "@/lib/relief/renderDepthmapToCanvas";

type SourceMode = "image" | "depthmap";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type HeightmapBuildOutput =
  | { normF32: Float32Array; w: number; h: number }
  | { grayU8: Uint8Array; w?: number; h?: number; width?: number; height?: number };

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;

  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Impossibile caricare immagine"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  return img;
}

function imageDataToNormF32(imgData: ImageData, invert: boolean): HeightmapState {
  const { data, width: w, height: h } = imgData;
  const out = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    let v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (invert) v = 1 - v;
    out[p] = clamp01(v);
  }

  return { normF32: out, w, h };
}

/**
 * Fallback via Canvas (8-bit) per JPG/WEBP/PNG (se il browser lo “schiaccia”)
 * Il “vero 16-bit” passa da decodeDepthmapPng() (solo PNG).
 */
async function decodeDepthMapToHmStateCanvas(
  file: File,
  invert: boolean,
  maxSize = 512
): Promise<HeightmapState> {
  const img = await loadImageFromFile(file);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSize / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * scale));
  const h = Math.max(2, Math.round(ih * scale));

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;

  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D non disponibile");

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  return imageDataToNormF32(imgData, invert);
}

function invertHmInPlace(hm: HeightmapState) {
  const a = hm.normF32;
  for (let i = 0; i < a.length; i++) a[i] = 1 - clamp01(a[i] ?? 0);
}

export default function ReliefWizard() {
  // ✅ Preview tab (colonna destra)
  const [previewTab, setPreviewTab] = React.useState<"image" | "depth" | "stl">("stl");
  
    // ✅ Modals (help)
const [openConversion, setOpenConversion] = React.useState(false);
const [openGptHowTo, setOpenGptHowTo] = React.useState(false);

  // ✅ Sorgente
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("image");
  const [invertDepthMap, setInvertDepthMap] = React.useState(false);

  // ✅ Upload
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // ✅ Canvas preview depthmap
  const dmCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // ✅ Nome file STL (personalizzabile)
  const [customName, setCustomName] = React.useState<string>("reliefforge");

  // ✅ Params
  const [params, setParams] = React.useState<ReliefParams>(() => ({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief",
    baseStyle: "flat",
  }));

  // ✅ Heightmap state/status
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [hmStatus, setHmStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fileWarning, setFileWarning] = React.useState<string | null>(null);

  // ✅ STL options
  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(2);

  const canGenerate = !!file && hmStatus === "ready" && !!hmState;

  // ✅ preview url
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ✅ UX: quando carichi un file vai su "Immagine"
  React.useEffect(() => {
    if (file) setPreviewTab("image");
  }, [file]);

  // ✅ UX: quando hm pronta vai su "STL"
  React.useEffect(() => {
    if (hmStatus === "ready") setPreviewTab("stl");
  }, [hmStatus]);

  // ✅ pipeline heightmap (image / depthmap 8-16bit)
  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!file) {
        setHmState(null);
        setHmStatus("idle");
        return;
      }
            // reset warning ogni run
      setFileWarning(null);

      // Se sono in depthmap e il file è PNG: controllo IHDR prima di decodificare
      if (sourceMode === "depthmap") {
        const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
        if (isPng) {
          try {
            const head = new Uint8Array(await file.arrayBuffer());
            const info = inspectPng(head);
            const msg = pngCompatibilityMessage(info);

            if (msg) {
              // Mostra warning e blocca pipeline depthmap (così eviti STL rotti)
              if (!cancelled) {
                setFileWarning(
                  `Depth map non compatibile: ${msg}  |  Soluzione: esporta PNG grayscale 16-bit oppure passa a “Modalità Immagine”.`
                );
                setHmState(null);
                setHmStatus("error");
              }
              return;
            }
          } catch {
            // Se fallisce il check, non bloccare: lascia che il decoder gestisca
          }
        }
      }
      setHmStatus("loading");
      const maxSize = 512;

      try {
        // --------------------------
        // DEPTHMAP MODE (PNG 8/16-bit + fallback canvas)
        // --------------------------
        if (sourceMode === "depthmap") {
          const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

          let hm: HeightmapState;

          if (isPng) {
            const buf = new Uint8Array(await file.arrayBuffer());
            const dec = decodeDepthmapPng(buf);
            hm = { normF32: dec.normF32, w: dec.w, h: dec.h };
            if (invertDepthMap) invertHmInPlace(hm);
          } else {
            // fallback canvas (8-bit)
            hm = await decodeDepthMapToHmStateCanvas(file, invertDepthMap, maxSize);
          }

          if (!cancelled) {
            setHmState(hm);
            setHmStatus("ready");
          }
          return;
        }

        // --------------------------
        // IMAGE MODE (tua pipeline)
        // --------------------------
        const img = await loadImageFromFile(file);
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;

        const scale = Math.min(1, maxSize / Math.max(iw, ih));
        const w = Math.max(2, Math.round(iw * scale));
        const h = Math.max(2, Math.round(ih * scale));

        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;

        const ctx = off.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D non disponibile");

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const hmAny = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        }) as unknown as HeightmapBuildOutput;

        const outW = Number((hmAny as any)?.w ?? (hmAny as any)?.width ?? w);
        const outH = Number((hmAny as any)?.h ?? (hmAny as any)?.height ?? h);

        let normF32: Float32Array;
        if ((hmAny as any)?.normF32 instanceof Float32Array) {
          normF32 = (hmAny as any).normF32 as Float32Array;
        } else if ((hmAny as any)?.grayU8 instanceof Uint8Array) {
          const g = (hmAny as any).grayU8 as Uint8Array;
          normF32 = new Float32Array(g.length);
          for (let i = 0; i < g.length; i++) normF32[i] = g[i] / 255;
        } else {
          throw new Error("Heightmap pipeline: output non valido (manca normF32/grayU8)");
        }

        if (normF32.length !== outW * outH) {
          throw new Error(`Heightmap mismatch: normF32(${normF32.length}) != ${outW}*${outH}`);
        }

        if (!cancelled) {
          setHmState({ normF32, w: outW, h: outH });
          setHmStatus("ready");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setHmState(null);
          setHmStatus("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    file,
    sourceMode,
    invertDepthMap,
    params.projectType,
    params.depthMm,
    params.baseMm,
    params.detail,
    params.smooth,
    params.edge,
    params.outputMode,
    params.baseStyle,
  ]);

  // ✅ draw canvas: quando apro il tab "Depth map"
  React.useEffect(() => {
    if (previewTab !== "depth") return;
    if (sourceMode !== "depthmap") return;
    if (!hmState) return;
    const c = dmCanvasRef.current;
    if (!c) return;

    renderDepthmapToCanvas(c, hmState.normF32, hmState.w, hmState.h);
  }, [previewTab, sourceMode, hmState]);

  function estimateStlStats() {
    if (!hmState) return null;

    const effW = Math.max(2, Math.floor(hmState.w / Math.max(1, decimateStep)));
    const effH = Math.max(2, Math.floor(hmState.h / Math.max(1, decimateStep)));

    const topTris = 2 * (effW - 1) * (effH - 1);

    const perimeterQuads = 2 * (effW - 1) + 2 * (effH - 1);
    const sideTris = 2 * perimeterQuads;

    const bottomTris = params.baseMm > 0 ? 2 * (effW - 1) * (effH - 1) : 0;

    const triangles = topTris + sideTris + bottomTris;

    const bytes = 84 + triangles * 50;
    const mb = bytes / (1024 * 1024);

    const isHeavy = triangles > 900_000 || mb > 45;

    let suggestedDecimate = decimateStep;
    if (triangles > 1_800_000) suggestedDecimate = Math.max(decimateStep, 5);
    else if (triangles > 1_200_000) suggestedDecimate = Math.max(decimateStep, 4);
    else if (triangles > 900_000) suggestedDecimate = Math.max(decimateStep, 3);

    return { effW, effH, triangles, mb, isHeavy, suggestedDecimate };
  }

  function downloadStl() {
    if (!hmState) return;

    const safe = (customName || "").trim().replace(/[\\/:*?"<>|]+/g, "_") || "reliefforge";

    downloadReliefStlBinary({
      hm: hmState,
      stlWidthMm,
      decimateStep,
      depthMm: params.depthMm,
      baseMm: params.baseMm,
      outputMode: params.outputMode as any,
      baseStyle: params.baseStyle as any,
      filename: `${safe}.stl`,
    });
  }

    return (
  <>
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      {/* TUTTA LA TUA UI ESISTENTE QUI DENTRO */}
      {/* ...non toccare niente del contenuto... */}
    </div>

    {/* MODAL: Istruzioni conversione */}
    <Dialog open={openConversion} onOpenChange={setOpenConversion}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Converti depth map in PNG 16-bit compatibile</DialogTitle>
          <DialogDescription>
            Se il file non è in scala di grigi o ha un bit-depth non supportato, può generare STL non-manifold.
            Formato consigliato: <span className="font-medium">PNG Grayscale 16-bit</span> (ok anche 8-bit).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-gray-50 p-3">
            <div className="font-semibold">Checklist rapida</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
              <li>Formato: <span className="font-medium">PNG</span></li>
              <li>Colore: <span className="font-medium">Grayscale</span> (scala di grigi)</li>
              <li>
                Profondità: <span className="font-medium">16-bit</span> (consigliato) /{" "}
                <span className="font-medium">8-bit</span> (ok)
              </li>
              <li>Evita: <span className="font-medium">RGB/RGBA</span>, HDR/EXR, “float”, profili strani</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="font-semibold">Metodo 1 — GIMP (gratis)</div>
            <ol className="list-decimal space-y-1 pl-5 text-gray-700">
              <li>Apri l’immagine</li>
              <li><span className="font-medium">Immagine → Modalità → Scala di grigi</span></li>
              <li><span className="font-medium">Immagine → Precisione → Intero 16-bit</span></li>
              <li><span className="font-medium">File → Esporta come… → PNG</span></li>
            </ol>

            <div className="font-semibold">Metodo 2 — Photoshop</div>
            <ol className="list-decimal space-y-1 pl-5 text-gray-700">
              <li>Apri l’immagine</li>
              <li><span className="font-medium">Image → Mode → Grayscale</span></li>
              <li><span className="font-medium">Image → Mode → 16 Bits/Channel</span></li>
              <li><span className="font-medium">File → Export → PNG</span></li>
            </ol>

            <div className="font-semibold">Metodo 3 — ImageMagick (avanzato)</div>
            <div className="overflow-auto rounded-md border bg-black p-3 text-xs text-white">
              magick input.png -colorspace Gray -depth 16 output.png
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Perché succede?</div>
            <div className="mt-1">
              Depth map non compatibili possono introdurre valori anomali → triangoli degeneri, micro-fessure e spigoli non-manifold.
              Convertire in <span className="font-medium">Grayscale 16-bit</span> riduce drasticamente questi errori.
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setOpenConversion(false);
              setSourceMode("image");
            }}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Passa a modalità Immagine
          </button>

          <button
            type="button"
            onClick={() => setOpenConversion(false)}
            className="rounded-md bg-[#1F4E5F] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Ok, capito
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* MODAL: Come usare il GPT */}
    <Dialog open={openGptHowTo} onOpenChange={setOpenGptHowTo}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Come usare il GPT “Generatore mappe di profondità”</DialogTitle>
          <DialogDescription>
            Workflow consigliato per ottenere depth map pulite e compatibili con STL stampabili.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-gray-50 p-3">
            <div className="font-semibold">1) Prompt consigliato</div>
            <div className="mt-2 text-gray-700">
              Chiedi al GPT una depth map:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><span className="font-medium">grayscale</span> (scala di grigi)</li>
                <li><span className="font-medium">16-bit PNG</span></li>
                <li>alto contrasto ma <span className="font-medium">senza banding</span></li>
                <li>superfici <span className="font-medium">lisce</span> (meno rumore)</li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="font-semibold">2) Export corretto</div>
            <div className="mt-2 text-gray-700">
              Quando salvi/esporti, assicurati:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><span className="font-medium">PNG</span></li>
                <li><span className="font-medium">Grayscale</span></li>
                <li><span className="font-medium">16-bit</span> (oppure 8-bit se non disponibile)</li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="font-semibold">3) Nell’app: scelta della sorgente</div>
            <div className="mt-2 text-gray-700">
              <ul className="list-disc space-y-1 pl-5">
                <li>Se hai una depth map pronta: <span className="font-medium">Sorgente → Depth map (8/16-bit)</span></li>
                <li>Se il file dà errore o non sei sicuro: <span className="font-medium">Sorgente → Immagine</span></li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900">
            <div className="font-semibold">Tip pratico</div>
            <div className="mt-1">
              Se vuoi solo il rilievo senza basetta: imposta <span className="font-medium">Spessore base = 0</span>.
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <a
            href="https://chatgpt.com/g/g-69416cfae0f881918529c92c5"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Apri il GPT
          </a>

          <button
            type="button"
            onClick={() => setOpenGptHowTo(false)}
            className="rounded-md bg-[#1F4E5F] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Ok
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
