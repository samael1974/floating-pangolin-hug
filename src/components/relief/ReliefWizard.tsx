import * as React from "react";
import ReliefUpload from "@/components/relief/ReliefUpload";
import ReliefControls, { type ReliefParams } from "@/components/relief/ReliefControls";
import ReliefHeightmapPreview from "@/components/relief/ReliefHeightmapPreview";
import ReliefPreview3D from "@/components/relief/ReliefPreview3D";
import { buildHeightmapFromImageData } from "@/components/relief/reliefHeightmap";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { downloadReliefStlBinary } from "@/components/relief/reliefStl";

type HeightmapState = {
  normF32: Float32Array;
  w: number;
  h: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ReliefWizard() {
  // ✅ QUI dentro esistono hmState/params/stlWidthMm/decimateStep

  // --- esempio: mantieni i tuoi useState reali (non li riscrivo tutti)
  const [params, setParams] = React.useState<ReliefParams>(() => ({
    projectType: "logo_text",
    depthMm: 3,
    baseMm: 2,
    detail: 0.55,
    smooth: 0.15,
    edge: "sharp",
    outputMode: "relief",
    baseStyle: "flat",
  }));

  const [hmState, setHmState] = React.useState<HeightmapState | null>(null);

  const [stlWidthMm, setStlWidthMm] = React.useState<number>(120);
  const [decimateStep, setDecimateStep] = React.useState<number>(1);

  // ✅ downloadStl deve stare QUI
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

  // ... QUI sotto rimetti il resto del tuo codice (upload, pipeline, JSX)
  return (
    <div>
      {/* il tuo JSX */}
      <button onClick={downloadStl}>Scarica STL</button>
    </div>
  );
}
