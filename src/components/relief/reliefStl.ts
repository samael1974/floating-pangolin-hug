// src/components/relief/reliefStl.ts
import * as THREE from "three";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";
import { applyCutoutToFlatGeometry } from "@/lib/relief/cutout";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

export type DownloadArgs = {
  // ✅ entrambe supportate
  hm?: HeightmapState;
  hmState?: HeightmapState;

  widthMm: number;
  depthMm: number;
  baseMm: number;

  outputMode?: OutputMode; // default: "relief"
  baseStyle?: BaseStyle;   // default: "flat"

  fileName?: string;

  // (opzionale) pronto per futuro cutout vero
  cutout?: unknown;
};

function isHeightmapState(v: any): v is HeightmapState {
  return (
    !!v &&
    v.normF32 instanceof Float32Array &&
    typeof v.w === "number" &&
    typeof v.h === "number"
  );
}

function assertFinite(n: number, label: string) {
  if (!Number.isFinite(n)) throw new Error(`${label} non finito`);
}

function sanitizeFileName(name: string) {
  const safe = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return safe.length ? safe : "reliefforge";
}

/** STL binary writer (little-endian) */
function geometryToBinaryStl(geom: THREE.BufferGeometry): ArrayBuffer {
  // assicurati non-indexed
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: geometry has no position attribute");

  const triCount = Math.floor(pos.count / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  // header 80 bytes (zero)
  for (let i = 0; i < 80; i++) view.setUint8(i, 0);
  view.setUint32(80, triCount, true);

  let o = 84;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);

    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z) || n.lengthSq() < 1e-30) {
      n.set(0, 0, 0);
    } else {
      n.normalize();
    }

    // normal
    view.setFloat32(o + 0, n.x, true);
    view.setFloat32(o + 4, n.y, true);
    view.setFloat32(o + 8, n.z, true);

    // v1
    view.setFloat32(o + 12, a.x, true);
    view.setFloat32(o + 16, a.y, true);
    view.setFloat32(o + 20, a.z, true);

    // v2
    view.setFloat32(o + 24, b.x, true);
    view.setFloat32(o + 28, b.y, true);
    view.setFloat32(o + 32, b.z, true);

    // v3
    view.setFloat32(o + 36, c.x, true);
    view.setFloat32(o + 40, c.y, true);
    view.setFloat32(o + 44, c.z, true);

    // attribute byte count
    view.setUint16(o + 48, 0, true);

    o += 50;
  }

  return buffer;
}

function downloadArrayBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: "application/vnd.ms-pki.stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.toLowerCase().endsWith(".stl") ? fileName : `${fileName}.stl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * ✅ Named export (ReliefWizard lo importa così)
 *
 * Supporta:
 * 1) forma consigliata: downloadReliefStlBinary({ hm, widthMm, ... })
 * 2) forma legacy:      downloadReliefStlBinary(hmState, widthMm, depthMm, ...)
 */
export function downloadReliefStlBinary(arg1: DownloadArgs): void;
export function downloadReliefStlBinary(
  hm: HeightmapState,
  widthMm: number,
  depthMm?: number,
  baseMm?: number,
  outputMode?: OutputMode,
  baseStyle?: BaseStyle,
  fileName?: string
): void;
export function downloadReliefStlBinary(
  arg1: DownloadArgs | HeightmapState,
  widthMm?: number,
  depthMm?: number,
  baseMm?: number,
  outputMode?: OutputMode,
  baseStyle?: BaseStyle,
  fileName?: string
) {
  // ---- normalize input ----
  let args: DownloadArgs;

  // legacy signature: (hm, widthMm, ...)
  if (isHeightmapState(arg1) && typeof widthMm === "number") {
    args = {
      hm: arg1,
      widthMm,
      depthMm: depthMm ?? 3,
      baseMm: baseMm ?? 2,
      outputMode: outputMode ?? "relief",
      baseStyle: baseStyle ?? "flat",
      fileName: fileName ?? "reliefforge",
    };
  } else {
    args = arg1 as DownloadArgs;
  }

  const hm = args.hm ?? args.hmState;

  // ---- GUARDS (niente più "normF32 of undefined") ----
  if (!hm) {
    console.error("downloadReliefStlBinary: hm/hmState mancante", args);
    throw new Error("Heightmap non passata (hm/hmState mancante).");
  }
  if (!isHeightmapState(hm)) {
    console.error("downloadReliefStlBinary: heightmap invalida", hm);
    throw new Error("Heightmap invalida (manca normF32/w/h).");
  }

  assertFinite(args.widthMm, "widthMm");
  assertFinite(args.depthMm, "depthMm");
  assertFinite(args.baseMm, "baseMm");

  const W = args.widthMm;
  const D = args.depthMm;
  const B = args.baseMm;
  const OM: OutputMode = args.outputMode ?? "relief";
  const BS: BaseStyle = args.baseStyle ?? "flat";
  const outName = sanitizeFileName(args.fileName ?? "reliefforge");

  // ---- build geometry ----
  let geom = buildSolidFromHeightmap({
    normF32: hm.normF32,
    w: hm.w,
    h: hm.h,
    widthMm: W,
    depthMm: D,
    baseMm: B,
    outputMode: OM,
    baseStyle: BS,
  });

  // ---- cutout MVP safe (no-op oggi) ----
  // se domani passi args.cutout, la firma regge già
  geom = applyCutoutToFlatGeometry(geom, args.cutout);

  // ---- sanity check: vertici finiti ----
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: missing position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`STL: non-finite vertex at index ${i}`);
    }
  }

  const bin = geometryToBinaryStl(geom);
  downloadArrayBuffer(bin, outName);
}
