import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { OrbitControls, Grid, Edges } from "@react-three/drei";


export type HeightmapState = {
  normF32: Float32Array; // valori normalizzati 0..1 (o simile)
  w: number;
  h: number;
};

type Props = {
  hmState: HeightmapState | null;

  // dimensione desiderata (mm)
  stlWidthMm: number;

  // “step” di campionamento: 1 piena risoluzione, 2 metà, 4 più leggero…
  decimateStep: number;

  // profondità rilievo (mm)
  depthMm: number;

  // non usato qui ma arriva dal Wizard
  baseMm: number;

  // tienili "any" finché non importi i tipi reali
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

  // Griglia/assi sempre ON per debug
  const showHelpers = true;

  // Geometria rilievo (piano deformato dalla heightmap)
  const reliefGeometry = useMemo(() => {
    if (!hmState) return null;

    const { w, h, normF32 } = hmState;

    const step = Math.max(1, Math.floor(decimateStep || 1));

    const width = Math.max(1, stlWidthMm);
    const height = width * (h / w);

    const gridW = Math.floor((w - 1) / step) + 1;
    const gridH = Math.floor((h - 1) / step) + 1;

    const geo = new THREE.PlaneGeometry(width, height, gridW - 1, gridH - 1);

    const pos = geo.attributes.position.array as Float32Array;

    // riempio Z leggendo normF32 in ordine (x,y)
    let v = 0;
    for (let iy = 0; iy < gridH; iy++) {
      const srcY = Math.min(h - 1, iy * step);
      for (let ix = 0; ix < gridW; ix++) {
        const srcX = Math.min(w - 1, ix * step);
        const srcIndex = srcY * w + srcX;

        pos[v * 3 + 2] = (normF32[srcIndex] ?? 0) * depthMm;
        v++;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }, [hmState, stlWidthMm, decimateStep, depthMm]);

  useEffect(() => {
    console.log("ReliefPreview3D updated", {
      hmState: hmState
        ? { w: hmState.w, h: hmState.h, len: hmState.normF32.length }
        : null,
      stlWidthMm,
      decimateStep,
      depthMm,
      baseMm,
      outputMode,
      baseStyle,
      hasReliefGeometry: !!reliefGeometry,
    });
  }, [
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode,
    baseStyle,
    reliefGeometry,
  ]);

  // Camera: abbastanza lontana per vedere un piano largo 60–200mm
  const camDist = Math.max(120, stlWidthMm * 1.1);

  // Cubo debug: proporzionato alla scena
  const cubeSize = Math.max(10, stlWidthMm * 0.08);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas
        camera={{ position: [0, camDist, camDist], fov: 45, near: 0.1, far: 5000 }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[200, 300, 200]} intensity={1.1} />

        {showHelpers && (
          <>
            {/* Griglia “infinita” (molto meglio di gridHelper finito) */}
            <Grid
              infiniteGrid
              fadeDistance={600}
              fadeStrength={3}
              cellSize={10}
              sectionSize={50}
            />
            <axesHelper args={[stlWidthMm]} />
          </>
        )}

        {/* Rilievo: ruoto il piano per appoggiarlo sulla griglia */}
        {reliefGeometry && (
  <mesh
    geometry={makeSolidFromRelief(reliefGeometry, baseMm)}
    rotation={[-Math.PI / 2, 0, 0]}
  >
    <meshStandardMaterial roughness={0.75} metalness={0.05} />
    <Edges />
  </mesh>
)}

        
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
