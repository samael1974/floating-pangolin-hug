import React from "react";
import type { ReliefParams } from "@/components/relief/ReliefControls";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { heightmapToAsciiStl, downloadTextFile } from "@/components/relief/reliefStl";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number;     // image processing size
  widthMm?: number;     // final print width
  decimateStep?: number; // 1..4
};

export default function ReliefGenerate({
  file,
  params,
  maxSize = 512,
  widthMm = 120,
  decimateStep = 1,
}: Props) {
  const [busy, setBusy] = React.useState(false);

  async function handleGenerate() {
    if (!file || busy) return;
    setBusy(true);

    try {
      // load image
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

      // build heightmap (same pipeline as preview)
      const hm = buildHeightmapFromImageData(imgData, params, {
        normalize: true,
        percentileClip: 0.02,
      });

      // build STL
      const stl = heightmapToAsciiStl(hm.normF32, hm.width, hm.height, {
        widthMm,
        depthMm: params.depthMm,
        baseMm: params.baseMm,
        decimateStep,
      });

      const safeName = `relief_${params.projectType}_${widthMm}mm.stl`;
      downloadTextFile(safeName, stl);

      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-3">
      <div>
        <h2 className="text-lg font-semibold">4) Genera STL</h2>
        <p className="text-sm text-gray-600">
          Genera un STL (heightfield) con base e pareti. Per immagini grandi, usa decimazione.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={handleGenerate}
          disabled={!file || busy}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {busy ? "Generazione…" : "Scarica STL"}
        </button>

        <div className="text-xs text-gray-500">
          Width: {widthMm}mm · Decimate: {decimateStep} · Depth: {params.depthMm}mm · Base: {params.baseMm}mm
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Suggerimento: se lo STL è troppo pesante, imposta decimateStep=2 o 3 (meno triangoli).
      </div>
    </div>
  );
}
