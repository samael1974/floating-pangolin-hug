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
function geometryToBinaryStl(geom: THREE.BufferGeometry): ArrayBuffer {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: geometry has no position attribute");

  const triCount = Math.floor(pos.count / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

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

    view.setFloat32(o + 0, n.x, true);
    view.setFloat32(o + 4, n.y, true);
    view.setFloat32(o + 8, n.z, true);

    view.setFloat32(o + 12, a.x, true);
    view.setFloat32(o + 16, a.y, true);
    view.setFloat32(o + 20, a.z, true);

    view.setFloat32(o + 24, b.x, true);
    view.setFloat32(o + 28, b.y, true);
    view.setFloat32(o + 32, b.z, true);

    view.setFloat32(o + 36, c.x, true);
    view.setFloat32(o + 40, c.y, true);
    view.setFloat32(o + 44, c.z, true);

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
