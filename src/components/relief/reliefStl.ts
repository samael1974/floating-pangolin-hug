import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import { geometryToBinaryStl } from "@/lib/stl/binaryStl";
import type { OutputMode, BaseStyle } from "@/lib/reliefTypes";
import { applyCutoutToFlatGeometry } from "@/lib/relief/cutout";

export type HeightmapState = { normF32: Float32Array; w: number; h: number };

type DownloadOpts = {
  hm: HeightmapState;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode;
  baseStyle: BaseStyle;
  filename?: string;

  // ✅ CUTOUT
  cutoutEnabled?: boolean;
  cutoutThreshold?: number;
};

function downloadArrayBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function decimateHeightmap(hm: HeightmapState, step: number): HeightmapState {
  const s = Math.max(1, Math.ceil(step));
  if (s === 1) return hm;

  const { normF32, w, h } = hm;
  const w2 = Math.max(2, Math.ceil((w - 1) / s) + 1);
  const h2 = Math.max(2, Math.ceil((h - 1) / s) + 1);
  const out = new Float32Array(w2 * h2);

  for (let y2 = 0; y2 < h2; y2++) {
    const y = Math.min(h - 1, y2 * s);
    for (let x2 = 0; x2 < w2; x2++) {
      const x = Math.min(w - 1, x2 * s);
      out[y2 * w2 + x2] = normF32[y * w + x] ?? 0;
    }
  }

  return { normF32: out, w: w2, h: h2 };
}

export function downloadReliefStlBinary(opts: DownloadOpts) {
  const {
    hm,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
    filename,
    cutoutEnabled = false,
    cutoutThreshold,
  } = opts;

  if (hm.normF32.length !== hm.w * hm.h) {
    throw new Error("Heightmap mismatch: normF32 length != w*h");
  }

  const dm = decimateHeightmap(hm, decimateStep);
    console.time("A_buildSolidFromHeightmap");
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
  console.timeEnd("A_buildSolidFromHeightmap");

  let finalGeom = geom;

  // 🔥 SAFETY: cutout è super-costoso: lo limitiamo a casi “sicuri”
  const cutoutRequested = !!opts.cutoutEnabled && baseStyle === "flat";

  // Limite risoluzione: sopra questa soglia CSG può esplodere in tempo
  const maxCutoutPixels = 220 * 220; // puoi alzare dopo, prima stabilizziamo
  const pixels = dm.w * dm.h;

  // Forza base minima quando cutout ON (evita degenerazioni e “repair” distruttivo)
  const minBaseForCutout = 0.8;

  if (cutoutRequested) {
    // Se baseMm troppo bassa, la alziamo SOLO per il cutout (UX coerente)
    const baseForCut = Math.max(baseMm, minBaseForCutout);

    if (pixels > maxCutoutPixels) {
      console.warn("CUTOUT: saltato (troppi pixel)", { dmW: dm.w, dmH: dm.h, pixels });
      alert(
        `Cutout disattivato automaticamente: risoluzione troppo alta (${dm.w}×${dm.h}).\n` +
        `Aumenta la decimazione (xT “Qualità”) e riprova.`
      );
    } else {
      try {
        console.time("B_applyCutoutToFlatGeometry");
        finalGeom = applyCutoutToFlatGeometry({
          geom,
          hm: dm,
          widthMm: stlWidthMm,
          depthMm,
          baseMm: baseForCut,
          threshold: 0.18, // fisso per ora, togliamo variabile soglia come vuoi tu
        });
        console.timeEnd("B_applyCutoutToFlatGeometry");
      } catch (e: any) {
        console.error("CUTOUT ERROR", e);
        alert(`Errore Cutout: ${e?.message ?? String(e)}\nProcedo senza cutout.`);
        finalGeom = geom;
      }
    }
  }

  console.time("C_geometryToBinaryStl");
  const stl = geometryToBinaryStl(finalGeom);
  console.timeEnd("C_geometryToBinaryStl");


  // 1) geometry base
  let geom = buildSolidFromHeightmap({
    normF32: dm.normF32,
    w: dm.w,
    h: dm.h,
    widthMm: stlWidthMm,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
  });

  // 2) cutout SOLO per base flat, ma con fallback (non bloccare il download)
  if (baseStyle === "flat" && cutoutEnabled) {
    const thr = cutoutThreshold ?? 0.5; // default stabile (0.45–0.65 è il range tipico)

    try {
      geom = applyCutoutToFlatGeometry({
        geom,
        hm: dm,
        widthMm: stlWidthMm,
        depthMm,
        baseMm,
        threshold: thr,
      });
    } catch (err) {
      console.error("CUTOUT FAILED → fallback geometry originale (download continua)", err);
      // fallback: lasciamo geom originale
    }
  }

  // 3) export STL
  const stl = geometryToBinaryStl(geom);

  // sanity-check STL size
  const pos = geom.getAttribute("position");
  if (!pos) throw new Error("STL: geometry has no position attribute");
  const triCount = pos.count / 3;
  const expected = 84 + 50 * triCount;

  if (stl.byteLength !== expected) {
    console.error("STL byteLength mismatch", { expected, got: stl.byteLength, triCount });
    throw new Error(`STL corrotto: expected ${expected} bytes, got ${stl.byteLength}`);
  }

  const safeName =
    (filename && filename.trim()) ||
    `reliefforge_${outputMode}_${baseStyle}_${Math.round(stlWidthMm)}mm.stl`;

  downloadArrayBuffer(stl, safeName);
}

// --- COMPAT LAYER (se qualche file vecchio lo importa)
export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function heightmapToAsciiStl(..._args: any[]) {
  throw new Error("Deprecated: usa downloadReliefStlBinary (STL binario).");
}

