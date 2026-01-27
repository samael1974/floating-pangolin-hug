import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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

  const showHelpers = true;

  // 1) Costruisco una geometria "terreno" dalla heightmap (wireframe)
  const reliefGeometry = useMemo(() => {
    if (!hmState) return null;

    const { w, h, normF32 } = hmState;

    // passo di campionamento (1 = piena risoluzione, 2 = metà, 4 = più leggero, ecc.)
    const step = Math.max(1, Math.floor(decimateStep || 1));

    // dimensioni in "mm" (qui unità scena = mm)
    const width = stlWidthMm;
    const height = stlWidthMm * (h / w);

    // griglia campionata
    const gridW = Math.floor((w - 1) / step) + 1;
    const gridH = Math.floor((h - 1) / step) + 1;

    // PlaneGeometry( width, height, widthSegments, heightSegments )
    const geo = new THREE.PlaneGeometry(width, height, gridW - 1, gridH - 1);

    const pos = geo.attributes.position.array as Float32Array;

    // riempio la Z (altezza) leggendo normF32 con lo stesso ordine (x,y)
    let v = 0;
    for (let iy = 0; iy < gridH; iy++) {
      const srcY = Math.min(h - 1, iy * step);
      for (let ix = 0; ix < gridW; ix++) {
        const srcX = Math.min(w - 1, ix * step);
        const srcIndex = srcY * w + srcX;

        // posizione: x,y,z (z è l'altezza)
        pos[v * 3 + 2] = normF32[srcIndex] * depthMm;
        v++;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }, [hmState, stlWidthMm, decimateStep, depthMm]);

  // 2) Log “pulito” (non serve a ogni render)
  useEffect(() => {
    console.log("ReliefPreview3D updated", {
      hmState: hmState ? { w: hmState.w, h: hmState.h, len: hmState.normF32.length } : null,
      stlWidthMm,
      decimateStep,
      depthMm,
      baseMm,
      outputMode,
      baseStyle,
      hasReliefGeometry: !!reliefGeometry,
    });
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, outputMode, baseStyle, reliefGeometry]);

  // Camera dall'alto: così vedi il "piano" e non un taglio
  const camY = Math.max(60, stlWidthMm * 0.8);
  const camZ = Math.max(80, stlWidthMm * 1.1);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, camY, camZ], fov: 45 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[200, 300, 200]} intensity={1} />

        {showHelpers && (
          <>
            <axesHelper args={[50]} />
            <gridHelper args={[200, 20]} />
          </>
        )}

        {/* Rilievo: ruoto il piano per appoggiarlo sulla griglia */}
        {reliefGeometry && (
          <mesh geometry={reliefGeometry} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial wireframe />
          </mesh>
        )}

        {/* Cubo debug al centro */}
        <mesh position={[0, 5, 0]}>
          <boxGeometry args={[10, 10, 10]} />
          <meshStandardMaterial />
        </mesh>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
