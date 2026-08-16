import clsx from "clsx";
import { IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import type { FicheChamp } from "../../lib/types";

export default function FicheChampCell({
  label,
  champ,
  onChange,
  onStrike,
  numeric = true,
}: {
  label: string;
  champ: FicheChamp;
  onChange: (valeur: string) => void;
  onStrike: () => void;
  numeric?: boolean;
}) {
  const dernierRaye = champ.historique[champ.historique.length - 1];

  return (
    <label className="flex items-baseline gap-2 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {dernierRaye && (
          <span className="truncate text-[12px] font-semibold text-ink-faint line-through decoration-terracotta decoration-2">
            {dernierRaye}
          </span>
        )}
        <input
          value={champ.valeur}
          onChange={(e) => onChange(e.target.value)}
          inputMode={numeric ? "numeric" : "text"}
          placeholder="—"
          className={clsx(
            "min-w-0 flex-1 bg-transparent text-right text-[15px] font-extrabold tabular-nums outline-none",
            "placeholder:font-normal placeholder:text-ink-faint/40"
          )}
        />
        {champ.valeur && (
          <button
            type="button"
            onClick={() => {
              haptic();
              onStrike();
            }}
            aria-label={`Rayer ${label}`}
            className="flex-none text-ink-faint/70 active:text-terracotta"
          >
            <IconX size={12} />
          </button>
        )}
      </span>
    </label>
  );
}
