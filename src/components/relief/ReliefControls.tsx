import React from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import type { OutputMode, BaseStyle } from "@/lib/reliefTypes";

// (Compat: se qualche file importava i tipi da qui)
export type { OutputMode, BaseStyle } from "@/lib/reliefTypes";

export type ProjectType =
  | "logo_text"
  | "human_face"
  | "animal"
  | "nature_landscape"
  | "decorative_pattern";

export type EdgeMode = "round" | "sharp";

export type ReliefParams = {
  projectType: ProjectType;
  depthMm: number;
  baseMm: number; // can be 0
  detail: number; // 0..1
  smooth: number; // 0..1
  edge: EdgeMode;

  outputMode: OutputMode;
  baseStyle: BaseStyle;

  // opzionali (se li usi altrove, non danno fastidio)
  invertDepthMap?: boolean;
};

type Props = {
  value: ReliefParams;
  onChange: (next: ReliefParams) => void;
  disabled?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const DEFAULTS: ReliefParams = {
  projectType: "logo_text",
  depthMm: 2,
  baseMm: 1,
  detail: 0.5,
  smooth: 0.5,
  edge: "round",
  outputMode: "relief",
  baseStyle: "flat",
  invertDepthMap: false,
};

export default function ReliefControls({ value, onChange, disabled }: Props) {
  const v = { ...DEFAULTS, ...value };

const set = (patch: Partial<ReliefParams>) =>
  onChange({ ...v, ...patch, outputMode: "relief" });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo progetto</Label>
        <Select
          disabled={disabled}
          value={v.projectType}
          onValueChange={(x) => set({ projectType: x as ProjectType })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Scegli..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="logo_text">Logo / Testo</SelectItem>
            <SelectItem value="human_face">Volto umano</SelectItem>
            <SelectItem value="animal">Animale</SelectItem>
            <SelectItem value="nature_landscape">Natura / Paesaggio</SelectItem>
            <SelectItem value="decorative_pattern">Pattern decorativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Output</Label>
        <Select
          disabled={disabled}
          value={v.outputMode}
          onValueChange={(x) => set({ outputMode: x as OutputMode })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Scegli..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relief">Rilievo (positivo)</SelectItem>
            <SelectItem value="mold">Stampo (negativo)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Base</Label>
        <Select
          disabled={disabled}
          value={v.baseStyle}
          onValueChange={(x) => set({ baseStyle: x as BaseStyle })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Scegli..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Piatta</SelectItem>
            <SelectItem value="recessed">Incassata</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Profondità rilievo (mm): {v.depthMm.toFixed(1)}</Label>
        <Slider
          disabled={disabled}
          value={[v.depthMm]}
          min={0}
          max={20}
          step={0.1}
          onValueChange={(arr) => set({ depthMm: clamp(arr[0] ?? 0, 0, 20) })}
        />
      </div>

      <div className="space-y-2">
        <Label>Spessore base (mm): {v.baseMm.toFixed(1)}</Label>
        <Slider
          disabled={disabled}
          value={[v.baseMm]}
          min={0}
          max={20}
          step={0.1}
          onValueChange={(arr) => set({ baseMm: clamp(arr[0] ?? 0, 0, 20) })}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Dettaglio: {v.detail.toFixed(2)}</Label>
        <Slider
          disabled={disabled}
          value={[v.detail]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(arr) => set({ detail: clamp(arr[0] ?? 0, 0, 1) })}
        />
      </div>

      <div className="space-y-2">
        <Label>Smussatura: {v.smooth.toFixed(2)}</Label>
        <Slider
          disabled={disabled}
          value={[v.smooth]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(arr) => set({ smooth: clamp(arr[0] ?? 0, 0, 1) })}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <Label>Bordi arrotondati</Label>
        <Switch
          disabled={disabled}
          checked={v.edge === "round"}
          onCheckedChange={(checked) => set({ edge: checked ? "round" : "sharp" })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Inverti depthmap</Label>
        <Switch
          disabled={disabled}
          checked={!!v.invertDepthMap}
          onCheckedChange={(checked) => set({ invertDepthMap: checked })}
        />
      </div>
    </div>
  );
}
