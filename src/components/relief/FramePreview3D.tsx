// src/components/relief/FramePreview3D.tsx
import * as React from "react";
import type {} from "@react-three/fiber";

import { createFrameGeometry, type FrameParams } from "@/lib/relief/frame/createFrameGeometry";

export type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

export type ReliefPreview3DProps = {
  hmState: HeightmapState | null;
  stlWidthMm: number;
  decimateStep: number;
  depthMm: number;
  baseMm: number;
  outputMode?: string; // se vuoi, dopo lo string lo ri-agganciamo a OutputMode
  baseStyle: any;      // idem: poi lo ri-agganciamo a BaseStyle
};


export default function FramePreview3D({ enabled, params }: Props) {
  const geometry = React.useMemo(() => {
    if (!enabled) return null;
    return createFrameGeometry(params);
  }, [
    enabled,
    params.outerWidth,
    params.outerHeight,
    params.frameThickness,
    params.depth,
  ]);

  React.useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!enabled || !geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial />
    </mesh>
  );
}
