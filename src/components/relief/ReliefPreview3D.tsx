import type { OutputMode, BaseStyle } from "@/lib/relief/reliefTypes";

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

export default function ReliefPreview3D(props: Props): JSX.Element | null {
  const {
    hmState,
    stlWidthMm,
    decimateStep,
    depthMm,
    baseMm,
    outputMode = "relief",
    baseStyle,
  } = props;

  // ⬇️ IMPORTANTISSIMO:
  // sotto deve esistere ALMENO un return JSX, oppure return null.
  // Se hai già il tuo codice (useMemo, geometry, Canvas), lascialo com’è,
  // ma assicurati che alla fine ci sia un return (...).
  return null;
}
