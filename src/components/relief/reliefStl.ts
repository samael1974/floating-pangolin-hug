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

type DownloadArgs = {
  hmState?: HeightmapState;
  hm?: HeightmapState; // ✅ compatibilità con ReliefWizard
  widthMm: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode;
  baseStyle: BaseStyle;
  fileName?: string;
};

/** STL binary writer (little-endian) */
function geometryToBinaryStl(geom: THREE.BufferGeometry): ArrayBuffer {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: geometry has no position attribute");

  const triCount = Math.floor(pos.count / 3);

  // 80 header + 4 triCount + 50 bytes per triangolo
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  // header 80 bytes (vuoto)
  for (let i = 0; i < 80; i++) view.setUint8(i, 0);

  view.setUint32(80, triCount, true);

  let o = 84;

  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    ax.fromBufferAttribute(pos, i0);
    bx.fromBufferAttribute(pos, i1);
    cx.fromBufferAttribute(pos, i2);

    // normal = normalize((b-a) x (c-a))
    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    n.crossVectors(ab, ac);

    // evita NaN/Infinity
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
    view.setFloat32(o + 12, ax.x, true);
    view.setFloat32(o + 16, ax.y, true);
    view.setFloat32(o + 20, ax.z, true);

    // v2
    view.setFloat32(o + 24, bx.x, true);
    view.setFloat32(o + 28, bx.y, true);
    view.setFloat32(o + 32, bx.z, true);

    // v3
    view.setFloat32(o + 36, cx.x, true);
    view.setFloat32(o + 40, cx.y, true);
    view.setFloat32(o + 44, cx.z, true);

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
 * ✅ EXPORT che ti manca: ReliefWizard lo importa come named export.
 * Supporta sia firma a oggetto (consigliata) sia firma "vecchia" a parametri.
 */
export async function downloadReliefStlBinary(
  arg1: DownloadArgs | HeightmapState,
  widthMm?: number,
  depthMm?: number,
  baseMm?: number,
  outputMode?: OutputMode,
  baseStyle?: BaseStyle,
  fileName?: string
) {
  // normalize args
  let args: DownloadArgs;
  if ((arg1 as any)?.normF32 && typeof (arg1 as any)?.w === "number" && typeof (arg1 as any)?.h === "number" && typeof widthMm === "number") {
    args = {
      hmState: arg1 as HeightmapState,
      widthMm: widthMm!,
      depthMm: depthMm ?? 3,
      baseMm: baseMm ?? 2,
      outputMode: outputMode ?? "relief",
      baseStyle: baseStyle ?? "flat",
      fileName: fileName ?? "reliefforge",
    };
  } else {
    args = arg1 as DownloadArgs;
  }

  const { hmState, widthMm: W, depthMm: D, baseMm: B, outputMode: OM, baseStyle: BS } = args;

  // build geometry
  let geom = buildSolidFromHeightmap({
    normF32: hmState.normF32,
    w: hmState.w,
    h: hmState.h,
    widthMm: W,
    depthMm: D,
    baseMm: B,
    outputMode: OM,
    baseStyle: BS,
  });

  // (cutout MVP safe = no-op per ora)
  geom = applyCutoutToFlatGeometry(geom);

  // sanity check positions
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: missing position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`STL: non-finite vertex at index ${i}`);
    }
  }

  const bin = geometryToBinaryStl(geom);
  downloadArrayBuffer(bin, args.fileName ?? "reliefforge");
}
