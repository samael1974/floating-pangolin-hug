export type FrameProfileKey = "flat" | "step_out" | "step_in";

export type FrameProfileStep = {
  widthUnits: number;
  heightUnits: number;
};

export type FrameProfile = {
  key: FrameProfileKey;
  label: string;
  steps: FrameProfileStep[];
};

export const FRAME_PROFILES: FrameProfile[] = [
  {
    key: "flat",
    label: "Piatta",
    steps: [{ widthUnits: 1, heightUnits: 1 }],
  },
  {
    key: "step_out",
    label: "Gradoni esterni",
    steps: [
      { widthUnits: 3, heightUnits: 1 },
      { widthUnits: 2, heightUnits: 1 },
      { widthUnits: 2, heightUnits: 1 },
      { widthUnits: 1, heightUnits: 1 },
    ],
  },
  {
    key: "step_in",
    label: "Gradoni interni",
    steps: [
      { widthUnits: 1, heightUnits: 1 },
      { widthUnits: 2, heightUnits: 1 },
      { widthUnits: 2, heightUnits: 1 },
      { widthUnits: 3, heightUnits: 1 },
    ],
  },
];
