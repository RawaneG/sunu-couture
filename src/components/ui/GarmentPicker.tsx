import { useState } from "react";
import clsx from "clsx";
import {
  IconGarmentBoubou,
  IconGarmentEnsemble,
  IconGarmentRobe,
  IconGarmentChemise,
  IconGarmentPantalon,
  IconGarmentVeste,
  IconGarmentJupe,
  IconPlus,
} from "../../lib/icons";

const GARMENTS = [
  { label: "Boubou", icon: IconGarmentBoubou },
  { label: "Ensemble", icon: IconGarmentEnsemble },
  { label: "Robe", icon: IconGarmentRobe },
  { label: "Chemise", icon: IconGarmentChemise },
  { label: "Pantalon", icon: IconGarmentPantalon },
  { label: "Veste", icon: IconGarmentVeste },
  { label: "Jupe", icon: IconGarmentJupe },
];

export default function GarmentPicker({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const presetMatch = GARMENTS.some((g) => g.label === value);
  const [customMode, setCustomMode] = useState(!presetMatch && value !== "");

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {GARMENTS.map((g) => {
          const selected = !customMode && value === g.label;
          const Icon = g.icon;
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => {
                setCustomMode(false);
                onChange(g.label);
              }}
              className={clsx(
                "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl transition-colors",
                selected ? "bg-indigo text-white" : "glass-chip text-ink-soft hover:bg-surface-3"
              )}
            >
              <Icon size={22} strokeWidth={1.6} />
              <span className="text-[10.5px] font-bold">{g.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true);
            onChange("");
          }}
          className={clsx(
            "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl transition-colors",
            customMode ? "bg-indigo text-white" : "glass-chip text-ink-soft hover:bg-surface-3"
          )}
        >
          <IconPlus size={20} />
          <span className="text-[10.5px] font-bold">Autre</span>
        </button>
      </div>
      {customMode && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Précisez le vêtement"
          className="glass-input mt-2.5 w-full rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none placeholder:text-ink-faint focus:bg-surface-3"
        />
      )}
    </div>
  );
}
