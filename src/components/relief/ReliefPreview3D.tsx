// src/components/relief/ReliefPreview3D.tsx
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { BaseStyle } from "@/lib/relief/reliefTypes";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type Props = {
  hmState: HeightmapState | null;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  baseStyle: BaseStyle;
  invert?: boolean; // 👈 per “Inverti depth map”, se vuoi passarlo dal Wizard
};

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

export default function ReliefPreview3D({
  hmState,
  stlWidthMm,
  decimateStep,
  depthMm,
  baseMm,
  baseStyle,
  invert = false,
}: Props): JSX.Element {
  const showHelpers = true;

  // 1) Geometria solida (coerente con STL) + bbox
  const { solidGeo, bbox, liftY, targetY } = useMemo(() => {
    if (!hmState) return { solidGeo: null as THREE.BufferGeometry | null, bbox: null as THREE.Box3 | null, liftY: 0, targetY: 0 };

    const hm = decimateHm(hmState, decimateStep);

    const out = buildSolidFromHeightmap({
      height01: hm.normF32,
      width: hm.w,
      height: hm.h,
      outWidthMm: Math.max(1, stlWidthMm),
      depthMm: Math.max(0, depthMm),
      baseMm: Math.max(0, baseMm),
      baseStyle,
      invert,
      clampHeights: true,
      minBaseMm: 0.4,
    });

    const g = out.geometry;
    g.computeBoundingBox();
    const bb = g.boundingBox ? g.boundingBox.clone() : new THREE.Box3().setFromBufferAttribute(g.getAttribute("position") as any);

    // ✅ La griglia è a Y=0 (dopo rotazione il “verticale” = Z originale)
    // Quindi alzo di -minZ per appoggiare la base sul piano.
    const minZ = bb.min.z;
    const lift = -minZ;

    // Target OrbitControls al centro del modello (in altezza)
    const centerZ = (bb.min.z + bb.max.z) * 0.5;
    const target = centerZ + lift;

    return { solidGeo: g, bbox: bb, liftY: lift, targetY: target };
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle, invert]);

  // 2) Camera “ragionevole” (poi l’utente può orbitare)
  const camDist = Math.max(140, stlWidthMm * 1.35);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, camDist * 0.85, camDist], fov: 45, near: 0.1, far: 10000 }}
        gl={{ antialias: true }}
      >
        {/* sfondo leggermente “grigio” per staccare il modello */}
        <color attach="background" args={["#f8fafc"]} />

        {/* Luci migliori + ambiente */}
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[300, 450, 250]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-250, 200, -200]} intensity={0.45} />

        {/* HDRI per far “leggere” le superfici */}
        <Environment preset="studio" />

        {showHelpers && (
          <>
            <Grid
              infiniteGrid
              fadeDistance={700}
              fadeStrength={3}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(80, stlWidthMm)]} />
          </>
        )}

        {/* Ombra di contatto sul piano per far capire l’appoggio */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.35}
          blur={2.2}
          far={Math.max(200, stlWidthMm * 4)}
          scale={Math.max(6, stlWidthMm / 10)}
        />

        {/* 3) Modello: ruoto sul piano e lo ALZO (liftY) */}
        {solidGeo && (
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, liftY, 0]}>
            <mesh geometry={solidGeo} castShadow receiveShadow>
              <meshStandardMaterial roughness={0.55} metalness={0.08} />
            </mesh>
          </group>
        )}

        <OrbitControls makeDefault target={[0, targetY, 0]} />
      </Canvas>
    </div>
  );
}
