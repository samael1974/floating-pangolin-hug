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

export type ProjectType =
  | "logo_text"
  | "human_face"
  | "animal"
  | "nature_landscape"
  | "decorative_pattern";

export type EdgeMode = "round" | "sharp";

export type OutputMode = "relief" | "mold";
export type BaseStyle = "flat" | "recessed";

export type ReliefParams = {
  projectType: ProjectType;
  depthMm: number;
  baseMm: number; // can be 0
  detail: number; // 0..1
  smooth: number; // 0..1
  edge: EdgeMode;

  outputMode: OutputMode;
  baseStyle: BaseStyle;
};

type Props = {
  value: ReliefParams;
  onChange: (next: ReliefParams) => void;
  disabled?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function helperFor(t: ProjectType): string {
  switch (t) {
    case "logo_text":
      return "Logo/Testo: meglio bordi netti, poco smoothing, depth moderato per leggibilità.";
    case "human_face":
      return "Volto: smoothing medio-alto e detail controllato per evitare rumore sulla pelle.";
    case "animal":
      return "Animali: detail medio e depth medio per evidenziare pelo/forme senza impastare.";
    case "nature_landscape":
      return "Natura/Paesaggio: smoothing medio e depth più basso per evitare superfici troppo rugose.";
    case "decorative_pattern":
      return "Decorativo/Pattern: depth e edge dipendono dal motivo; puoi spingere su precisione e ripetibilità.";
    default:
      return "";
  }
}

function labelProjectType(t: ProjectType) {
  switch (t) {
    case "logo_text":
      return "Logo / Testo";
    case "human_face":
      return "Volto umano";
    case "animal":
      return "Animali";
    case "nature_landscape":
      return "Natura / Paesaggio";
    case "decorative_pattern":
      return "Decorativo / Pattern";
  }
}

export default function ReliefControls({ value, onChange, disabled }: Props) {
  const helper = helperFor(value.projectType);

  function set<K extends keyof ReliefParams>(key: K, v: ReliefParams[K]) {
    onChange({ ...value, [key]: v });
  }

  // Guardrail UX:
  // se passi a "Stampo" e sei su base "flat", ti porto a "recessed"
  function setOutputMode(next: OutputMode) {
    if (next === "mold" && value.baseStyle === "flat") {
      onChange({ ...value, outputMode: next, baseStyle: "recessed" });
      return;
    }
    onChange({ ...value, outputMode: next });
  }

  const modeHint =
    value.outputMode === "mold"
      ? "Stampo: genera un negativo/cavità (utile per pressare o colate)."
      : "Bassorilievo: genera un rilievo positivo stampabile.";

  const baseHint =
    value.baseStyle === "recessed"
      ? "Base scavata: crea una cavità (più utile in modalità Stampo)."
      : "Base piana: fondo piatto (standard per stampe 3D).";

  return (
    <div className="rounded-lg bg-white p-6 shadow space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">2) Parametri bassorilievo</h2>
        <p className="text-sm text-gray-600">{helper}</p>
      </div>

      <Separator />

      {/* Project type */}
      <div className="space-y-2">
        <Label>Tipo progetto</Label>
        <Select
          disabled={disabled}
          value={value.projectType}
          onValueChange={(v) => set("projectType", v as ProjectType)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleziona un tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="logo_text">
              {labelProjectType("logo_text")}
            </SelectItem>
            <SelectItem value="human_face">
              {labelProjectType("human_face")}
            </SelectItem>
            <SelectItem value="animal">{labelProjectType("animal")}</SelectItem>
            <SelectItem value="nature_landscape">
              {labelProjectType("nature_landscape")}
            </SelectItem>
            <SelectItem value="decorative_pattern">
              {labelProjectType("decorative_pattern")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Sliders grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Depth */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Depth massimo (mm)</Label>
            <div className="text-sm tabular-nums text-gray-700">
              {value.depthMm.toFixed(1)}
            </div>
          </div>
          <Slider
            disabled={disabled}
            value={[value.depthMm]}
            min={0.5}
            max={8}
            step={0.1}
            onValueChange={(v) => set("depthMm", clamp(v[0] ?? 3, 0.5, 8))}
          />
          <p className="text-xs text-gray-500">
            Consiglio stampa: 2.0–4.0 mm per la maggior parte dei bassorilievi.
          </p>
        </div>

        {/* Base thickness (allows 0) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Spessore base (mm)</Label>
            <div className="text-sm tabular-nums text-gray-700">
              {value.baseMm.toFixed(1)}
            </div>
          </div>
          <Slider
            disabled={disabled}
            value={[value.baseMm]}
            min={0}
            max={8}
            step={0.1}
            onValueChange={(v) => set("baseMm", clamp(v[0] ?? 2, 0, 8))}
          />
          <p className="text-xs text-gray-500">
            0.0 mm = nessuna base (rilievo “appoggiato”). Consigliato: 1.5–2.5
            mm.
          </p>
        </div>

        {/* Detail */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Dettaglio</Label>
            <div className="text-sm tabular-nums text-gray-700">
              {value.detail.toFixed(2)}
            </div>
          </div>
          <Slider
            disabled={disabled}
            value={[value.detail]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(v) => set("detail", clamp(v[0] ?? 0.5, 0, 1))}
          />
          <p className="text-xs text-gray-500">
            Aumenta micro-contrasto. Troppo alto può creare rumore e STL pesante.
          </p>
        </div>

        {/* Smooth */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Smoothing</Label>
            <div className="text-sm tabular-nums text-gray-700">
              {value.smooth.toFixed(2)}
            </div>
          </div>
          <Slider
            disabled={disabled}
            value={[value.smooth]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(v) => set("smooth", clamp(v[0] ?? 0.5, 0, 1))}
          />
          <p className="text-xs text-gray-500">
            Riduce rugosità. Per volti spesso 0.5–0.8 funziona bene.
          </p>
        </div>
      </div>

      <Separator />

      {/* Edge mode */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label>Bordi netti</Label>
          <p className="text-xs text-gray-500">
            Attiva per loghi/testi. Disattiva per soggetti organici.
          </p>
        </div>

        <Switch
          disabled={disabled}
          checked={value.edge === "sharp"}
          onCheckedChange={(checked) => set("edge", checked ? "sharp" : "round")}
        />
      </div>

      <Separator />

      {/* Output + Base style */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Modalità output</Label>
          <Select
            disabled={disabled}
            value={value.outputMode}
            onValueChange={(v) => setOutputMode(v as OutputMode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relief">Bassorilievo (positivo)</SelectItem>
              <SelectItem value="mold">Stampo (negativo)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">{modeHint}</p>
        </div>

        <div className="space-y-2">
          <Label>Base</Label>
          <Select
            disabled={disabled}
            value={value.baseStyle}
            onValueChange={(v) => set("baseStyle", v as BaseStyle)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Piana (standard)</SelectItem>
              <SelectItem value="recessed">Scavata (cavità)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">{baseHint}</p>
        </div>
      </div>
    </div>
  );
}
