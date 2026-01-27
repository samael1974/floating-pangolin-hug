import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

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
  outputMode?: OutputMode;
  baseStyle: BaseStyle;
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

    const keys = hmState ? Object.keys(hmState) : [];
    console.log("hmState keys:", keys);

    if (hmState) {
      const summary = Object.fromEntries(
        keys.map((k) => {
          const v = (hmState as any)[k];
          const type = Array.isArray(v)
            ? `Array(${v.length})`
            : typeof v;
          return [k, type];
        })
      );
      console.log("hmState summary:", summary);
    }
  }, [hmState, stlWidthMm, decimateStep, depthMm, baseMm, outputMode, baseStyle]);

  return (
    <div style={{ width: "100%", height: 420, background: "#fff" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[3, 3, 3]} intensity={1} />

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
