import type { FrameProfileStep } from "@/lib/relief/frame/frameProfiles";

export type FrameRectProfileParams = {
  innerWmm: number;
  innerHmm: number;
  unitMm: number;
  steps: FrameProfileStep[];
};

export type MeshOut = {
  vertices: Float32Array;
  indices: Uint32Array;
};

export function buildFrameRectProfile(params: FrameRectProfileParams): MeshOut {
  const innerW = Math.max(1, params.innerWmm);
  const innerH = Math.max(1, params.innerHmm);
  const unit = Math.max(0.1, params.unitMm);
  const steps = params.steps.length ? params.steps : [{ widthUnits: 1, heightUnits: 1 }];

  const V: number[] = [];
  const I: number[] = [];

  const addV = (x: number, y: number, z: number) => {
    V.push(x, y, z);
    return (V.length / 3) - 1;
  };

  const tri = (a: number, b: number, c: number) => {
    I.push(a, b, c);
  };

  const addRingRect = (
    outerW: number,
    outerH: number,
    innerWmm: number,
    innerHmm: number,
    y0: number,
    y1: number,
    withBottom: boolean
  ) => {
    const oTL = addV(-outerW / 2, y1, -outerH / 2);
    const oTR = addV(+outerW / 2, y1, -outerH / 2);
    const oBR = addV(+outerW / 2, y1, +outerH / 2);
    const oBL = addV(-outerW / 2, y1, +outerH / 2);

    const iTL = addV(-innerWmm / 2, y1, -innerHmm / 2);
    const iTR = addV(+innerWmm / 2, y1, -innerHmm / 2);
    const iBR = addV(+innerWmm / 2, y1, +innerHmm / 2);
    const iBL = addV(-innerWmm / 2, y1, +innerHmm / 2);

    tri(oTL, oTR, iTR);
    tri(oTL, iTR, iTL);
    tri(oTR, oBR, iBR);
    tri(oTR, iBR, iTR);
    tri(oBR, oBL, iBL);
    tri(oBR, iBL, iBR);
    tri(oBL, oTL, iTL);
    tri(oBL, iTL, iBL);

    const addRectWall = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      yB: number,
      yT: number,
      flip: boolean
    ) => {
      const a0 = addV(x0, yB, z0);
      const b0 = addV(x1, yB, z1);
      const b1 = addV(x1, yT, z1);
      const a1 = addV(x0, yT, z0);
      if (flip) {
        tri(a0, b1, b0);
        tri(a0, a1, b1);
      } else {
        tri(a0, b0, b1);
        tri(a0, b1, a1);
      }
    };

    addRectWall(-outerW / 2, -outerH / 2, +outerW / 2, -outerH / 2, y0, y1, false);
    addRectWall(+outerW / 2, -outerH / 2, +outerW / 2, +outerH / 2, y0, y1, false);
    addRectWall(+outerW / 2, +outerH / 2, -outerW / 2, +outerH / 2, y0, y1, false);
    addRectWall(-outerW / 2, +outerH / 2, -outerW / 2, -outerH / 2, y0, y1, false);

    addRectWall(-innerWmm / 2, -innerHmm / 2, +innerWmm / 2, -innerHmm / 2, y0, y1, true);
    addRectWall(+innerWmm / 2, -innerHmm / 2, +innerWmm / 2, +innerHmm / 2, y0, y1, true);
    addRectWall(+innerWmm / 2, +innerHmm / 2, -innerWmm / 2, +innerHmm / 2, y0, y1, true);
    addRectWall(-innerWmm / 2, +innerHmm / 2, -innerWmm / 2, -innerHmm / 2, y0, y1, true);

    if (withBottom) {
      const b_oTL = addV(-outerW / 2, y0, -outerH / 2);
      const b_oTR = addV(+outerW / 2, y0, -outerH / 2);
      const b_oBR = addV(+outerW / 2, y0, +outerH / 2);
      const b_oBL = addV(-outerW / 2, y0, +outerH / 2);

      const b_iTL = addV(-innerWmm / 2, y0, -innerHmm / 2);
      const b_iTR = addV(+innerWmm / 2, y0, -innerHmm / 2);
      const b_iBR = addV(+innerWmm / 2, y0, +innerHmm / 2);
      const b_iBL = addV(-innerWmm / 2, y0, +innerHmm / 2);

      tri(b_oTL, b_iTR, b_oTR);
      tri(b_oTL, b_iTL, b_iTR);
      tri(b_oTR, b_iBR, b_oBR);
      tri(b_oTR, b_iTR, b_iBR);
      tri(b_oBR, b_iBL, b_oBL);
      tri(b_oBR, b_iBR, b_iBL);
      tri(b_oBL, b_iTL, b_iBL);
      tri(b_oBL, b_oTL, b_iTL);
    }
  };

  let currentInnerW = innerW;
  let currentInnerH = innerH;
  let currentY = 0;

  steps.forEach((step, index) => {
    const width = Math.max(0, step.widthUnits) * unit;
    const height = Math.max(0.1, step.heightUnits) * unit;
    const outerW = currentInnerW + 2 * width;
    const outerH = currentInnerH + 2 * width;
    addRingRect(outerW, outerH, currentInnerW, currentInnerH, currentY, currentY + height, index === 0);
    currentInnerW = outerW;
    currentInnerH = outerH;
    currentY += height;
  });

  return {
    vertices: new Float32Array(V),
    indices: new Uint32Array(I),
  };
}
