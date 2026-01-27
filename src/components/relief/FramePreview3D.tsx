import * as React from "react";
import type {} from "@react-three/fiber";

// ⚠️ Import modulo intero (evita errori “no exported member”)
import * as FrameMod from "@/lib/relief/frame/createFrameGeometry";

// Definisco il type QUI per evitare l’errore “FrameParams non esportato”
type FrameParams = {
  outerWidth: number;
  outerHeight: number;
  frameThickness: number;
  depth: number;
};

type Props = {
  enabled: boolean;
  params: FrameParams;
};

export default function FramePreview3D({ enabled, params }: Props) {
  // Prendo la factory in modo “compatibile” sia con export named che default
  const createFn =
    (FrameMod as any).createFrameGeometry ?? (FrameMod as any).default;

  const geometry = React.useMemo(() => {
    if (!enabled) return null;

    if (typeof createFn !== "function") {
      console.error(
        "createFrameGeometry non trovato: controlla src/lib/relief/frame/createFrameGeometry.ts"
      );
      return null;
    }

    return createFn(params);
  }, [enabled, params.outerWidth, params.outerHeight, params.frameThickness, params.depth, createFn]);

  React.useEffect(() => {
    return () => {
      geometry?.dispose?.();
    };
  }, [geometry]);

  if (!enabled || !geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial />
    </mesh>
  );
}
