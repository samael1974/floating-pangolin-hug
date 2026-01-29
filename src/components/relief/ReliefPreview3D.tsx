// src/components/relief/ReliefPreview3D.tsx
import React, { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { buildSolidFromHeightmap } from "../../lib/relief/buildSolidFromHeightmap";
import type { BaseStyle } from "../../lib/relief/reliefTypes";

import { buildPassepartoutRectPhi } from "../../lib/relief/frame/buildPassepartoutRectPhi";
import { buildFrameRectPhi } from "../../lib/relief/frame/buildFrameRectPhi";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type FrameUI = {
  enabled: boolean;

  // geometry
  solidMm: number; // default 2.0 (clamp in builder)
  frameHeightMm: number; // default 18

  // glass pocket
  glassMm: 2 | 3;
  glassClearanceMm: number;
  pocketDepthMm: number; // 3.4–3.8
  lipMm: number; // >=3
  pocketRadialMm: number;
};

type MatUI = {
  enabled: boolean;

  // phi bands
  steps: 1 | 2 | 3 | 4 | 5 | 6;
  totalBandsMm: number; // total width of bands
  minBandMm: number; // clamp 5–7

  // 3D
  thicknessMm: number; // 2–3
  stepDropMm: number; // mm per step (visual terrace)
  matDropMm: number; // 2–3 (mat plane below relief top)
  reliefGapMm: number; // 0.2–0.6 (relief above mat)
};

type Props = {
  hmState: HeightmapState | null;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  baseStyle: BaseStyle;
  outputMode?: any; // legacy, non usato

  // Step 2 (optional)
  frame?: FrameUI;
  mat?: MatUI;
};

// --- VARIABILI “FACILI” (qui, in alto) ---
const SHOW_HELPERS = true;

/**
 * Se il modello risulta “specchiato” rispetto all’immagine,
 * questa rotazione di 180° attorno a Y è la più corretta per una vista “frontale”.
 *
 * Nota: questa è SOLO preview. Per rendere coerente anche lo STL,
 * va applicato lo stesso flip nella generazione/export.
 */
const PREVIEW_MIRROR_Y_180 = false;

// migliora la leggibilità senza “sparare” tutto bianco
const BG_COLOR = "#f6f7fb";

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

/**
 * Converte (vertices, indices) in BufferGeometry SENZA dipendere da toThreeGeometry
 * (che nel tuo repo ha una firma diversa).
 */
function toBufferGeometry(vertices: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export default function ReliefPreview3D({
  hmState,
  stlWidthMm,
  decimateStep,
  depthMm,
  baseMm,
  baseStyle,
  frame,
  mat,
}: Props): JSX.Element {
  /**
   * ✅ NON TOCCARE: qui c’è la tua logica di offset/centratura che “funziona bene”.
   * La lascio IDENTICA: bounding box -> centra X/Z -> appoggia base a terra su Y.
   */
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

    // 2) centra X e Z, e appoggia a terra su Y (Y-up in three.js)
    if (bb) {
      const center = new THREE.Vector3();
      bb.getCenter(center);

      // -center.x => X centrato
      // -bb.min.y => base sul "pavimento"
      // -center.z => Z centrato
      geometry.translate(-center.x, -bb.min.y, -center.z);
      geometry.computeBoundingBox();
    }

    // shading migliore
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle]);

  // height (Y) of relief after translate (min.y = 0)
  const reliefTopY = useMemo(() => {
    if (!solidGeometry) return 0;
    solidGeometry.computeBoundingBox();
    const bb = solidGeometry.boundingBox;
    if (!bb) return 0;
    return bb.max.y;
  }, [solidGeometry]);

  // derive relief plan dimensions (W x H) from stlWidthMm and hm aspect ratio
  const reliefPlan = useMemo(() => {
    if (!hmState) return { w: Math.max(1, stlWidthMm), h: Math.max(1, stlWidthMm) };
    const w = Math.max(1, stlWidthMm);
    const h = w * (hmState.h / hmState.w);
    return { w, h };
  }, [hmState, stlWidthMm]);

    // Passepartout DISATTIVATO TEMPORANEAMENTE (step successivo)
  const matGeometry = useMemo(() => {
    return null;
  }, []);

    // Supporta output come:
    // 1) { vertices, indices }
    // 2) [vertices, indices]
    const vertices =
      (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
    const indices =
      (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);

    if (!vertices || !indices) {
      console.error("buildPassepartoutRectPhi: output non valido", out);
      return null;
    }

    return toBufferGeometry(vertices, indices);
  }, [hmState, mat, reliefPlan.w, reliefPlan.h]);

  // Frame geometry (builder base at y=0 -> resta sul piano)
  const frameGeometry = useMemo(() => {
    if (!hmState) return null;
    if (!frame?.enabled) return null;

    // Se mat è attivo, la cornice deve contenere il passepartout
    const matBands = mat?.enabled ? Math.max(mat.totalBandsMm, mat.minBandMm * mat.steps) : 0;

    const innerW = reliefPlan.w + 2 * matBands;
    const innerH = reliefPlan.h + 2 * matBands;

    // Frame DISATTIVATA TEMPORANEAMENTE (step successivo)
  const frameGeometry = useMemo(() => {
    return null;
  }, []);

    const vertices =
      (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
    const indices =
      (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);

    if (!vertices || !indices) {
      console.error("buildFrameRectPhi: output non valido", out);
      return null;
    }

    return toBufferGeometry(vertices, indices);
  }, [hmState, frame, mat, reliefPlan.w, reliefPlan.h]);

  // dispose pulito
  useEffect(() => {
    return () => {
      solidGeometry?.dispose();
      matGeometry?.dispose();
      frameGeometry?.dispose();
    };
  }, [solidGeometry, matGeometry, frameGeometry]);

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

  // --- Layering (effetto quadro reale) ---
  // Passepartout top plane sits BELOW relief top by matDropMm.
  // Relief base is lifted to sit slightly ABOVE passepartout plane (gap).
  const matDrop = mat?.enabled ? mat.matDropMm : 0;
  const reliefGap = mat?.enabled ? mat.reliefGapMm : 0;

  const matTopY = reliefTopY - matDrop;
  const reliefBaseY = matTopY + reliefGap;

  // Ground plane (for contact shadows) ~0: frame base is y=0
  const groundY = -0.01;

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
              position={[0, groundY, 0]}
              infiniteGrid
              fadeDistance={1400}
              fadeStrength={2.5}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(60, stlWidthMm * 0.7)]} />
          </>
        )}

        <group>
          {/* Passepartout: builder top at y=0 -> position so that top sits at matTopY */}
          {matGeometry && (
            <mesh geometry={matGeometry} position={[0, matTopY, 0]} castShadow receiveShadow>
              <meshPhysicalMaterial
                color={"#E9E3D6"}
                roughness={0.85}
                metalness={0.0}
                clearcoat={0.0}
                envMapIntensity={0.9}
              />
            </mesh>
          )}

          {/* Relief: geometry base at y=0 -> lift base to reliefBaseY */}
          <mesh
            geometry={solidGeometry}
            position={[0, reliefBaseY, 0]}
            rotation={PREVIEW_MIRROR_Y_180 ? [0, Math.PI, 0] : [0, 0, 0]}
            castShadow
            receiveShadow
          >
            <meshPhysicalMaterial
              color={"#1F4E5F"}
              roughness={0.32}
              metalness={0.03}
              clearcoat={0.28}
              clearcoatRoughness={0.62}
              envMapIntensity={1.25}
            />
          </mesh>

          {/* Frame: base at y=0 -> keep on ground */}
          {frameGeometry && (
            <mesh geometry={frameGeometry} position={[0, 0, 0]} castShadow receiveShadow>
              <meshPhysicalMaterial
                color={"#2B2B2B"}
                roughness={0.55}
                metalness={0.05}
                clearcoat={0.15}
                clearcoatRoughness={0.75}
                envMapIntensity={1.1}
              />
            </mesh>
          )}
        </group>

        {/* Contact shadow per “appoggio fisico” */}
        <ContactShadows
          position={[0, groundY, 0]}
          scale={Math.max(260, stlWidthMm * 2.4)}
          opacity={0.38}
          blur={2.9}
          far={Math.max(260, stlWidthMm * 2.4)}
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
