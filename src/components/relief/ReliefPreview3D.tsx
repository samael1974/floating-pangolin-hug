import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
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
  outputMode?: any;
  baseStyle: any;
  invert?: boolean; // ✅ AGGIUNTO
};


export default function ReliefPreview3D({
  hmState,
  stlWidthMm,
  depthMm,
  baseMm,
  baseStyle,
  invert = false,
}: Props): JSX.Element {
  const geom = useMemo(() => {
    if (!hmState) return null;

    const out = buildSolidFromHeightmap({
      height01: hmState.normF32,
      width: hmState.w,
      height: hmState.h,
      outWidthMm: stlWidthMm,
      depthMm,
      baseMm,
      baseStyle,
      invert, // <-- qui si applica l'inversione
      clampHeights: true,
      minBaseMm: 0.4,
    });

    // evitare leak di geometrie quando cambia input
    return out.geometry;
  }, [hmState, stlWidthMm, depthMm, baseMm, baseStyle, invert]);

  // camera “comoda” per oggetti in mm
  const camDist = Math.max(160, stlWidthMm * 1.2);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, camDist, camDist], fov: 45, near: 0.1, far: 50000 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[200, 300, 200]} intensity={1.1} />

        {/* Griglia infinita + assi */}
        <Grid infiniteGrid fadeDistance={800} fadeStrength={3} cellSize={10} sectionSize={50} />
        <axesHelper args={[Math.max(80, stlWidthMm * 0.8)]} />

        {/* GEOMETRIA REALE (uguale allo STL) */}
        {geom && (
          <mesh geometry={geom}>
            <meshStandardMaterial roughness={0.8} metalness={0.05} />
            <Edges />
          </mesh>
        )}

        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
