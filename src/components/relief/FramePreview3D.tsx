import * as React from "react";
import { createFrameGeometry, type FrameParams } from "@/lib/relief/frame/createFrameGeometry";

// ✅ Import “types side-effect” per far riconoscere <mesh> e <meshStandardMaterial> a TS
import type {} from "@react-three/fiber";

type Props = {
  enabled: boolean;
  params: FrameParams;
};

export default function FramePreview3D({ enabled, params }: Props) {
  const geometry = React.useMemo(() => {
    if (!enabled) return null;
    return createFrameGeometry(params);
  }, [enabled, params.outerWidth, params.outerHeight, params.frameThickness, params.depth]);

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
