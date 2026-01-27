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
const keys = hmState ? Object.keys(hmState) : [];
console.log("hmState keys:", keys);

if (hmState) {
  const summary = Object.fromEntries(
    keys.map((k) => {
      const v = (hmState as any)[k];
      const type =
        v?.isBufferGeometry ? "BufferGeometry" :
        v?.isMesh ? "Mesh" :
        Array.isArray(v) ? `Array(${v.length})` :
        typeof v;
      return [k, type];
    })
  );
  console.log("hmState summary:", summary);
}
