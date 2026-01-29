// src/components/relief/ReliefPreview3D.tsx
import * as React from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  ContactShadows,
  Environment,
} from "@react-three/drei";
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
  baseStyle: BaseStyle; // "flat" | "recessed" | "offset"
  outputMode?: any; // compat
};

// ========= TUNING / VARIABILI (modifica qui) =========
// 1) FIX specchiatura (preview + STL): ruota 180° su Y (non scala negativa)
const FIX_MIRROR = true;

// 2) Metti “in piedi” il rilievo: ruota 90° su X (asse rosso)
const STAND_UP = true;

// 3) Se dopo i due sopra risulta “girato” rispetto alla tua immagine, prova 0 o Math.PI
const EXTRA_Z_ROT = Math.PI;

// 4) Look & luci
const BG = "#ECECEC";
const SHOW_HELPERS = true;
// =====================================================

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
  const geometry = React.useMemo<THREE.BufferGeometry | null>(() => {
    if (!hmState) return null;

    const hm = decimateHeights(hmState, decimateStep);

    // 1) Geometria SOLIDA (identica export STL)
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

    // 2) Trasformazioni “baked” nella geometry (così bounding box/ground sono coerenti)
    //    - appoggia base a Z=0 (stato STL “normale”)
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const minZ = geometry.boundingBox.min.z;
      if (Number.isFinite(minZ) && Math.abs(minZ) > 1e-6) {
        geometry.translate(0, 0, -minZ);
      }
    }

    //    - metti “in piedi” (Z -> Y)
    if (STAND_UP) geometry.rotateX(-Math.PI / 2);

    //    - fix specchiatura (rotazione, no scale negativa)
    if (FIX_MIRROR) geometry.rotateY(Math.PI);

    //    - eventuale rotazione extra attorno a Z per riallineare verso immagine
    if (EXTRA_Z_ROT) geometry.rotateZ(EXTRA_Z_ROT);

    // 3) Ora che è in posa finale: appoggia a terra su Y=0 (perché dopo rotateX, l’UP è Y)
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const bb = geometry.boundingBox;

      // centra X/Z
      const center = new THREE.Vector3();
      bb.getCenter(center);
      geometry.translate(-center.x, 0, -center.z);

      // appoggia a “terra” (Y=0)
      geometry.translate(0, -bb.min.y, 0);
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle]);

  React.useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  // camera target e dist (semplice e stabile)
  const camDist = React.useMemo(() => Math.max(220, stlWidthMm * 1.65), [stlWidthMm]);

  if (!hmState) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        Carica un file per vedere il 3D.
      </div>
    );
  }

  if (!geometry) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        La preview 3D appare dopo la generazione della heightmap.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", background: BG }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [camDist * 0.8, camDist * 0.55, camDist * 0.9], fov: 40, near: 0.1, far: 20000 }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          // @ts-ignore
          gl.physicallyCorrectLights = true;
        }}
      >
        {/* Environment = micro-contrasto (fa “leggere” la superficie) */}
        <Environment preset="studio" />

        {/* Luci “fisiche”: key + fill + rim + ambient controllato */}
        <ambientLight intensity={0.16} />

        {/* KEY (ombra principale) */}
        <directionalLight
          position={[520, 820, 420]}
          intensity={1.55}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={5}
          shadow-camera-far={5000}
          shadow-bias={-0.0002}
        />

        {/* FILL (schiarisce senza appiattire) */}
        <directionalLight position={[-380, 260, 120]} intensity={0.55} />

        {/* RIM (stacca il profilo) */}
        <directionalLight position={[0, 260, -520]} intensity={0.35} />

        {SHOW_HELPERS && (
          <>
            <Grid
              position={[0, -0.06, 0]}
              infiniteGrid
              fadeDistance={1100}
              fadeStrength={3}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(80, stlWidthMm * 0.8)]} />
          </>
        )}

        {/* Oggetto */}
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshPhysicalMaterial
            color="#A3B18A"
            roughness={0.38}
            metalness={0.04}
            clearcoat={0.22}
            clearcoatRoughness={0.6}
            envMapIntensity={1.35}
            reflectivity={0.2}
          />
        </mesh>

        {/* Ombra “di contatto” (è quella che rende “fisico”) */}
        <ContactShadows
          position={[0, -0.02, 0]}
          scale={Math.max(240, stlWidthMm * 2.2)}
          opacity={0.4}
          blur={2.8}
          far={Math.max(320, stlWidthMm * 2.4)}
        />

        {/* Controlli: target a metà altezza visiva (qui: un po’ sopra la base) */}
        <OrbitControls
          makeDefault
          target={[0, Math.max(18, stlWidthMm * 0.08), 0]}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={120}
          maxDistance={6000}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.02}
        />
      </Canvas>
    </div>
  );
}
