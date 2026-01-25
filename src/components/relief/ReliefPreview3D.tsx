import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

import { buildSolidFromHeightmap } from "@/lib/relief/buildSolidFromHeightmap";
import type { OutputMode, BaseStyle } from "@/lib/reliefTypes";

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
  outputMode?: OutputMode; // default "relief"
  baseStyle: BaseStyle;
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

function Scene({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <>
      {/* 🌤 Environment: migliora tantissimo la lettura dei micro-dettagli (render-only) */}
      <Environment preset="studio" />

      {/* 💡 LIGHT RIG (2.1) */}
      <ambientLight intensity={0.32} />
      <hemisphereLight intensity={0.35} groundColor={"#111111"} />

      {/* Key light: direzionale + ombre morbide ma presenti */}
      <directionalLight
        position={[320, -420, 560]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.02}
      />

      {/* Rim light: leggera, stacca i bordi e fa leggere le altezze */}
      <directionalLight
        position={[-420, 260, 180]}
        intensity={0.35}
      />

      {/* Piano invisibile solo per ricevere ombre (render-only) */}
      <mesh
        rotation={[0, 0, 0]}
        position={[0, 0, -0.001]}
        receiveShadow
      >
        <planeGeometry args={[5000, 5000]} />
        <shadowMaterial opacity={0.25} />
      </mesh>

      {/* 🧱 Mesh + materiale (2.2) */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={"#e8e8e8"}          // neutro tipo gesso/plastica chiara
          metalness={0.05}
          roughness={0.58}          // satinato
          clearcoat={0.22}          // specular controllata
          clearcoatRoughness={0.45} // non “plasticone”
          reflectivity={0.25}
        />
      </mesh>

      {/* 🎥 Controls (2.3) */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={120}
        maxDistance={1500}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function ReliefPreview3D(props: Props) {
  const {
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode = "relief",
    baseStyle,
  } = props;

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

      // centra e poggia a Z=0
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (bb) {
        const center = new THREE.Vector3();
        bb.getCenter(center);
        geo.translate(-center.x, -center.y, -bb.min.z);
      }

      // buone pratiche: normal per shading più pulito
      geo.computeVertexNormals();

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
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      // 📷 Camera più leggibile: inclinazione leggera, niente frontale perfetta (2.3)
      camera={{ position: [180, -260, 220], fov: 38, near: 0.1, far: 8000 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene geometry={geometry} />
    </Canvas>
  );
}
