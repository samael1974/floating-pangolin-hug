import * as React from "react";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import type { BaseStyle } from "@/lib/reliefTypes";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

type Props = {
  hmState: HeightmapState | null;
  widthMm: number;
  depthMm: number;
  baseMm: number;
  previewDecimateStep: number;
  baseStyle: BaseStyle;
};

export default function ReliefGenerate({
  hmState,
  widthMm,
  depthMm,
  baseMm,
  previewDecimateStep,
  baseStyle,
}: Props) {
  return (
    <div className="h-full w-full">
      <ReliefPreview3D
        hmState={hmState}
        widthMm={widthMm}
        depthMm={depthMm}
        baseMm={baseMm}
        previewDecimateStep={previewDecimateStep}
        baseStyle={baseStyle}
        outputMode="relief"
      />
    </div>
  );
}
