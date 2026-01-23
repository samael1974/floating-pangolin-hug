import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

function downloadStl() {
  if (!hmState) {
    console.warn("downloadStl: hmState non disponibile");
    return;
  }

  downloadReliefStlBinary({
    hm: hmState,
    stlWidthMm: stlWidthMm,
    decimateStep: decimateStep,
    depthMm: params.depthMm,
    baseMm: params.baseMm,
    outputMode: params.outputMode,
    baseStyle: params.baseStyle,
  });
}
