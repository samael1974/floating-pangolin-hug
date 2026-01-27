import * as THREE from "three";
import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type DownloadArgs = {
  hm: HeightmapState;          // ✅ UNICA sorgente: hm
  widthMm: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode;
  baseStyle: BaseStyle;
  fileName?: string;
};

/** STL binary writer (little-endian) */
function countOpenEdges(geom: THREE.BufferGeometry) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("countOpenEdges: missing position");

  // quantizzazione per evitare problemi floating (0.001 mm)
  const q = (v: number) => Math.round(v * 1000);

  const keyOf = (i: number) => {
    const x = q(pos.getX(i));
    const y = q(pos.getY(i));
    const z = q(pos.getZ(i));
    return `${x},${y},${z}`;
  };

  const edgeCount = new Map<string, number>();

  const addEdge = (ia: number, ib: number) => {
    const a = keyOf(ia);
    const b = keyOf(ib);
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  };

  const triCount = Math.floor(pos.count / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    addEdge(i0, i1);
    addEdge(i1, i2);
    addEdge(i2, i0);
  }

  let openEdges = 0;
  for (const c of edgeCount.values()) if (c === 1) openEdges++;

  return { openEdges, totalEdges: edgeCount.size, triCount };
}


function downloadArrayBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: "application/vnd.ms-pki.stl" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.toLowerCase().endsWith(".stl") ? fileName : `${fileName}.stl`;
throw new Error(`STL: non-finite vertex at index ${i}`);

  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export function downloadReliefStlBinary(args: DownloadArgs) {
  const { hm, widthMm, depthMm, baseMm, outputMode, baseStyle } = args;
  if (!hm) throw new Error("STL: missing heightmap (hm)");
  if (!(hm.normF32 instanceof Float32Array)) throw new Error("STL: hm.normF32 missing/invalid");

  const geom = buildSolidFromHeightmap({
    normF32: hm.normF32,
    w: hm.w,
    h: hm.h,
    widthMm,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
  });

  // sanity vertices finite
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
