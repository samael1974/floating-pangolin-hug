import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

function downloadStl() {
  if (!hmState) return;
  downloadReliefStlBinary({
    hm: hmState,
    stlWidthMm,
    decimateStep,
    depthMm: params.depthMm,
    baseMm: params.baseMm,
    outputMode: params.outputMode,
    baseStyle: params.baseStyle,
  });
}
