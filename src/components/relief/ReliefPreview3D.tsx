import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

// ⚠️ Lascia i tuoi import reali, ad esempio:
// import type { OutputMode, BaseStyle } from "...";

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

};

export default function ReliefPreview3D(props: Props): JSX.Element {
  const {
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode = "relief",
    baseStyle,
  } = props;

  // Helpers (assi + griglia) nella preview: ON per ora
  const showHelpers = true;

  // Log pulito: si aggiorna solo quando cambia hmState
  useEffect(() => {
    console.log("ReliefPreview3D mounted / updated", {
      hmState,
      stlWidthMm,
      decimateStep,
      depthMm,
      baseMm,
      outputMode,
      baseStyle,
    });

    const reliefGeometry = useMemo(() => {
  if (!hmState) return null;

  const { w, h, normF32 } = hmState;

  // dimensioni della piastra in preview (mm ≈ unità scena)
  const width = stlWidthMm;
  const height = stlWidthMm * (h / w);

  // PlaneGeometry: (width, height, widthSegments, heightSegments)
  const geo = new THREE.PlaneGeometry(width, height, w - 1, h - 1);

  // Sposta i vertici in Z usando la heightmap normalizzata
  const pos = geo.attributes.position.array as Float32Array;
  const vCount = Math.min(normF32.length, pos.length / 3);

  for (let i = 0; i < vCount; i++) {
    pos[i * 3 + 2] = normF32[i] * depthMm; // da 0 a depthMm
  }

  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();

  return geo;
}, [hmState, stlWidthMm, depthMm]);


  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[3, 3, 3]} intensity={1} />
        {reliefGeometry && (
  <mesh geometry={reliefGeometry} rotation={[-Math.PI / 2, 0, 0]}>
    <meshStandardMaterial wireframe />
  </mesh>
)}


        {showHelpers && (
          <>
            <axesHelper args={[50]} />
            <gridHelper args={[200, 20]} />
          </>
        )}

        {/* Cubo di debug (deve esserci sempre) */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial />
        </mesh>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
