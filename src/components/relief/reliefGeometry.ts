// src/components/relief/reliefGeometry.ts
import * as THREE from "three";

type BuildGeometryOptions = {
  widthMm: number;
  depthMm: number;
  baseMm: number;
  invert?: boolean;
  decimateStep?: number; // più alto = più leggero
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Crea una BufferGeometry (mesh) da heightmap normalizzata 0..1.
 * Geometria: top surface + sides + bottom (piano) per render stabile.
 */
export function buildReliefGeometry(
  normF32: Float32Array,
  w: number,
  h: number,
  opts: BuildGeometryOptions
): THREE.BufferGeometry {
  const step = Math.max(1, Math.floor(opts.decimateStep ?? 2));
  const widthMm = opts.widthMm;
  const heightMm = widthMm * (h / w);

  const dxCount = Math.floor((w - 1) / step) + 1;
  const dyCount = Math.floor((h - 1) / step) + 1;

  const dx = widthMm / (dxCount - 1);
  const dy = heightMm / (dyCount - 1);

  const zBase = 0;
  const depthMm = opts.depthMm;
  const baseMm = opts.baseMm;
  const invert = !!opts.invert;

  const positions: number[] = [];
  const indices: number[] = [];

  function sampleTop(ix: number, iy: number) {
    const x = clamp(ix * step, 0, w - 1);
    const y = clamp(iy * step, 0, h - 1);
    const v = normF32[y * w + x];
    const t = invert ? 1 - v : v;
    return zBase + baseMm + t * depthMm;
  }

  // griglia vertici top
  const vertIndex = (x: number, y: number) => y * dxCount + x;

  for (let y = 0; y < dyCount; y++) {
    for (let x = 0; x < dxCount; x++) {
      const px = x * dx;
      const py = y * dy;
      const pz = sampleTop(x, y);
      positions.push(px, py, pz);
    }
  }

  // triangoli top
  for (let y = 0; y < dyCount - 1; y++) {
    for (let x = 0; x < dxCount - 1; x++) {
      const a = vertIndex(x, y);
      const b = vertIndex(x + 1, y);
      const c = vertIndex(x, y + 1);
      const d = vertIndex(x + 1, y + 1);
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  // aggiungiamo bottom piano (4 vertici) + sides per chiusura visiva
  const baseStart = positions.length / 3;
  positions.push(0, 0, zBase);
  positions.push(widthMm, 0, zBase);
  positions.push(widthMm, heightMm, zBase);
  positions.push(0, heightMm, zBase);

  // bottom (orientato verso il basso)
  indices.push(baseStart + 0, baseStart + 2, baseStart + 1);
  indices.push(baseStart + 0, baseStart + 3, baseStart + 2);

  // sides: collega bordi top al piano base
  // LEFT
  for (let y = 0; y < dyCount - 1; y++) {
    const t0 = vertIndex(0, y);
    const t1 = vertIndex(0, y + 1);
    const b0 = baseStart + 0;
    const b1 = baseStart + 3;

    // per evitare triangoli enormi, usiamo due triangoli tra (top edge) e (base edge)
    // base edge è una linea: (0,0)-(0,height)
    // mappiamo y0/y1 su base usando 2 vertici già esistenti (b0,b1): ok per preview
    indices.push(b0, t1, t0);
    indices.push(b0, b1, t1);
  }

  // RIGHT
  for (let y = 0; y < dyCount - 1; y++) {
    const t0 = vertIndex(dxCount - 1, y);
    const t1 = vertIndex(dxCount - 1, y + 1);
    const b0 = baseStart + 1;
    const b1 = baseStart + 2;
    indices.push(b0, t0, t1);
    indices.push(b0, t1, b1);
  }

  // FRONT (y=0)
  for (let x = 0; x < dxCount - 1; x++) {
    const t0 = vertIndex(x, 0);
    const t1 = vertIndex(x + 1, 0);
    const b0 = baseStart + 0;
    const b1 = baseStart + 1;
    indices.push(b0, t0, t1);
    indices.push(b0, t1, b1);
  }

  // BACK (y=height)
  for (let x = 0; x < dxCount - 1; x++) {
    const t0 = vertIndex(x, dyCount - 1);
    const t1 = vertIndex(x + 1, dyCount - 1);
    const b0 = baseStart + 3;
    const b1 = baseStart + 2;
    indices.push(b0, t1, t0);
    indices.push(b0, b1, t1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}
