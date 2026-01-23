import React from "react";
import type { ReliefParams } from "@/components/relief/ReliefControls";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { heightmapToAsciiStl, downloadTextFile } from "@/components/relief/reliefStl";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number; // image processing size
};

type HeightmapData = {
  normF32: Float32Array;
  width: number;
  height: number;
};

export default function ReliefGenerate({ file, params, maxSize = 512 }: Props) {
  const [busy, setBusy] = React.useState(false);

  // ✅ controlli UI
  const [widthMm, setWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(1);

  // ✅ heightmap in state per preview 3D live
  const [hm, setHm] = React.useState<HeightmapData | null>(null);

  // ✅ ogni volta che cambiano file o parametri, rigenera heightmap (solo per preview)
  React.useEffect(() => {
    let cancelled = false;

    async function buildPreviewHeightmap() {
      if (!file) {
        setHm(null);
        return;
      }

      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = "async";
        img.src = url;

        await img.decode().catch(() => {
          return new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Impossibile caricare immagine"));
          });
        });

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSize / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));

        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;

        const offCtx = off.getContext("2d", { willReadFrequently: true });
        if (!offCtx) throw new Error("Canvas 2D non disponibile");

        offCtx.drawImage(img, 0, 0, w, h);
        const imgData = offCtx.getImageData(0, 0, w, h);

        const hmLocal = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        if (!cancelled) setHm(hmLocal);

        URL.revokeObjectURL(url);
      } catch {
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
  ]);

  async function handleGenerate() {
    if (!file || busy) return;
    setBusy(true);

    try {
      // Se abbiamo già la heightmap (preview), riusiamo quella: più veloce e coerente
      let hmLocal = hm;

      // fallback: se hm non è pronta, la calcoliamo ora
      if (!hmLocal) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = "async";
        img.src = url;

        await img.decode().catch(() => {
          return new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Impossibile caricare immagine"));
          });
        });

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSize / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));

        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;

        const offCtx = off.getContext("2d", { willReadFrequently: true });
        if (!offCtx) throw new Error("Canvas 2D non disponibile");

        offCtx.drawImage(img, 0, 0, w, h);
        const imgData = offCtx.getImageData(0, 0, w, h);

        hmLocal = buildHeightmapFromImageData(imgData, params, {
          normalize: true,
          percentileClip: 0.02,
        });

        URL.revokeObjectURL(url);
      }

      const stl = heightmapToAsciiStl(hmLocal.normF32, hmLocal.width, hmLocal.height, {
        widthMm,
        depthMm: params.depthMm,
        baseMm: params.baseMm,
        decimateStep,
        noBasePlate: true,
      });

      const safeName = `relief_${params.projectType}_${widthMm}mm_d${decimateStep}.stl`;
      downloadTextFile(safeName, stl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#1F4E5F]">4) Genera STL</h2>
        <p className="text-sm text-gray-600">
          STL heightfield chiuso (stampabile). Puoi usare la modalità senza piastra piatta.
          Se lo STL è troppo pesante, aumenta la decimazione.
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
            max={4}
            step={1}
            value={decimateStep}
            onChange={(e) => setDecimateStep(Number(e.target.value))}
            className="w-full accent-[#F5A623]"
          />
          <div className="text-xs text-gray-500">
            x1 = massimo dettaglio · x2/x3 = STL più leggero · x4 = molto leggero
          </div>
        </label>
      </div>

      {/* Preview 3D */}
      {hm && (
        <ReliefPreview3D
          normF32={hm.normF32}
          w={hm.width}
          h={hm.height}
          widthMm={widthMm}
          depthMm={params.depthMm}
          baseMm={params.baseMm}
          previewDecimateStep={3}
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
          Depth: {params.depthMm}mm · Base: {params.baseMm}mm · MaxSize: {maxSize}px
        </div>
      </div>
    </div>
  );
}
