import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows, Environment, Edges } from "@react-three/drei";
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
  outputMode?: any; // se non ti serve qui, lascialo pure
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
      // IMPORTANT: l’invert lo fai già a monte nel Wizard
      invert: false,
      clampHeights: true,
      minBaseMm: 0.4,
    });

    // 2) Appoggia la base al “piano”: porta minZ a 0
    // (poi ruotiamo il pezzo per avere Z-up -> Y-up in scena)
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const minZ = bb.min.z;
      if (Number.isFinite(minZ) && Math.abs(minZ) > 1e-6) {
        geometry.translate(0, 0, -minZ);
      }
    }

    // Normali ok per shading
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

    // dopo translate(minZ->0) l’altezza sta in size.z (Z-up)
    // ma noi ruotiamo il mesh: Z diventa Y (up)
    const midHeight = size.z * 0.5;

    return { size, midHeight };
  }, [solidGeometry]);

  const width = Math.max(1, stlWidthMm);
  const camDist = Math.max(180, width * 1.6);
  const targetY = bounds?.midHeight ?? 10;

  return (
    <div style={{ width: "100%", height: "100%", background: "#f6f7f9" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, camDist, camDist], fov: 40, near: 0.1, far: 10000 }}
        gl={{ antialias: true }}
      >
        {/* luci migliori */}
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[300, 500, 200]}
          intensity={1.25}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={2000}
        />
        <hemisphereLight intensity={0.35} />

        {/* helpers */}
        {showHelpers && (
          <>
            <Grid
              infiniteGrid
              fadeDistance={900}
              fadeStrength={2.5}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[Math.max(60, stlWidthMm * 0.7)]} />
          </>
        )}

        {/* oggetto */}
        {solidGeometry && (
          <mesh
            geometry={solidGeometry}
            // Z-up (STL) -> Y-up (three) così la base sta sulla griglia
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial roughness={0.65} metalness={0.08} />
            <Edges threshold={12} />
          </mesh>
        )}

        {/* ombra “a contatto” per far leggere il volume */}
        <ContactShadows
          position={[0, 0, 0]}
          scale={Math.max(200, stlWidthMm * 2)}
          opacity={0.35}
          blur={2.6}
          far={Math.max(200, stlWidthMm * 2)}
        />

        <OrbitControls makeDefault target={[0, targetY, 0]} enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
