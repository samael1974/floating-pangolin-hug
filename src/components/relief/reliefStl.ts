import * as THREE from "three";
import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import { buildFrameRectPhi } from "@/lib/relief/frame/buildFrameRectPhi";
import { buildPassepartoutRectPhi } from "@/lib/relief/frame/buildPassepartoutRectPhi";
import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type DownloadArgs = {
  hm: HeightmapState; // ✅ UNICA sorgente: hm
  widthMm: number;
  depthMm: number;
  baseMm: number;
  outputMode: OutputMode; // (per ora non usato dal builder: tenuto per compatibilità UI)
  baseStyle: BaseStyle; // ✅ coincide con il builder
  fileName?: string;
};

export type MatExportParams = {
  enabled: boolean;
  steps: 1 | 2 | 3 | 4 | 5 | 6;
  totalBandsMm: number;
  minBandMm: number;
  thicknessMm: number;
  stepDropMm: number;
  matDropMm: number;
  reliefGapMm: number;
};

export type FrameExportParams = {
  enabled: boolean;
  solidMm: number;
  frameHeightMm: number;
  glassMm: 2 | 3;
  glassClearanceMm: number;
  pocketDepthMm: number;
  lipMm: number;
};

type AssemblyArgs = DownloadArgs & {
  mat?: MatExportParams;
  frame?: FrameExportParams;
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

    if (
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      !Number.isFinite(n.z) ||
      n.lengthSq() < 1e-30
    ) {
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

function toBufferGeometry(vertices: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function normalizeGeometryToZBase(geom: THREE.BufferGeometry) {
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  geom.translate(-center.x, -center.y, -bb.min.z);
  geom.computeBoundingBox();
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const geom of geometries) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ✅ conteggio bordi aperti (debug mesh)
function countOpenEdges(geom: THREE.BufferGeometry) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("countOpenEdges: missing position");

  // 0.001 mm quantization
  const q = (v: number) => Math.round(v * 1000);
  const keyOf = (i: number) => `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;

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

  const open: Array<{ a: string; b: string; mid: string; len: number }> = [];

  const parse = (k: string) => {
    const [x, y, z] = k.split(",").map((s) => Number(s) / 1000);
    return { x, y, z };
  };

  let openEdges = 0;
  for (const [k, c] of edgeCount.entries()) {
    if (c !== 1) continue;
    openEdges++;

    const [ka, kb] = k.split("|");
    const A = parse(ka);
    const B = parse(kb);

    const mx = (A.x + B.x) * 0.5;
    const my = (A.y + B.y) * 0.5;
    const mz = (A.z + B.z) * 0.5;

    const dx = A.x - B.x;
    const dy = A.y - B.y;
    const dz = A.z - B.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (open.length < 32) {
      open.push({
        a: `${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`,
        b: `${B.x.toFixed(3)},${B.y.toFixed(3)},${B.z.toFixed(3)}`,
        mid: `${mx.toFixed(3)},${my.toFixed(3)},${mz.toFixed(3)}`,
        len: Number(len.toFixed(3)),
      });
    }
  }

  return { triCount, totalEdges: edgeCount.size, openEdges, openSample: open };
}

function buildReliefGeometry(args: DownloadArgs) {
  const { hm, widthMm, depthMm, baseMm, baseStyle } = args;
  const out = buildSolidFromHeightmap({
    height01: hm.normF32,
    width: hm.w,
    height: hm.h,
    outWidthMm: widthMm,
    depthMm,
    baseMm,
    baseStyle,
  });
  const geom = out.geometry;
  geom.rotateZ(Math.PI);
  normalizeGeometryToZBase(geom);
  geom.computeVertexNormals();
  return geom;
}

function buildMatGeometry(args: AssemblyArgs, reliefPlan: { w: number; h: number }) {
  if (!args.mat?.enabled) return null;
  const out = buildPassepartoutRectPhi({
    innerWmm: reliefPlan.w,
    innerHmm: reliefPlan.h,
    steps: args.mat.steps,
    totalBandsMm: args.mat.totalBandsMm,
    thicknessMm: args.mat.thicknessMm,
    stepDropMm: args.mat.stepDropMm,
    minBandMm: args.mat.minBandMm,
  });
  const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
  const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
  if (!vertices || !indices) return null;
  const geom = toBufferGeometry(vertices, indices);
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (bb) {
    geom.translate(0, 0, -bb.max.z);
    geom.computeBoundingBox();
  }
  const matTopZ = -args.mat.matDropMm - args.mat.reliefGapMm;
  geom.translate(0, 0, matTopZ);
  geom.computeVertexNormals();
  return geom;
}

function buildFrameGeometry(args: AssemblyArgs, reliefPlan: { w: number; h: number }, matBands: number) {
  if (!args.frame?.enabled) return null;
  const innerW = reliefPlan.w + 2 * matBands;
  const innerH = reliefPlan.h + 2 * matBands;
  const out = buildFrameRectPhi({
    innerWmm: innerW,
    innerHmm: innerH,
    thicknessMm: args.frame.solidMm,
    heightMm: args.frame.frameHeightMm,
    glassMm: args.frame.glassMm,
    glassClearanceMm: args.frame.glassClearanceMm,
    glueLipMm: args.frame.lipMm,
    pocketDepthMm: args.frame.pocketDepthMm,
  });
  const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
  const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
  if (!vertices || !indices) return null;
  const geom = toBufferGeometry(vertices, indices);
  geom.rotateX(-Math.PI / 2);
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (bb) {
    geom.translate(0, 0, -bb.min.z);
    geom.computeBoundingBox();
  }
  geom.computeVertexNormals();
  return geom;
}

function buildReliefAssemblyGeometries(args: AssemblyArgs) {
  const relief = buildReliefGeometry(args);
  const reliefW = Math.max(1, args.widthMm);
  const reliefH = reliefW * (args.hm.h / args.hm.w);
  const reliefPlan = { w: reliefW, h: reliefH };

  const matBands = args.mat?.enabled
    ? Math.max(args.mat.totalBandsMm, args.mat.minBandMm * args.mat.steps)
    : 0;

  const mat = buildMatGeometry(args, reliefPlan);
  const frame = buildFrameGeometry(args, reliefPlan, matBands);

  return { relief, mat, frame };
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
  const {
    hm,
    widthMm,
    depthMm,
    baseMm,
    outputMode: _outputMode, // tenuto per compatibilità; non usato ora
    baseStyle,
    fileName,
  } = args;

  if (!hm) throw new Error("STL: missing heightmap (hm)");
  if (!(hm.normF32 instanceof Float32Array)) throw new Error("STL: hm.normF32 missing/invalid");

  const geom = buildReliefGeometry({
    hm,
    widthMm,
    depthMm,
    baseMm,
    outputMode: _outputMode,
    baseStyle,
  });

  // sanity vertices finite
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: missing position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`STL: non-finite vertex at index ${i}`);
    }
  }

  // ✅ debug: open edges
  const check = countOpenEdges(geom);
  console.log("[MESH CHECK]", check);
  if (check.openEdges > 0) console.table(check.openSample);
  if (check.openEdges > 0) {
    throw new Error(`Mesh non chiusa: openEdges=${check.openEdges}`);
  }

  const bin = geometryToBinaryStl(geom);
  downloadArrayBuffer(bin, fileName ?? "reliefforge");
}

export function downloadMatStlBinary(args: AssemblyArgs) {
  const { mat } = args;
  if (!mat?.enabled) throw new Error("STL: mat disabled");
  const { mat: matGeom } = buildReliefAssemblyGeometries(args);
  if (!matGeom) throw new Error("STL: mat geometry missing");
  const check = countOpenEdges(matGeom);
  if (check.openEdges > 0) {
    throw new Error(`Passepartout non chiuso: openEdges=${check.openEdges}`);
  }
  const bin = geometryToBinaryStl(matGeom);
  downloadArrayBuffer(bin, args.fileName ?? "reliefforge-passepartout");
}

export function downloadFrameStlBinary(args: AssemblyArgs) {
  const { frame } = args;
  if (!frame?.enabled) throw new Error("STL: frame disabled");
  const { frame: frameGeom } = buildReliefAssemblyGeometries(args);
  if (!frameGeom) throw new Error("STL: frame geometry missing");
  const check = countOpenEdges(frameGeom);
  if (check.openEdges > 0) {
    throw new Error(`Cornice non chiusa: openEdges=${check.openEdges}`);
  }
  const bin = geometryToBinaryStl(frameGeom);
  downloadArrayBuffer(bin, args.fileName ?? "reliefforge-cornice");
}

export function downloadAssemblyStlBinary(args: AssemblyArgs) {
  const { relief, mat, frame } = buildReliefAssemblyGeometries(args);
  const geometries = [relief];
  if (mat) geometries.push(mat);
  if (frame) geometries.push(frame);
  const merged = mergeGeometries(geometries);
  const check = countOpenEdges(merged);
  if (check.openEdges > 0) {
    throw new Error(`Assemblaggio non chiuso: openEdges=${check.openEdges}`);
  }
  const bin = geometryToBinaryStl(merged);
  downloadArrayBuffer(bin, args.fileName ?? "reliefforge-assemblaggio");
}
