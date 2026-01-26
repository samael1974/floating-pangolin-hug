import * as THREE from "three";

export type HeightmapState = { normF32: Float32Array; w: number; h: number };

type Args = {
  geom: THREE.BufferGeometry;
  hm: HeightmapState;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  threshold: number;
};

export function applyCutoutToFlatGeometry(args: Args): THREE.BufferGeometry {
  // placeholder: ritorna la geometria originale
  return args.geom;
}