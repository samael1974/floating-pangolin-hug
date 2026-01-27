export function downloadReliefStlBinary(
  arg1: DownloadArgs | HeightmapState,
  arg2?: Omit<DownloadArgs, "hm" | "hmState">
) {
  // 1) Normalizza input (accetta sia downloadReliefStlBinary({hm,...})
  //    sia downloadReliefStlBinary(hm, {widthMm,...})
  let hm: HeightmapState | undefined;
  let args: DownloadArgs;

  const isHm =
    (arg1 as any)?.normF32 instanceof Float32Array &&
    typeof (arg1 as any)?.w === "number" &&
    typeof (arg1 as any)?.h === "number";

  if (isHm) {
    hm = arg1 as HeightmapState;
    if (!arg2) throw new Error("STL: mancano gli argomenti (widthMm, depthMm, baseMm, ...)");
    args = {
      hm,
      widthMm: arg2.widthMm,
      depthMm: arg2.depthMm,
      baseMm: arg2.baseMm,
      outputMode: (arg2 as any).outputMode ?? "relief",
      baseStyle: (arg2 as any).baseStyle ?? "flat",
      fileName: (arg2 as any).fileName ?? "reliefforge.stl",
    };
  } else {
    args = arg1 as DownloadArgs;
    hm = args.hm ?? args.hmState;
    if (!hm) throw new Error("STL: hm/hmState mancante");
  }

  // 2) Build geometry (Three.js = Y-up)
  let geom = buildSolidFromHeightmap({
    normF32: hm.normF32,
    w: hm.w,
    h: hm.h,
    widthMm: args.widthMm,
    depthMm: args.depthMm,
    baseMm: args.baseMm,
    outputMode: args.outputMode,
    baseStyle: args.baseStyle,
  });

  // 3) ✅ FIX ORIENTAMENTO: slicer STL vuole Z-up
  geom.rotateX(-Math.PI / 2);
  geom.computeBoundingBox();
  if (geom.boundingBox) geom.translate(0, 0, -geom.boundingBox.min.z);

  // 4) (cutout MVP safe = no-op)
  geom = applyCutoutToFlatGeometry(geom);

  // 5) Sanity
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) throw new Error("STL: geometry missing position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`STL: non-finite vertex at index ${i}`);
    }
  }

  const bin = geometryToBinaryStl(geom);
  const name = (args.fileName ?? "reliefforge.stl").toLowerCase().endsWith(".stl")
    ? (args.fileName ?? "reliefforge.stl")
    : `${args.fileName}.stl`;

  downloadArrayBuffer(bin, name);
}
