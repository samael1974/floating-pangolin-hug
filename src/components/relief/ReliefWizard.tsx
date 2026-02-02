// src/components/relief/ReliefWizard.tsx
import * as React from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

import BrandHero from "@/components/branding/BrandHero";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";
import { downloadGeometryStlBinary } from "@/components/relief/reliefStl";
import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import { buildPassepartoutRectPhi } from "@/lib/relief/frame/buildPassepartoutRectPhi";
import { buildFrameRectPhi } from "@/lib/relief/frame/buildFrameRectPhi";
import { buildFrameRectProfile } from "@/lib/relief/frame/buildFrameRectProfile";
import { FRAME_PROFILES } from "@/lib/relief/frame/frameProfiles";
import { inspectPng, pngCompatibilityMessage } from "@/lib/relief/inspectPng";

// ✅ 16-bit PNG support
import { decodeDepthmapPng } from "@/lib/relief/decodeDepthmapPng";
import { renderDepthmapToCanvas } from "@/lib/relief/renderDepthmapToCanvas";

type SourceMode = "image" | "depthmap";

export type HeightmapState = {
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

function imageDataToNormF32(imgData: ImageData): { normF32: Float32Array; w: number; h: number } {
  const { data, width: w, height: h } = imgData;
  const out = new Float32Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[p] = clamp01(v);
  }

  return { normF32: out, w, h };
}

/**
 * Fallback via Canvas (8-bit) per JPG/WEBP/PNG (se il browser lo “schiaccia”).
 * Il “vero 16-bit” passa da decodeDepthmapPng() (solo PNG).
 */
async function decodeDepthMapToHmStateCanvas(file: File, maxSize = 512): Promise<HeightmapState> {
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

  const { normF32 } = imageDataToNormF32(imgData);
  return { normF32, w, h };
}

function invertHmInPlace(hm: HeightmapState) {
  const a = hm.normF32;
  for (let i = 0; i < a.length; i++) a[i] = 1 - clamp01(a[i] ?? 0);
}

/** File-name safe */
function safeFileName(name: string) {
  const s = (name || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 64);
  return s.length ? s : "reliefforge";
}

/** Decimazione heightmap (coerente con preview/export) */
function decimateHm(hm: HeightmapState, step: number): HeightmapState {
  const s = Math.max(1, Math.floor(step || 1));
  if (s === 1) return hm;

  const w2 = Math.max(2, Math.floor(hm.w / s));
  const h2 = Math.max(2, Math.floor(hm.h / s));
  const out = new Float32Array(w2 * h2);

  for (let y = 0; y < h2; y++) {
    const sy = Math.min(hm.h - 1, y * s);
    for (let x = 0; x < w2; x++) {
      const sx = Math.min(hm.w - 1, x * s);
      out[y * w2 + x] = hm.normF32[sy * hm.w + sx] ?? 0;
    }
  }

  return { normF32: out, w: w2, h: h2 };
}

