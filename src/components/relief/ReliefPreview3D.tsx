// src/components/relief/ReliefPreview3D.tsx
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows, Environment } from "@react-three/drei";
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
  outputMode?: any;
};

function decimateHeights(hm: HeightmapState, stepIn: number) {
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
  const showHelpers = true;

  // 1) Geometria SOLIDA identica alla pipeline STL
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

    // Appoggia base a Z=0 (poi ruotiamo Z->Y)
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const minZ = bb.min.z;
      if (Number.isFinite(minZ) && Math.abs(minZ) > 1e-6) {
        geometry.translate(0, 0, -minZ);
      }
    }

    // Normali buone = shading migliore
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, baseStyle]);

  // Bounds per camera/target migliori
  const bounds = useMemo(() => {
    if (!solidGeometry) return null;
    solidGeometry.computeBoundingBox();
    const bb = solidGeometry.boundingBox;
    if (!bb) return null;

    const size = new THREE.Vector3();
    bb.getSize(size);

    // altezza in Z (STL), diventerà Y in scena dopo rotazione
    const midHeight = size.z * 0.5;
    return { size, midHeight };
  }, [solidGeometry]);

  const width = Math.max(1, stlWidthMm);
  const camDist = Math.max(180, width * 1.55);
  const targetY = bounds?.midHeight ?? 10;

  return (
    <div style={{ width: "100%", height: "100%", background: "#f6f7f9" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, camDist * 0.75, camDist], fov: 42, near: 0.1, far: 10000 }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          // Rendering “più leggibile” (color space + tone mapping)
          // Renderer.outputColorSpace default SRGBColorSpace, toneMapping e exposure sono proprietà del renderer. :contentReference[oaicite:0]{index=0}
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        {/* Environment = micro-contrasto sulle superfici */}
        <Environment preset="studio" />

        {/* Luci: una key + una fill + ambient leggero */}
        <ambientLight intensity={0.18} />
        <directionalLight
          position={[350, 520, 260]}
          intensity={1.35}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={2500}
          shadow-bias={-0.0002}
        />
        <directionalLight position={[-280, 220, -220]} intensity={0.55} />

        {/* helpers (griglia spostata leggermente in basso per evitare z-fighting) */}
        {showHelpers && (
          <>
            <Grid
              position={[0, -0.15, 0]}
              infiniteGrid
              fadeDistance={900}
              fadeStrength={2.8}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(60, stlWidthMm * 0.7)]} />
          </>
        )}

        {/* Oggetto */}
        {solidGeometry && (
          <mesh
            geometry={solidGeometry}
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow
            receiveShadow
          >
            {/* Material “leggibile”: più contrasto + risposta a Environment */}
            <meshPhysicalMaterial
              roughness={0.35}
              metalness={0.05}
              clearcoat={0.25}
              clearcoatRoughness={0.65}
              envMapIntensity={1.25}
            />
          </mesh>
        )}

        {/* Ombra contatto: spostata un filo sotto per NON combattere con la base */}
        <ContactShadows
          position={[0, -0.12, 0]}
          scale={Math.max(220, stlWidthMm * 2)}
          opacity={0.33}
          blur={2.8}
          far={Math.max(240, stlWidthMm * 2)}
        />

        <OrbitControls
          makeDefault
          target={[0, targetY, 0]}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          // evita inquadrature “da sotto” che ti fanno perdere il pezzo
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.02}
        />
      </Canvas>
    </div>
  );
}
