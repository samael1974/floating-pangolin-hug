import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
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

/**
 * HeadLight: fill leggero che segue la camera.
 * Niente ombre: zero shimmer.
 */
function HeadLight({ intensity = 0.3 }: { intensity?: number }) {
  const ref = React.useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();

  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    l.position.copy(camera.position);
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  });

  return <directionalLight ref={ref} intensity={intensity} color={"#ffffff"} />;
}

/**
 * CameraKeyLight: key radente DINAMICA che segue la camera ma resta laterale.
 * Serve a mantenere leggibilità simile tra “front” e “back”.
 */
function CameraKeyLight({ intensity = 1.6 }: { intensity?: number }) {
  const ref = React.useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();

  useFrame(() => {
    const l = ref.current;
    if (!l) return;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    // luce radente: laterale + un filo dall’alto + leggermente dietro
    const pos = camera.position
      .clone()
      .add(right.multiplyScalar(650))
      .add(up.multiplyScalar(120))
      .add(forward.multiplyScalar(-80));

    l.position.copy(pos);
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  });

  return <directionalLight ref={ref} intensity={intensity} color={"#ffffff"} />;
}

function Scene({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <>
      <Environment preset="studio" />

      {/* Fill minimo: se lo alzi troppo, appiattisci */}
      <ambientLight intensity={0.08} />
      <hemisphereLight intensity={0.14} groundColor={"#050505"} />

      {/* Key radente dinamica (stabile, senza ombre) */}
      <CameraKeyLight intensity={1.6} />

      {/* Rim leggero */}
      <directionalLight
        position={[-520, 260, 260]}
        intensity={0.28}
        color={"#ffffff"}
      />

      {/* Headlight fill */}
      <HeadLight intensity={0.3} />

      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={"#E26D5C"}
          metalness={0.02}
          roughness={0.78}
          clearcoat={0.08}
          clearcoatRoughness={0.65}
          reflectivity={0.12}
          envMapIntensity={0.40}
        />
      </mesh>

      <ContactShadows
        position={[0, 0, -0.002]}
        opacity={0.30}
        scale={1600}
        blur={2.6}
        far={1200}
        resolution={1024}
      />

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

      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (bb) {
        const center = new THREE.Vector3();
        bb.getCenter(center);
        geo.translate(-center.x, -center.y, -bb.min.z);
      }

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
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.3;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      camera={{ position: [180, -260, 220], fov: 38, near: 0.1, far: 8000 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#f6f7fb"]} />
      <Scene geometry={geometry} />
    </Canvas>
  );
}