export default function ReliefWizard() {
  // ✅ Preview tab (colonna destra)
  const [previewTab, setPreviewTab] = React.useState<"image" | "depth" | "stl">("stl");

  // ✅ Pannello istruzioni
  const [showInstructions, setShowInstructions] = React.useState<boolean>(false);

  // ✅ Sorgente
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("image");

  // ✅ Toggle invert (vale per entrambe le modalità)
  const [invertDepthMap, setInvertDepthMap] = React.useState(false);

  // ✅ Upload
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // ✅ Canvas preview depthmap
  const dmCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // ✅ Nome file STL (personalizzabile)
  const [customName, setCustomName] = React.useState<string>("reliefforge");

  const [params, setParams] = React.useState<ReliefParams>(() => ({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief",
    baseStyle: "flat", // "flat" | "recessed" | "offset"
    cutoutEnabled: false, // disattivato
  }));

  // ✅ Heightmap state/status
  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);
  const [hmStatus, setHmStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fileWarning, setFileWarning] = React.useState<string | null>(null);

  // ✅ STL options
  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(2);
  const [qualityPreset, setQualityPreset] = React.useState<"lite" | "standard" | "ultra" | null>(null);
  const [showDonationPrompt, setShowDonationPrompt] = React.useState(false);
  const PHI = 1.618;

  const canGenerate = !!file && hmStatus === "ready" && !!hmState;

  // ---------------------------
  // Step 2: Cornice + Passepartout (MVP)
  // ---------------------------
  const [matEnabled, setMatEnabled] = React.useState(false);
  const [frameEnabled, setFrameEnabled] = React.useState(false);

  const [matParams, setMatParams] = React.useState({
    steps: 3 as 1 | 2 | 3 | 4 | 5 | 6,
    totalBandsMm: 18,
    minBandMm: 6,
    thicknessMm: 1.8,
    stepDropMm: 1.2,
    matDropMm: 0,
    reliefGapMm: 0.35,
  });

  const [frameParams, setFrameParams] = React.useState({
    solidMm: 3.0,
    baseUnitMm: 3.0,
    profileKey: "step_out" as "flat" | "step_out" | "step_in",
    frameHeightMm: 18,
    glassMm: 2 as 2 | 3,
    glassClearanceMm: 0.25,
    pocketDepthMm: 3.6,
    lipMm: 3.0,
    pocketRadialMm: 3.0,
  });


  // ✅ preview url
  React.useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setShowDonationPrompt(false);
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

  // ✅ UX: quando hm pronta vai su "Dettagli"
  React.useEffect(() => {
    if (hmStatus === "ready") setPreviewTab("stl");
  }, [hmStatus]);

  React.useEffect(() => {
    if (params.baseStyle !== "flat") {
      setMatEnabled(false);
      setFrameEnabled(false);
    }
  }, [params.baseStyle]);

  // ✅ pipeline heightmap (image / depthmap 8-16bit)
  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!file) {
        setHmState(null);
        setHmStatus("idle");
        setFileWarning(null);
        return;
      }

      setFileWarning(null);

      // Depthmap PNG compatibility check (solo quando sourceMode=depthmap)
      if (sourceMode === "depthmap") {
        const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
        if (isPng) {
          try {
            const head = new Uint8Array(await file.arrayBuffer());
            const info = inspectPng(head);
            const msg = pngCompatibilityMessage(info);
            if (msg) {
              if (!cancelled) {
                setFileWarning(
                  `Questo file non è una depth map compatibile (probabile 32-bit/float o RGB).\n` +
                    `Soluzioni: 1) Converti in PNG Grayscale 16-bit, oppure 2) passa a “Modalità Immagine”.`
                );
                setHmState(null);
                setHmStatus("error");
              }
              return;
            }
          } catch {
            // non bloccare
          }
        }
      }

      setHmStatus("loading");

      try {
        const maxSize = 512;

        // ------------------------
        // DEPTHMAP MODE
        // ------------------------
        if (sourceMode === "depthmap") {
          const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
          let hm: HeightmapState;

          if (isPng) {
            const buf = new Uint8Array(await file.arrayBuffer());
            const dec = decodeDepthmapPng(buf);
            hm = { normF32: dec.normF32, w: dec.w, h: dec.h };
          } else {
            hm = await decodeDepthMapToHmStateCanvas(file, maxSize);
          }

          // ✅ Invert applicato qui
          if (invertDepthMap) invertHmInPlace(hm);

          if (!cancelled) {
            setHmState(hm);
            setHmStatus("ready");
          }
          return;
        }

        // ------------------------
        // IMAGE MODE
        // ------------------------
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

        const hm: HeightmapState = { normF32, w: outW, h: outH };

        // ✅ Invert applicato ANCHE qui (modalità immagine)
        if (invertDepthMap) invertHmInPlace(hm);

        if (!cancelled) {
          setHmState(hm);
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
    params.baseStyle,
    params.outputMode,
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
    const bottomTris = (params.baseMm ?? 0) > 0 ? 2 * (effW - 1) * (effH - 1) : 0;

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
    try {
      if (!hmState) {
        console.warn("Heightmap non pronta: hmState è null");
        alert("Heightmap non pronta. Carica un file e attendi il calcolo.");
        return;
      }

      const name = safeFileName(customName);

      // ✅ decimazione coerente con slider (export e preview allineati)
      const hmForExport = decimateStep > 1 ? decimateHm(hmState, decimateStep) : hmState;

      const reliefOut = buildSolidFromHeightmap({
        height01: hmForExport.normF32,
        width: hmForExport.w,
        height: hmForExport.h,
        outWidthMm: stlWidthMm,
        depthMm: params.depthMm,
        baseMm: params.baseMm,
        baseStyle: params.baseStyle,
        invert: false,
        clampHeights: true,
        minBaseMm: 0.4,
      });
      const reliefGeom = reliefOut.geometry;
      reliefGeom.computeBoundingBox();
      const reliefBox = reliefGeom.boundingBox;
      if (reliefBox) {
        const center = new THREE.Vector3();
        reliefBox.getCenter(center);
        reliefGeom.translate(-center.x, -reliefBox.min.y, -center.z);
      }

      const reliefPlan = buildReliefPlan();
      if (!reliefPlan) {
        throw new Error("Relief plan non disponibile");
      }

      const geoms: THREE.BufferGeometry[] = [];
      const reliefGap = matEnabled ? matParams.reliefGapMm : 0;
      const matThickness = matEnabled ? Math.max(1.8, matParams.thicknessMm) : 0;
      reliefGeom.translate(0, matThickness + reliefGap, 0);
      geoms.push(reliefGeom);

      if (matEnabled) {
        const out = buildPassepartoutRectPhi({
          innerWmm: reliefPlan.w,
          innerHmm: reliefPlan.h,
          steps: matParams.steps,
          totalBandsMm: matParams.totalBandsMm,
          thicknessMm: Math.max(1.8, matParams.thicknessMm),
          stepDropMm: matParams.stepDropMm,
          minBandMm: matParams.minBandMm,
        });
        const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
        const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
        if (vertices && indices) {
          const matGeom = toBufferGeometry(vertices, indices);
          matGeom.rotateX(-Math.PI / 2);
          matGeom.computeBoundingBox();
          const bb = matGeom.boundingBox;
          if (bb) {
            matGeom.translate(0, -bb.min.y, 0);
          }
          geoms.push(matGeom);
        }
      }

      if (frameEnabled) {
        const matBands = matEnabled ? Math.max(matParams.totalBandsMm, matParams.minBandMm * matParams.steps) : 0;
        const innerW = reliefPlan.w + 2 * matBands;
        const innerH = reliefPlan.h + 2 * matBands;
        const profile = FRAME_PROFILES.find((item) => item.key === frameParams.profileKey);
        const out =
          profile && frameParams.profileKey !== "flat"
            ? buildFrameRectProfile({
                innerWmm: innerW,
                innerHmm: innerH,
                unitMm: frameParams.baseUnitMm,
                steps: profile.steps,
              })
            : buildFrameRectPhi({
                innerWmm: innerW,
                innerHmm: innerH,
                thicknessMm: frameParams.solidMm,
                heightMm: frameParams.frameHeightMm,
                glassMm: frameParams.glassMm,
                glassClearanceMm: frameParams.glassClearanceMm,
                glueLipMm: frameParams.lipMm,
              });
        const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
        const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
        if (vertices && indices) {
          const frameGeom = toBufferGeometry(vertices, indices);
          frameGeom.computeBoundingBox();
          const bb = frameGeom.boundingBox;
          if (bb) {
            frameGeom.translate(0, -bb.min.y, 0);
          }
          geoms.push(frameGeom);
        }
      }

      const merged = mergeGeometries(
        geoms.map((g) => (g.index ? g.toNonIndexed() : g)),
        false
      );
      if (!merged) {
        throw new Error("Merge geometry fallito");
      }

      downloadGeometryStlBinary(merged, name, { checkClosed: true, upAxis: "y" });
      setShowDonationPrompt(true);
    } catch (e: any) {
      console.error("STL: ERROR", e);
      alert(`Errore export STL: ${e?.message ?? String(e)}`);
    }
  }

  const buildReliefPlan = React.useCallback(() => {
    if (!hmState) return null;
    const w = Math.max(1, stlWidthMm);
    const h = w * (hmState.h / hmState.w);
    return { w, h };
  }, [hmState, stlWidthMm]);

  const toBufferGeometry = React.useCallback((vertices: Float32Array, indices: Uint32Array) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();
    return g;
  }, []);

  const applyFrameHeightPreset = React.useCallback(
    (multiplier: number) => {
      const base = Math.max(1, frameParams.baseUnitMm);
      const next = Number((base * multiplier).toFixed(2));
      setFrameParams((prev) => ({ ...prev, frameHeightMm: next }));
    },
    [frameParams.baseUnitMm]
  );

  const openInstructions = React.useCallback(() => {
    setShowInstructions(true);
    requestAnimationFrame(() => {
      document.getElementById("rf-instructions")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      {/* Hero / brand */}
      <div className="mb-6">
        <BrandHero />
      </div>

      <div className="sticky top-0 z-20 -mx-4 mb-4 border-y border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sorgente</span>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setSourceMode("image")}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  sourceMode === "image"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Immagine
              </button>

              <button
                type="button"
                onClick={() => setSourceMode("depthmap")}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  sourceMode === "depthmap"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Depth map
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preset</span>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                disabled={!file}
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    projectType: "logo_text",
                    depthMm: 3.0,
                    baseMm: 2.0,
                    detail: 0.65,
                    smooth: 0.12,
                    edge: "sharp",
                    outputMode: "relief",
                    baseStyle: "flat",
                  }))
                }
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : params.projectType === "logo_text"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Logo
              </button>

              <button
                type="button"
                disabled={!file}
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    projectType: "human_face",
                    depthMm: 4.0,
                    baseMm: 2.0,
                    detail: 0.55,
                    smooth: 0.28,
                    edge: "round",
                    outputMode: "relief",
                    baseStyle: "flat",
                  }))
                }
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : params.projectType === "human_face"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Volto
              </button>

              <button
                type="button"
                disabled={!file}
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    projectType: "nature_landscape",
                    depthMm: 5.0,
                    baseMm: 2.0,
                    detail: 0.58,
                    smooth: 0.2,
                    edge: "round",
                    outputMode: "relief",
                    baseStyle: "flat",
                  }))
                }
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : params.projectType === "nature_landscape"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Paesaggio
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Base</span>
            <div className="inline-flex overflow-hidden rounded-md border">
              {(["flat", "recessed", "offset"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  disabled={!file}
                  onClick={() => setParams((p) => ({ ...p, baseStyle: style }))}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize ${
                    !file
                      ? "cursor-not-allowed bg-white text-gray-400"
                      : params.baseStyle === style
                      ? "bg-[#1F4E5F] text-white"
                      : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                  }`}
                >
                  {style === "flat" ? "Flat" : style === "recessed" ? "Recessed" : "Offset"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Qualità</span>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("lite");
                  setDecimateStep(4);
                  setStlWidthMm(120);
                  setParams((p) => ({ ...p, detail: 0.5 }));
                }}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : qualityPreset === "lite"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Lite
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("standard");
                  setDecimateStep(2);
                  setStlWidthMm(120);
                  setParams((p) => ({ ...p, detail: 0.6 }));
                }}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : qualityPreset === "standard"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Std
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("ultra");
                  setDecimateStep(1);
                  setStlWidthMm(200);
                  setParams((p) => ({ ...p, detail: 0.75 }));
                }}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed bg-white text-gray-400"
                    : qualityPreset === "ultra"
                    ? "bg-[#1F4E5F] text-white"
                    : "bg-white text-[#1F4E5F] hover:bg-gray-50"
                }`}
              >
                Ultra
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="rounded-md border px-3 py-1.5 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
            >
              {showInstructions ? "Chiudi istruzioni" : "Istruzioni"}
            </button>
            <button
              type="button"
              onClick={downloadStl}
              disabled={!canGenerate}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                canGenerate ? "bg-[#E26D5C] text-white hover:bg-[#d85f50]" : "cursor-not-allowed bg-gray-200 text-gray-500"
              }`}
            >
              Scarica STL
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[420px_1fr] lg:grid-cols-[460px_1fr]">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Upload */}
          <div className="space-y-3 rounded-lg bg-white p-4 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">1) Carica un file</div>
                <div className="text-xs text-gray-500">
                  <p>
                    JPG/JPEG/PNG/WEBP. Per Depth map:{" "}
                    <span className="font-medium">PNG 16-bit in scala di grigi</span> consigliato.
                  </p>
                  <p className="mt-1">
                    <button
                      type="button"
                      onClick={openInstructions}
                      className="underline underline-offset-4 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      Non sai come ottenerlo? Apri Istruzioni → Depth map
                    </button>
                  </p>
                </div>
              </div>

              {file && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Rimuovi
                </button>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={invertDepthMap}
                onChange={(e) => setInvertDepthMap(e.target.checked)}
              />
              <span>Inverti profondità</span>
              <span className="text-xs text-gray-500">(se viene “al contrario”)</span>
            </label>

            {/* Warning compatibilità depth map */}
            {fileWarning && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <div className="text-xs font-semibold">⚠️ Attenzione</div>
                <div className="mt-1 whitespace-pre-line text-xs leading-snug">{fileWarning}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openInstructions}
                    className="rounded-md bg-[#1F4E5F] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    📌 Apri istruzioni
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceMode("image")}
                    className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    🖼 Passa a modalità Immagine
                  </button>
                </div>
              </div>
            )}

            {file && (
              <div className="text-xs text-gray-600">
                <div className="font-medium">File:</div>
                <div className="break-all">{file.name}</div>
                <div className="mt-1">
                  Stato heightmap:{" "}
                  <span
                    className={`font-medium ${
                      hmStatus === "ready"
                        ? "text-green-700"
                        : hmStatus === "loading"
                        ? "text-amber-700"
                        : hmStatus === "error"
                        ? "text-red-700"
                        : "text-gray-600"
                    }`}
                  >
                    {hmStatus}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick presets */}
          <div className="space-y-3 rounded-lg bg-white p-4 shadow">
            <div>
              <div className="text-sm font-semibold">2) Quick Presets</div>
              <div className="text-xs text-gray-500">
                1 click per partire bene: qualità, dimensione e base già impostate.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("lite");
                  setDecimateStep(4);
                  setStlWidthMm(120);
                  setParams((p) => ({ ...p, detail: 0.5 }));
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : qualityPreset === "lite"
                    ? "border-[#1F4E5F] text-[#1F4E5F]"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Lite (STL leggero)
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("standard");
                  setDecimateStep(2);
                  setStlWidthMm(120);
                  setParams((p) => ({ ...p, detail: 0.6 }));
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : qualityPreset === "standard"
                    ? "border-[#1F4E5F] text-[#1F4E5F]"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Standard (bilanciato)
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={() => {
                  setQualityPreset("ultra");
                  setDecimateStep(1);
                  setStlWidthMm(200);
                  setParams((p) => ({ ...p, detail: 0.75 }));
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  !file
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : qualityPreset === "ultra"
                    ? "border-[#1F4E5F] text-[#1F4E5F]"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Ultra (max dettaglio)
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Size</div>
              <div className="flex flex-wrap gap-2">
                {[60, 120, 200].map((size) => (
                  <button
                    key={size}
                    type="button"
                    disabled={!file}
                    onClick={() => setStlWidthMm(size)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      !file
                        ? "cursor-not-allowed border-gray-200 text-gray-400"
                        : Math.round(stlWidthMm) === size
                        ? "border-[#1F4E5F] bg-[#1F4E5F]/10 text-[#1F4E5F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {size} mm
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Base</div>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((base) => (
                  <button
                    key={base}
                    type="button"
                    disabled={!file}
                    onClick={() => setParams((p) => ({ ...p, baseMm: base }))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      !file
                        ? "cursor-not-allowed border-gray-200 text-gray-400"
                        : Math.abs(params.baseMm - base) < 0.01
                        ? "border-[#1F4E5F] bg-[#1F4E5F]/10 text-[#1F4E5F]"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {base} mm
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                Base 0 = solo rilievo. Se vuoi uno STL chiuso, usa almeno 0.4–1 mm.
              </p>
            </div>
          </div>

          {/* Params */}
          <div className="space-y-3 rounded-lg bg-white p-4 shadow">
            <div>
              <div className="text-sm font-semibold">3) Parametri bassorilievo</div>
              <div className="text-xs text-gray-500">
                I parametri restano attivi anche in modalità Depth map.{" "}
                <span className="font-medium">Nota:</span> lo STL esportato è sempre{" "}
                <span className="font-medium">chiuso (manifold)</span>, quindi serve uno{" "}
                <span className="font-medium">spessore minimo</span>: non è possibile esportare
                “solo superficie” con base = 0. Se vuoi un risultato molto sottile, imposta una base
                piccola (es. <span className="font-medium">0.4–1.0 mm</span>).
              </div>
            </div>

            <div className="pt-2">
              <ReliefControls value={params} onChange={setParams} disabled={!file} />
            </div>
          </div>

          {/* Passepartout + Cornice (Avanzate) */}
          <div className="space-y-4 rounded-lg bg-white p-4 shadow">
            <div>
              <div className="text-sm font-semibold">Avanzate: Passepartout & Cornice</div>
              <div className="text-xs text-gray-500">
                Funzioni per utenti avanzati. La cornice segue preset basati su φ ({PHI}).
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Passepartout</div>
                    <div className="text-xs text-gray-500">
                      Aggiunge un margine attorno al rilievo con gradini.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={matEnabled}
                      onChange={(e) => setMatEnabled(e.target.checked)}
                      disabled={!file || params.baseStyle !== "flat"}
                    />
                    Abilita
                  </label>
                </div>
                {params.baseStyle !== "flat" && (
                  <div className="mt-2 text-xs text-amber-700">
                    Disponibile solo con base piatta.
                  </div>
                )}

                {matEnabled && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Bande (steps)</span>
                        <span className="tabular-nums text-gray-700">{matParams.steps}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={1}
                        value={matParams.steps}
                        onChange={(e) =>
                          setMatParams((prev) => ({
                            ...prev,
                            steps: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6,
                          }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Margine totale (mm)</span>
                        <span className="tabular-nums text-gray-700">{matParams.totalBandsMm.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={120}
                        step={1}
                        value={matParams.totalBandsMm}
                        onChange={(e) =>
                          setMatParams((prev) => ({ ...prev, totalBandsMm: Number(e.target.value) }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Spessore (mm)</span>
                        <span className="tabular-nums text-gray-700">{matParams.thicknessMm.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={1.8}
                        max={8}
                        step={0.1}
                        value={matParams.thicknessMm}
                        onChange={(e) =>
                          setMatParams((prev) => ({ ...prev, thicknessMm: Number(e.target.value) }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Gradino (mm)</span>
                        <span className="tabular-nums text-gray-700">{matParams.stepDropMm.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={6}
                        step={0.1}
                        value={matParams.stepDropMm}
                        onChange={(e) =>
                          setMatParams((prev) => ({ ...prev, stepDropMm: Number(e.target.value) }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Cornice</div>
                    <div className="text-xs text-gray-500">
                      Larghezza base impostabile + altezze preset basate su φ.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={frameEnabled}
                      onChange={(e) => setFrameEnabled(e.target.checked)}
                      disabled={!file || params.baseStyle !== "flat"}
                    />
                    Abilita
                  </label>
                </div>
                {params.baseStyle !== "flat" && (
                  <div className="mt-2 text-xs text-amber-700">
                    Disponibile solo con base piatta.
                  </div>
                )}

                {frameEnabled && (
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Profilo cornice</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: "flat", label: "Piatta" },
                          { key: "step_out", label: "Gradoni esterni" },
                          { key: "step_in", label: "Gradoni interni" },
                        ].map((profile) => (
                          <button
                            key={profile.key}
                            type="button"
                            onClick={() =>
                              setFrameParams((prev) => ({
                                ...prev,
                                profileKey: profile.key as "flat" | "step_out" | "step_in",
                              }))
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              frameParams.profileKey === profile.key
                                ? "border-[#1F4E5F] bg-[#1F4E5F]/10 text-[#1F4E5F]"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                            disabled={!file}
                          >
                            {profile.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Ogni quadratino ha base 3 mm. Modifica l’unità per scalare il profilo.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Unità base (mm)</span>
                        <span className="tabular-nums text-gray-700">{frameParams.baseUnitMm.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={12}
                        step={0.5}
                        value={frameParams.baseUnitMm}
                        onChange={(e) =>
                          setFrameParams((prev) => ({
                            ...prev,
                            baseUnitMm: Number(e.target.value),
                            solidMm: Number(e.target.value),
                          }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Altezza cornice (mm)</span>
                        <span className="tabular-nums text-gray-700">{frameParams.frameHeightMm.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={60}
                        step={0.5}
                        value={frameParams.frameHeightMm}
                        onChange={(e) =>
                          setFrameParams((prev) => ({ ...prev, frameHeightMm: Number(e.target.value) }))
                        }
                        className="w-full"
                        disabled={!file}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyFrameHeightPreset(PHI)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
                          disabled={!file}
                        >
                          φ × base
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFrameHeightPreset(PHI * PHI)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
                          disabled={!file}
                        >
                          φ² × base
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFrameHeightPreset(PHI * PHI * PHI)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
                          disabled={!file}
                        >
                          φ³ × base
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Preset calcolati da unità base × φ (1.618).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* STL Options */}
          <div className="space-y-4 rounded-lg bg-white p-4 shadow">
            <div>
              <div className="text-sm font-semibold">4) Genera STL</div>
              <div className="text-xs text-gray-500">STL binario chiuso (stampabile).</div>
            </div>

            {/* Nome file */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Nome file STL</span>
                <span className="text-xs text-gray-500">.stl</span>
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="es. logo_giovanni_v1"
                className="w-full rounded-md border px-3 py-2 text-sm"
                disabled={!file}
              />
              <div className="text-xs text-gray-500">Se vuoto, userò un nome di default.</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Larghezza STL (mm)</span>
                <span className="tabular-nums text-gray-700">{Math.round(stlWidthMm)} mm</span>
              </div>
              <input
                type="range"
                min={30}
                max={300}
                step={1}
                value={stlWidthMm}
                onChange={(e) => setStlWidthMm(Number(e.target.value))}
                className="w-full"
                disabled={!file}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Qualità (Decimazione)</span>
                <span className="tabular-nums text-gray-700">x{decimateStep}</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={decimateStep}
                onChange={(e) => setDecimateStep(Number(e.target.value))}
                className="w-full"
                disabled={!file}
              />
              <div className="text-xs text-gray-500">
                Suggerimento: x2–x3 è un buon compromesso. Più alto = più leggero, meno dettaglio.
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={downloadStl}
                disabled={!canGenerate}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${
                  canGenerate ? "bg-[#E26D5C] text-white hover:bg-[#d85f50]" : "cursor-not-allowed bg-gray-200 text-gray-500"
                }`}
              >
                Scarica STL
              </button>
              <div className="text-xs text-gray-500">
                Lo STL include automaticamente passepartout e cornice quando abilitate.
              </div>
              {showDonationPrompt && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div className="font-semibold">Ti ha evitato Blender o booleane?</div>
                  <div className="mt-1">
                    Offrimi un caffè: anche 1–2€ fanno la differenza.{" "}
                    <a
                      href="https://www.paypal.me/federicocordioli72"
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline underline-offset-2"
                    >
                      Supporta su PayPal
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="self-start md:sticky md:top-4">
          <div className="space-y-4 rounded-lg bg-white p-4 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Anteprime</div>
                <div className="text-xs text-gray-500">Il 3D resta visibile mentre modifichi i parametri.</div>
              </div>

              <div className="text-xs">
                {hmStatus === "ready" ? (
                  <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">Heightmap pronta</span>
                ) : hmStatus === "loading" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">Calcolo…</span>
                ) : hmStatus === "error" ? (
                  <span className="rounded-full bg-red-100 px-2 py-1 font-medium text-red-800">Errore</span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">In attesa</span>
                )}
              </div>
            </div>

            {/* 3D */}
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
                <div className="text-sm font-medium">Preview 3D</div>
                <div className="text-xs text-gray-500">Drag • Zoom</div>
              </div>

              <div className="h-[420px] lg:h-[520px]">
                <ReliefPreview3D
  hmState={hmState}
  stlWidthMm={stlWidthMm}
  decimateStep={decimateStep}
  depthMm={params.depthMm}
  baseMm={params.baseMm}
  outputMode={params.outputMode}
  baseStyle={params.baseStyle}
  mat={{
    enabled: matEnabled,
    steps: matParams.steps,
    totalBandsMm: matParams.totalBandsMm,
    minBandMm: matParams.minBandMm,
    thicknessMm: matParams.thicknessMm,
    stepDropMm: matParams.stepDropMm,
    matDropMm: matParams.matDropMm,
    reliefGapMm: matParams.reliefGapMm,
  }}
  frame={{
    enabled: frameEnabled,
    solidMm: frameParams.solidMm,
    baseUnitMm: frameParams.baseUnitMm,
    profileKey: frameParams.profileKey,
    frameHeightMm: frameParams.frameHeightMm,
    glassMm: frameParams.glassMm,
    glassClearanceMm: frameParams.glassClearanceMm,
    pocketDepthMm: frameParams.pocketDepthMm,
    lipMm: frameParams.lipMm,
    pocketRadialMm: frameParams.pocketRadialMm,
  }}
