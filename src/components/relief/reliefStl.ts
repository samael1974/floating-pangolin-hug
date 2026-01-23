import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import { geometryToBinaryStl } from "@/lib/stl/binaryStl";
import type { OutputMode, BaseStyle } from "@/components/relief/ReliefControls";

type Heightmap = { normF32: Float32Array; w: number; h: number };

function downloadArrayBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function decimateHeightmap(hm: Heightmap, step: number): Heightmap {
  const s = Math.max(1, Math.floor(step));
  if (s === 1) return hm;

  const { normF32, w, h } = hm;
  const w2 = Math.max(2, Math.floor((w - 1) / s) + 1);
  const h2 = Math.max(2, Math.floor((h - 1) / s) + 1);
  const out = new Float32Array(w2 * h2);

  for (let y2 = 0; y2 < h2; y2++) {
    const y = Math.min(h - 1, y2 * s);
    for (let x2 = 0; x2 < w2; x2++) {
      const x = Math.min(w - 1, x2 * s);
      out[y2 * w2 + x2] = normF32[y * w + x];
    }
  }

  return { normF32: out, w: w2, h: h2 };
}

export function downloadReliefStlBinary(args: {
  hm: Heightmap;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode;
  baseStyle: BaseStyle;
}) {
  const { hm, stlWidthMm, decimateStep, depthMm, baseMm, outputMode, baseStyle } = args;

  if (hm.normF32.length !== hm.w * hm.h) {
    throw new Error("Heightmap mismatch: normF32 length != w*h");
  }

  const dm = decimateHeightmap(hm, decimateStep);

  const geom = buildSolidFromHeightmap({
    normF32: dm.normF32,
    w: dm.w,
    h: dm.h,
    widthMm: stlWidthMm,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
  });

  const stl = geometryToBinaryStl(geom);

  const tag = `${outputMode}_${baseStyle}`;
  downloadArrayBuffer(stl, `reliefforge_${tag}_${stlWidthMm.toFixed(0)}mm.stl`);
}
// --- COMPAT LAYER (per non rompere ReliefGenerate.tsx)
// Se non ti serve più, lo rimuoviamo dopo aver aggiornato ReliefGenerate.

export function heightmapToAsciiStl() {
  throw new Error("Deprecated: usa downloadReliefStlBinary (STL binario).");
}

export function downloadTestStl() {
  throw new Error("Deprecated: usa downloadReliefStlBinary.");
}

