export type ReliefType = {
  id: string;
  name: string;
  description: string;
};

export type OutputMode = "solid" | "wireframe";

export type BaseStyle = {
  color: THREE.Color;
  opacity: number;
};