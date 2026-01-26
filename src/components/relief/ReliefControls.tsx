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
  baseMm: number; // can be 0 (MA non con cutout)
  detail: number; // 0..1
  smooth: number; // 0..1
  edge: EdgeMode;

  // tenuti nei params per compatibilità, ma in UI sarà fisso:
  outputMode: OutputMode;

  baseStyle: BaseStyle;

  // ✅ CUTOUT (solo baseStyle="flat")
  cutoutEnabled: boolean;
};

type Props = {
  value: ReliefParams;
  onChange: (next: ReliefParams) => void;
  disabled?: boolean;

  // ✅ CUTOUT guard (calcolato dal wizard)
  cutoutAllowed?: boolean;
  cutoutReason?: string;
};


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const CUTOUT_MIN_BASE = 0.8;

const DEFAULTS: ReliefParams = {
  projectType: "logo_text",
  depthMm: 2,
  baseMm: 1,
  detail: 0.5,
  smooth: 0.5,
  edge: "round",
  outputMode: "relief", // ✅ fisso
  baseStyle: "flat",

  // ✅ CUTOUT default OFF
  cutoutEnabled: false,
};

export default function ReliefControls({ value, onChange, disabled }: Props) {
  const v = { ...DEFAULTS, ...value, outputMode: "relief" as const };

  // ✅ Normalizzazione anti-conflitto: se cutout è ON -> base flat + baseMm >= 0.8
  const set = (patch: Partial<ReliefParams>) => {
    let next: ReliefParams = { ...v, ...patch, outputMode: "relief" };

    if (next.cutoutEnabled) {
      if (next.baseStyle !== "flat") next.baseStyle = "flat";
      if (next.baseMm < CUTOUT_MIN_BASE) next.baseMm = CUTOUT_MIN_BASE;
    }

    onChange(next);
  };

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
            <SelectItem value="logo_text">Logo / Testo (bordi netti)</SelectItem>
            <SelectItem value="human_face">Volto umano (sfumature)</SelectItem>
            <SelectItem value="animal">Animale (texture)</SelectItem>
            <SelectItem value="nature_landscape">
              Natura / Paesaggio (profondità)
            </SelectItem>
            <SelectItem value="decorative_pattern">
              Pattern decorativo (ripetizione)
            </SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-slate-600">
          Suggerimento:{" "}
          <span className="font-medium text-slate-700">Logo/Testo</span> aumenta
          contrasto e bordi;{" "}
          <span className="font-medium text-slate-700">Volto</span> mantiene
          sfumature e volumi.
        </p>
      </div>

      <Separator />

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
            <SelectItem value="offset">Offset</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ✅ Cutout (solo base flat) */}
      {v.baseStyle === "flat" && (
        <div className="space-y-3 rounded-md border bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <Label>Oggetto scontornato (Cutout)</Label>
            <Switch
              disabled={disabled}
              checked={v.cutoutEnabled}
              onCheckedChange={(checked) => set({ cutoutEnabled: checked })}
            />
          </div>

          <p className="text-xs text-slate-600">
            Ricava il contorno dalla{" "}
            <span className="font-medium">heightmap</span> (non dall’immagine) e
            ritaglia lo STL. Supporta anche buchi interni (O, A, R). Ideale per{" "}
            <span className="font-medium">logo/testo</span>. Su foto/paesaggi può
            tagliare male.
          </p>

          {v.cutoutEnabled && (
            <p className="text-xs text-amber-700">
              Cutout richiede{" "}
              <span className="font-medium">spessore base ≥ 0.8 mm</span>. Se
              imposti 0, verrà corretto automaticamente.
            </p>
          )}
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Label>Profondità rilievo (mm): {v.depthMm.toFixed(1)}</Label>
        <Slider
          disabled={disabled}
          value={[v.depthMm]}
          min={0}
          max={20}
          step={0.1}
          onValueChange={(arr) =>
            set({ depthMm: clamp(arr[0] ?? 0, 0, 20) })
          }
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
        <p className="text-xs text-slate-600">
          Se imposti <span className="font-medium text-slate-700">0</span>,
          ottieni solo il rilievo (senza basetta).
        </p>
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

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Bordi arrotondati</Label>
          <Switch
            disabled={disabled}
            checked={v.edge === "round"}
            onCheckedChange={(checked) =>
              set({ edge: checked ? "round" : "sharp" })
            }
          />
        </div>
        <p className="text-xs text-slate-600">
          Attivo = bordi più morbidi. Disattivo = bordi più incisi (più
          “taglienti”).
        </p>
      </div>
    </div>
  );
}
