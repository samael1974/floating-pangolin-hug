import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type Props = {
 hmState: { normF32: Float32Array; w: number; h: number } | null;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  previewDecimateStep: number;
  baseStyle: "flat" | "recessed";
  outputMode?: "relief" | "mold";
  stlWidthMm={widthMm}
decimateStep={previewDecimateStep}

};

function decimateHm(hm: HeightmapState, step: number): HeightmapState {
  const s = Math.max(1, Math.floor(step));
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

function Scene({
  geometry,
}: {
  geometry: THREE.BufferGeometry;
}) {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 4]} intensity={1.2} />
      <group>
        <mesh geometry={geometry}>
          <meshStandardMaterial roughness={0.9} metalness={0.05} />
        </mesh>
      </group>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  );
}

export default function ReliefPreview3D(props: Props) {
  const { hmState, stlWidthMm, decimateStep, depthMm, baseMm, outputMode, baseStyle } = props;

  const geometry = React.useMemo(() => {
    if (!hmState) return null;

    const hmDec = decimateHm(hmState, decimateStep);

    try {
      const geo = buildSolidFromHeightmap({
        normF32: hmDec.normF32,
        w: hmDec.w,
        h: hmDec.h,
        widthMm: stlWidthMm,
        depthMm,
        baseMm,
        outputMode,
        baseStyle,
      });

      // centra e scala “ragionevole” per camera
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (bb) {
        const center = new THREE.Vector3();
        bb.getCenter(center);
        geo.translate(-center.x, -center.y, -bb.min.z); // poggia a z=0
      }

      return geo;
    } catch (e) {
      console.error("ReliefPreview3D build error:", e);
      return null;
    }
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, outputMode, baseStyle]);

  if (!hmState) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
        Carica un file per vedere il 3D.
      </div>
    );
  }

  if (!geometry) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
        La preview 3D appare dopo la generazione della heightmap.
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, -220, 180], fov: 45, near: 0.1, far: 5000 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene geometry={geometry} />
    </Canvas>
  );
}