/>
              </div>
            </div>

            {/* Tabs + Istruzioni */}
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
                {/* ✅ Tabs puliti */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("image")}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      previewTab === "image"
                        ? "bg-[#1F4E5F] text-white"
                        : "border bg-white text-[#1F4E5F] hover:bg-gray-50"
                    }`}
                  >
                    Immagine
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewTab("depth")}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      previewTab === "depth"
                        ? "bg-[#1F4E5F] text-white"
                        : "border bg-white text-[#1F4E5F] hover:bg-gray-50"
                    }`}
                  >
                    Depth map
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewTab("stl")}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      previewTab === "stl"
                        ? "bg-[#1F4E5F] text-white"
                        : "border bg-white text-[#1F4E5F] hover:bg-gray-50"
                    }`}
                  >
                    Dettagli
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInstructions((v) => !v)}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    showInstructions ? "bg-[#1F4E5F] text-white" : "border bg-white text-[#1F4E5F] hover:bg-gray-50"
                  }`}
                  aria-expanded={showInstructions}
                  aria-controls="rf-instructions"
                >
                  {showInstructions ? "Chiudi istruzioni" : "Istruzioni"}
                </button>
              </div>

              {showInstructions && (
                <div id="rf-instructions" role="region" className="border-b bg-white px-3 py-3 text-xs text-gray-700">
                  <div className="text-sm font-semibold text-gray-900">Come funziona ReliefForge</div>
                  <div className="mt-1 text-xs text-gray-500">
                    In 3 passaggi trasformi un’immagine (o una depth map) in uno STL chiuso e stampabile.
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border bg-gray-50 p-3">
                      <div className="font-semibold text-gray-900">1) Scegli la sorgente</div>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        <li>
                          <span className="font-semibold">Immagine</span>: consigliata per iniziare (più tollerante).
                        </li>
                        <li>
                          <span className="font-semibold">Depth map</span>: usala se hai già una mappa di profondità (più controllo).
                        </li>
                      </ul>

                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                        <div className="font-semibold">Depth map: formato consigliato</div>
                        <div className="mt-1">
                          PNG <span className="font-semibold">grayscale</span> <span className="font-semibold">16-bit</span>. Evita 32-bit/float/HDR o PNG RGB.
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-gray-50 p-3">
                      <div className="font-semibold text-gray-900">2) Regola i parametri</div>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        <li>
                          <span className="font-semibold">Altezza rilievo</span>: quanto “sporge” il bassorilievo (mm).
                        </li>
                        <li>
                          <span className="font-semibold">Spessore base</span>: tienilo basso (0.4–1 mm) se vuoi un rilievo molto sottile.
                        </li>
                        <li>
                          <span className="font-semibold">Decimazione</span>: x2–x3 consigliato.
                        </li>
                      </ul>

                      <div className="mt-3 rounded-md border border-gray-200 bg-white p-2">
                        <div className="font-semibold">Tip rapido</div>
                        <div className="mt-1">
                          Se il rilievo viene “al contrario”, attiva <span className="font-semibold">Inverti profondità</span>.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border bg-white p-3">
                    <div className="font-semibold text-gray-900">3) Scarica lo STL</div>
                    <div className="mt-1">
                      Premi <span className="font-semibold">Scarica STL</span>: otterrai uno STL <span className="font-semibold">chiuso (manifold)</span>.
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href="https://chatgpt.com/g/g-69416cfae0f881918529c92c5f1e0ce9-depth-map-generator-v2"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border px-3 py-1.5 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
                      >
                        Genera Depth Map (GPT)
                      </a>
                      <a
                        href="https://www.paypal.me/federicocordioli72"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border px-3 py-1.5 text-xs font-semibold text-[#1F4E5F] hover:bg-gray-50"
                      >
                        Supporta il progetto (PayPal)
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Contenuto tab */}
              <div className="p-3">
                {previewTab === "image" && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Anteprima immagine</div>
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Anteprima"
                        className="max-h-[240px] w-full rounded-md border object-contain"
                      />
                    ) : (
                      <div className="text-xs text-gray-500">Carica un file per vedere l’anteprima.</div>
                    )}
                  </div>
                )}

                {previewTab === "depth" && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Anteprima depth map</div>
                    {sourceMode === "depthmap" ? (
                      <canvas ref={dmCanvasRef} className="max-h-[240px] w-full rounded-md border" />
                    ) : (
                      <div className="text-xs text-gray-500">
                        In modalità Immagine, la depthmap è interna alla pipeline (vedi 3D).
                      </div>
                    )}
                  </div>
                )}

                {previewTab === "stl" && (
                  <div className="space-y-2 text-xs text-gray-600">
                    {(() => {
                      const s = estimateStlStats();

                      const baseMmNum = Number(params.baseMm ?? 0);
                      const reliefMm = Number(params.depthMm ?? 0);
                      const totalMm = baseMmNum + reliefMm;

                      const hmW = hmState?.w ?? 0;
                      const hmH = hmState?.h ?? 0;

                      const mmPerPx = stlWidthMm > 0 && hmW > 0 ? stlWidthMm / hmW : NaN;
                      const stlHeightMm = Number.isFinite(mmPerPx) && hmH > 0 ? hmH * mmPerPx : NaN;

                      const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

                      return (
                        <>
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                            <div className="font-medium text-gray-700">Dimensioni</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <div className="text-gray-600">Pianta (X × Y)</div>
                              <div className="font-medium text-gray-800">
                                {fmt(stlWidthMm, 2)} × {fmt(stlHeightMm, 2)} mm
                              </div>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <div className="text-gray-600">Altezza totale (Z)</div>
                              <div className="font-medium text-gray-800">{fmt(totalMm, 2)} mm</div>
                            </div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <div className="text-gray-600">Scala</div>
                              <div className="font-medium text-gray-800">{fmt(mmPerPx, 4)} mm/px</div>
                            </div>
                          </div>

                          <div>
                            Risoluzione heightmap:{" "}
                            <span className="font-medium">{hmState ? `${hmState.w} × ${hmState.h} px` : "—"}</span>
                          </div>

                          <div className="border-t pt-2">
                            <div className="font-medium text-gray-700">Metriche STL</div>
                            {s ? (
                              <>
                                <div>
                                  Campionamento (post-decimazione):{" "}
                                  <span className="font-medium">
                                    {s.effW} × {s.effH} px
                                  </span>
                                </div>
                                <div>
                                  Triangoli stimati: <span className="font-medium">{s.triangles.toLocaleString()}</span>
                                </div>
                                <div>
                                  Peso stimato STL: <span className="font-medium">{s.mb.toFixed(1)} MB</span>
                                </div>

                                {s.isHeavy ? (
                                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                                    <div className="font-semibold">⚠️ Mesh pesante</div>
                                    <div className="mt-1">
                                      Consiglio: aumenta “Decimazione” almeno a{" "}
                                      <span className="font-semibold">x{s.suggestedDecimate}</span>.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-green-900">
                                    ✅ Dimensione ok: dovrebbe essere fluido in slicer e in Blender.
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-gray-500">Carica un file per vedere le metriche.</div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
