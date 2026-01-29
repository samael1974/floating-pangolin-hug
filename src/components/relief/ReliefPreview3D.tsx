// src/components/relief/ReliefPreview3D.tsx
import React, { useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Grid } from "@react-three/drei";
import * as THREE from "three";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { BaseStyle } from "@/lib/relief/reliefTypes";
import { buildPassepartoutRectPhi } from "@/lib/relief/frame/buildPassepartoutRectPhi";
import { buildFrameRectPhi } from "@/lib/relief/frame/buildFrameRectPhi";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type FrameUI = {
  enabled: boolean;
  solidMm: number;
  frameHeightMm: number;
  glassMm: 2 | 3;
  glassClearanceMm: number;
  pocketDepthMm: number;
  lipMm: number;
  pocketRadialMm: number;
};

type MatUI = {
  enabled: boolean;
  steps: 1 | 2 | 3 | 4 | 5 | 6;
  totalBandsMm: number;
  minBandMm: number;
  thicknessMm: number;
  stepDropMm: number;
  matDropMm: number;
  reliefGapMm: number;
};

type Props = {
  hmState: HeightmapState | null;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  baseStyle: BaseStyle;

  // outputMode lo accettiamo anche qui
  outputMode?: string; // o il tipo reale che usi in ReliefWizard

  // cornice & mat
  frame?: FrameUI;
  mat?: MatUI;
};

const SHOW_HELPERS = true;
const PREVIEW_MIRROR_Y_180 = false;
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

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const center = new THREE.Vector3();
      bb.getCenter(center);
      geometry.translate(-center.x, -bb.min.y, -center.z);
      geometry.computeBoundingBox();
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle]);

  const reliefTopY = useMemo(() => {
    if (!solidGeometry) return 0;
    solidGeometry.computeBoundingBox();
    const bb = solidGeometry.boundingBox;
    return bb ? bb.max.y : 0;
  }, [solidGeometry]);

  const reliefPlan = useMemo(() => {
    if (!hmState) return { w: Math.max(1, stlWidthMm), h: Math.max(1, stlWidthMm) };
    const w = Math.max(1, stlWidthMm);
    const h = w * (hmState.h / hmState.w);
    return { w, h };
  }, [hmState, stlWidthMm]);

  const matGeometry = useMemo(() => {
    if (!hmState) return null;
    if (!mat?.enabled) return null;
    const out = buildPassepartoutRectPhi({
      innerWmm: reliefPlan.w,
      innerHmm: reliefPlan.h,
      steps: mat.steps,
      totalBandsMm: mat.totalBandsMm,
      thicknessMm: mat.thicknessMm,
      stepDropMm: mat.stepDropMm,
      minBandMm: mat.minBandMm,
    });
    const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
    const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
    if (!vertices || !indices) return null;
    return toBufferGeometry(vertices, indices);
  }, [hmState, mat, reliefPlan.w, reliefPlan.h]);

  const frameGeometry = useMemo(() => {
    if (!hmState) return null;
    if (!frame?.enabled) return null;
    const matBands = mat?.enabled ? Math.max(mat.totalBandsMm, mat.minBandMm * mat.steps) : 0;
    const innerW = reliefPlan.w + 2 * matBands;
    const innerH = reliefPlan.h + 2 * matBands;
    const out = buildFrameRectPhi({
      innerWmm: innerW,
      innerHmm: innerH,
      thicknessMm: frame.solidMm,
      heightMm: frame.frameHeightMm,
      glassMm: frame.glassMm,
      glassClearanceMm: frame.glassClearanceMm,
      glueLipMm: frame.lipMm,
    });
    const vertices = (out as any)?.vertices ?? ((out as any)?.[0] as Float32Array | undefined);
    const indices = (out as any)?.indices ?? ((out as any)?.[1] as Uint32Array | undefined);
    if (!vertices || !indices) return null;
    return toBufferGeometry(vertices, indices);
  }, [hmState, frame, mat, reliefPlan.w, reliefPlan.h]);

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

  const width = Math.max(1, stlWidthMm);
  const camDist = Math.max(220, width * 1.6);
  const matDrop = mat?.enabled ? mat.matDropMm : 0;
  const reliefGap = mat?.enabled ? mat.reliefGapMm : 0;
  const matTopY = reliefTopY - matDrop;
  const reliefBaseY = matTopY + reliefGap;
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
        <Environment preset="studio" />
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

  
  <mesh
  geometry={solidGeometry}
  position={[0, 0, 0]}   // ✅ incrocio assi griglia
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

        <ContactShadows
          position={[0, groundY, 0]}
          scale={Math.max(260, stlWidthMm * 2.4)}
          opacity={0.38}
          blur={2.9}
          far={Math.max(260, stlWidthMm * 2.4)}
        />

        <OrbitControls
  makeDefault
  // target dinamico centrato sulla mesh
  target={[0, reliefTopY * 0.5, 0]}
  enableDamping
  dampingFactor={0.08}
  enablePan={true}       // abilita pan per muovere il centro
  minPolarAngle={0.15}
  maxPolarAngle={Math.PI * 0.9}
/>
      </Canvas>
    </div>
  );
}
