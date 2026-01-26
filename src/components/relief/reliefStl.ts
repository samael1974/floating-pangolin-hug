// src/lib/relief/cutout.ts
import * as THREE from "three";

/**
 * MVP SAFE:
 * Per ora NON facciamo booleane (CSG) perché la dipendenza "three-bvh-csg"
 * non è installata / non è disponibile in questo progetto.
 *
 * Questa funzione lascia invariata la geometria, così la build torna verde.
 * Quando vorrai il vero passpartout/cutout, lo implementiamo senza rompere la pipeline.
 */
export function applyCutoutToFlatGeometry(
  geom: THREE.BufferGeometry,
  _args?: unknown
): THREE.BufferGeometry {
  return geom;
}
