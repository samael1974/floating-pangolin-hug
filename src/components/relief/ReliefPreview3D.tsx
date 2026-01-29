// src/components/relief/ReliefPreview3D.tsx
import React, { useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Grid } from "@react-three/drei";
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
  outputMode?: any; // legacy, non usato
};

// --- VARIABILI “FACILI” (qui, in alto) ---
const SHOW_HELPERS = true;

/**
 * Se il modello risulta “specchiato” rispetto all’immagine,
 * questa rotazione di 180° attorno a Y è la più corretta per una vista “frontale”
 * (non altera l’asse UP).
 *
 * Nota: questa è SOLO preview. Per rendere coerente anche lo STL,
 * va applicato lo stesso flip nella generazione/export.
 */
const PREVIEW_MIRROR_Y_180 = false;

// migliora la leggibilità senza “sparare” tutto bianco
const BG_COLOR = "#ECECEC";

function decimateHeights(hm: HeightmapState, stepIn: number): HeightmapState {
  const step = Math.max(1, Math.floor(stepIn || 1));
  if (step === 1) return hm;

  const w2 = Math.max(2, Math.floor(hm.w / step));
  const h2 = Math.max(2, Math.floor(hm.h / step));
  const out = new Float32Array(w2 * h2);

  for (let y = 0; y < h2; y++) {
    const sy = Math.min(hm.h - 1, y * step);
    for (let x = 0; x < w2; x++) {
      const sx = Math.min(hm.w - 1, x * step);
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
}: Props): JSX.Element {
  const solidGeometry = useMemo(() => {
    if (!hmState) return null;

    const hm = decimateHeights(hmState, decimateStep);

    const { geometry } = buildSolidFromHeightmap({
      height01: hm.normF32,
      width: hm.w,
      height: hm.h,
      outWidthMm: Math.max(1, stlWidthMm),
      depthMm: Math.max(0, depthMm),
      baseMm: Math.max(0, baseMm),
      baseStyle,
      invert: false,
      clampHeights: true,
      minBaseMm: 0.4,
    });

    // 1) calcola bounding box
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const center = new THREE.Vector3();
      bb.getCenter(center);

      // 2) centra X e Z, e appoggia a terra su Y (Y-up in three.js)
      //    -center.x => X centrato
      //    -bb.min.y => base sul "pavimento"
      //    -center.z => Z centrato
      geometry.translate(-center.x, -bb.min.y, -center.z);
    }

    // shading migliore
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle]);

  // dispose pulito
  useEffect(() => {
    return () => {
      solidGeometry?.dispose();
    };
  }, [solidGeometry]);

  if (!hmState) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        Carica un file per vedere il 3D.
      </div>
    );
  }

  if (!solidGeometry) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        La preview 3D appare dopo la generazione della heightmap.
      </div>
    );
  }

  // camera “da oggetto fisico”
  const width = Math.max(1, stlWidthMm);
  const camDist = Math.max(220, width * 1.6);

  return (
    <div style={{ width: "100%", height: "100%", background: BG_COLOR }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, camDist * 0.55, camDist], fov: 38, near: 0.1, far: 20000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;

          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={[BG_COLOR]} />

        {/* Environment: fa “leggere” i volumi (micro-contrasto) */}
        <Environment preset="studio" />

        {/* Luci: key + fill + ambient */}
        <ambientLight intensity={0.22} />

        <directionalLight
          position={[420, 680, 380]}
          intensity={1.55}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={4000}
          shadow-bias={-0.00015}
        />

        <directionalLight position={[-380, 260, -260]} intensity={0.65} />

        {/* Helpers */}
        {SHOW_HELPERS && (
          <>
            <Grid
              position={[0, -0.02, 0]}
              infiniteGrid
              fadeDistance={1400}
              fadeStrength={2.5}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(60, stlWidthMm * 0.7)]} />
          </>
        )}

        {/* Oggetto */}
        <mesh
          geometry={solidGeometry}
          rotation={PREVIEW_MIRROR_Y_180 ? [0, Math.PI, 0] : [0, 0, 0]}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color={"#1F4E5F}
            roughness={0.32}
            metalness={0.03}
            clearcoat={0.28}
            clearcoatRoughness={0.62}
            envMapIntensity={1.25}
          />
        </mesh>

        {/* Contact shadow per “appoggio fisico” */}
        <ContactShadows
          position={[0, -0.01, 0]}
          scale={Math.max(260, stlWidthMm * 2.2)}
          opacity={0.38}
          blur={2.9}
          far={Math.max(260, stlWidthMm * 2.2)}
        />

        <OrbitControls
          makeDefault
          target={[0, Math.max(8, baseMm * 0.25), 0]}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.03}
        />
      </Canvas>
    </div>
  );
}
