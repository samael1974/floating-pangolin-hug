import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
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

function HeadLight() {
  const { camera } = useThree();
<Environment preset="studio" />

{/* Headlight: segue sempre la camera (boost micro-dettagli) */}
<HeadLight />

{/* Fill minimo: se è alto, ammazza il rilievo */}
<ambientLight intensity={0.10} />
<hemisphereLight intensity={0.12} groundColor={"#050505"} />

{/* Grazing/key radente: questo fa “uscire” il bassorilievo */}
<directionalLight
  position={[1100, -180, 90]}
  intensity={3.2}
  castShadow
  shadow-mapSize={[2048, 2048]}
  shadow-bias={-0.00012}
  shadow-normalBias={0.02}
  shadow-radius={7}
/>

{/* Rim leggero */}
<directionalLight position={[-700, 380, 420]} intensity={0.22} />
    />
  );
}

function Scene({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <>
      {/* 🌤 Environment: utile, ma NON deve “lavare” la scena */}

      {/* 💡 LIGHT RIG (2.1) — meno fill, più luce radente */}
      <ambientLight intensity={0.16} />
      <hemisphereLight intensity={0.18} groundColor={"#0b0b0b"} />

      {/* Key light RADENTE: aumenta la lettura delle altezze */}
      <directionalLight
        position={[900, -260, 110]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.02}
        shadow-radius={6}
      />

      {/* Rim light: stacca i bordi senza appiattire */}
      <directionalLight position={[-520, 260, 260]} intensity={0.28} />

      {/* Piano invisibile solo per ricevere ombre (render-only) */}
      <mesh position={[0, 0, -0.001]} receiveShadow>
        <planeGeometry args={[5000, 5000]} />
        <shadowMaterial opacity={0.4} />
      </mesh>

      {/* 🧱 Mesh + materiale (2.2) — “aragosta” opaco leggibile */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
  color={"#E26D5C"}
  metalness={0.02}
  roughness={0.78}
  clearcoat={0.06}
  clearcoatRoughness={0.65}
  reflectivity={0.10}
  envMapIntensity={0.35}
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

      // shading più pulito
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
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      camera={{ position: [0, -520, 520], fov: 35, near: 0.1, far: 8000 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f6f7fb"]} />
      <Scene geometry={geometry} />
    </Canvas>
  );
}
