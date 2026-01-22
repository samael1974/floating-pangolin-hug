import React from "react";
import type { ReliefParams } from "@/components/relief/ReliefControls";
import {
  buildHeightmapFromImageData,
  drawHeightmapToCanvas,
} from "@/components/relief/reliefHeightmap";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number; // px
};

export default function ReliefHeightmapPreview({
  file,
  params,
  maxSize = 512,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  React.useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;

    async function run() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D non disponibile");

      // Placeholder
      if (!file) {
        canvas.width = 640;
        canvas.height = 360;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#6b7280";
        ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto";
        ctx.fillText("Carica un’immagine per vedere la heightmap.", 20, 40);
        setStatus("idle");
        return;
      }

      setStatus("loading");

      // Load image safely
      const url = URL.createObjectURL(file);
      revokedUrl = url;

      const img = new Image();
      img.decoding = "async";
      img.src = url;

      await img.decode().catch(() => {
        return new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Impossibile caricare immagine"));
        });
      });

      if (cancelled) return;

      // Scale to maxSize
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.min(1, maxSize / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));

      // Draw to offscreen and read pixels
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) throw new Error("Canvas 2D non disponibile");

      offCtx.drawImage(img, 0, 0, w, h);
      const imgData = offCtx.getImageData(0, 0, w, h);

      // ✅ Use shared pipeline (same one you'll use for STL)
      const hm = buildHeightmapFromImageData(imgData, params, {
        normalize: true,
        percentileClip: 0.02,
      });

      drawHeightmapToCanvas(canvas, hm.grayU8, hm.width, hm.height);

      setStatus("ready");
    }

    run().catch((e) => {
      console.error(e);
      setStatus("error");
    });

    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [file, params.projectType, params.detail, params.smooth, params.edge, maxSize]);

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">3) Heightmap preview (2D)</h2>
          <p className="text-sm text-gray-600">
            Anteprima in scala di grigi del rilievo (bianco = alto, nero = basso).
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {status === "loading"
            ? "Elaborazione…"
            : status === "error"
            ? "Errore preview"
            : status === "ready"
            ? "Pronto"
            : "In attesa"}
        </div>
      </div>

      <div className="w-full rounded border bg-gray-50 overflow-auto">
        <canvas ref={canvasRef} className="block max-w-full" />
      </div>
    </div>
  );
}
