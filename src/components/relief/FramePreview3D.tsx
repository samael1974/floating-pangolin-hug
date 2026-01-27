import * as React from "react";
import type {} from "@react-three/fiber";

// Importo il modulo intero (evita TS2305 “no exported member”)
import { createFrameGeometry, type FrameParams } from "@/lib/relief/frame/createFrameGeometry";


// Type locale: non dipende dagli export FrameParams
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
  // supporta sia export named che default (nel dubbio)
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
  }, [
    enabled,
    params.outerWidth,
    params.outerHeight,
    params.frameThickness,
    params.depth,
    createFn,
  ]);

  React.useEffect(() => {
    return () => geometry?.dispose?.();
  }, [geometry]);

  if (!enabled || !geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial />
    </mesh>
  );
}
