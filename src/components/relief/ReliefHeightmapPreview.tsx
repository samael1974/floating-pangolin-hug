import React from "react";
import type { ReliefParams } from "@/components/relief/ReliefControls";

type Props = {
  file: File | null;
  params: ReliefParams;
  maxSize?: number; // px
};

function clampByte(n: number) {
  return Math.max(0, Math.min(255, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rgbaToGray(data: Uint8ClampedArray) {
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[j] = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
  }
  return gray;
}

function boxBlurGray(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
) {
  if (radius <= 0) return src;
  const r = Math.floor(radius);
  const dst = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let yy = y - r; yy <= y + r; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = x - r; xx <= x + r; xx++) {
          if (xx < 0 || xx >= w) continue;
          sum += src[yy * w + xx];
          cnt++;
        }
      }
      dst[y * w + x] = (sum / cnt) | 0;
    }
  }
  return dst;
}

function enhanceDetail(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  detail: number
) {
  if (detail <= 0) return src;
  const blurred = boxBlurGray(src, w, h, 1);
  const dst = new Uint8ClampedArray(src.length);

  const k = lerp(0.0, 1.5, detail);
  for (let i = 0; i < src.length; i++) {
    const hi = src[i] - blurred[i];
    dst[i] = clampByte(src[i] + hi * k);
  }
  return dst;
}

function applyEdgeMode(src: Uint8ClampedArray, edge: "round" | "sharp") {
  if (edge !== "sharp") return src;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i++) {
    const v = src[i] / 255;
    const c = v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
    dst[i] = clampByte(Math.round(c * 255));
  }
  return dst;
}

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
      const imageData = offCtx.getImageData(0, 0, w, h);

      let gray = rgbaToGray(imageData.data);

      const blurRadius = Math.round(lerp(0, 3, params.smooth));
      if (blurRadius > 0) gray = boxBlurGray(gray, w, h, blurRadius);

      gray = enhanceDetail(gray, w, h, params.detail);
      gray = applyEdgeMode(gray, params.edge);

      canvas.width = w;
      canvas.height = h;

      const out = ctx.createImageData(w, h);
      for (let i = 0, j = 0; j < gray.length; j++, i += 4) {
        const v = gray[j];
        out.data[i] = v;
        out.data[i + 1] = v;
        out.data[i + 2] = v;
        out.data[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);

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
  }, [file, params.detail, params.smooth, params.edge, maxSize]);

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
