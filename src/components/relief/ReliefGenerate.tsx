import React from "react";
import type { ReliefParams } from "@/components/relief/ReliefControls";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { downloadReliefStlBinary } from "@/components/relief/reliefStl";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number; // image processing size
};

type HeightmapData = {
  normF32: Float32Array;
  w: number;
  h: number;
};

async function loadImage(file: File): Promise<HTMLImageElement> {
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

function ensureHeightmapShape(hm: any): HeightmapData {
  // accettiamo sia {w,h} sia {width,height} (per robustezza)
  const w = Number(hm?.w ?? hm?.width);
  const h = Number(hm?.h ?? hm?.height);
  const normF32 = hm?.normF32;

  if (!(normF32 instanceof Float32Array)) {
    throw new Error("Heightmap non valida: manca normF32 (Float32Array)");
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) {
    throw new Error("Heightmap non valida: w/h non coerenti");
  }
  if (normF32.length !== w * h) {
    throw new Error(`Heightmap mismatch: normF32(${normF32.length}) != ${w}*${h}`);
  }

  return { normF32, w, h };
}

export default function ReliefGenerate({ file, params, maxSize = 512 }: Props) {
  const [busy, setBusy] = React.useState(false);

  // controlli UI
  const [widthMm, setWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(1);

  // heightmap in state per preview 3D live
  const [hm, setHm] = React.useState<HeightmapData | null>(null);

  // rigenera heightmap per preview quando cambia file o parametri
  React.useEffect(() => {
    let cancelled = false;

    async function buildPreviewHeightmap() {
      if (!file) {
        setHm(null);
        return;
      }

      try {
        const img = await loadImage(file);

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSize / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));

        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;

        const ctx = off.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D non disponibile");

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const raw = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        const hmLocal = ensureHeightmapShape(raw);

        if (!cancelled) setHm(hmLocal);
      } catch (e) {
        console.error(e);
        if (!cancelled) setHm(null);
      }
    }

    buildPreviewHeightmap();

    return () => {
      cancelled = true;
    };
  }, [
    file,
    maxSize,
    params.projectType,
    params.depthMm,
    params.baseMm,
    params.detail,
    params.smooth,
    params.edge,
    params.outputMode,
    params.baseStyle,
  ]);

  async function handleGenerate() {
    if (!file || busy) return;
    setBusy(true);

    try {
      // riusa preview se disponibile, altrimenti calcola
      let hmLocal: HeightmapData;

      if (hm) {
        hmLocal = hm;
      } else {
        const img = await loadImage(file);

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSize / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));

        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;

        const ctx = off.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D non disponibile");

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const raw = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        hmLocal = ensureHeightmapShape(raw);
      }

      // ✅ STL BINARIO (mm)
      downloadReliefStlBinary({
        hm: { normF32: hmLocal.normF32, w: hmLocal.w, h: hmLocal.h },
        stlWidthMm: widthMm,
        decimateStep: decimateStep,
        depthMm: params.depthMm,
        baseMm: params.baseMm,
        outputMode: params.outputMode,
        baseStyle: params.baseStyle,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#1F4E5F]">4) Genera STL</h2>
        <p className="text-sm text-gray-600">
          STL binario chiuso (stampabile). Se lo STL è troppo pesante, aumenta la decimazione.
        </p>
      </div>

      {/* Controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Larghezza STL (mm)</span>
            <span className="tabular-nums text-gray-700">{widthMm} mm</span>
          </div>
          <input
            type="range"
            min={40}
            max={300}
            step={5}
            value={widthMm}
            onChange={(e) => setWidthMm(Number(e.target.value))}
            className="w-full accent-[#F5A623]"
          />
          <div className="text-xs text-gray-500">
            Mantiene le proporzioni dell’immagine (altezza calcolata automaticamente).
          </div>
        </label>

        <label className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Qualità (Decimazione)</span>
            <span className="tabular-nums text-gray-700">x{decimateStep}</span>
          </div>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={decimateStep}
            onChange={(e) => setDecimateStep(Number(e.target.value))}
            className="w-full accent-[#F5A623]"
          />
          <div className="text-xs text-gray-500">
            x1 = massimo dettaglio · x2–x3 = STL più leggero · x4+ = molto leggero
          </div>
        </label>
      </div>

      {/* Preview 3D */}
      {hm && (
        <ReliefPreview3D
          normF32={hm.normF32}
          w={hm.w}
          h={hm.h}
          widthMm={widthMm}
          depthMm={params.depthMm}
          baseMm={params.baseMm}
          previewDecimateStep={decimateStep}
        />
      )}

      {/* Action */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={handleGenerate}
          disabled={!file || busy}
          className="px-4 py-2 rounded bg-[#E26D5C] text-white hover:bg-[#d85f50] disabled:opacity-50"
        >
          {busy ? "Generazione…" : "Scarica STL"}
        </button>

        <div className="text-xs text-gray-500">
          Mode: {params.outputMode} · Base: {params.baseStyle} · Depth: {params.depthMm}mm · BaseMm:{" "}
          {params.baseMm}mm · MaxSize: {maxSize}px
        </div>
      </div>
    </div>
  );
}
