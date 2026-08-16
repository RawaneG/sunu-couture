import { useEffect, useState } from "react";
import clsx from "clsx";
import { IconClock, IconRotateCcw, IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { sanitizeMeasurement } from "../../lib/format";
import type { FicheChamp } from "../../lib/types";

export default function FicheChampCell({
  label,
  champ,
  onChange,
  onStrike,
  onRestore,
  numeric = true,
}: {
  label: string;
  champ: FicheChamp;
  onChange: (valeur: string) => void;
  onStrike: () => void;
  onRestore: () => void;
  numeric?: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const hasHistory = champ.historique.length > 0;
  const dernierRaye = champ.historique.at(-1);

  useEffect(() => {
    if (!hasHistory) setHistoryOpen(false);
  }, [hasHistory]);

  return (
    <label className="relative flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-1.5">
        {hasHistory && (
          <button
            type="button"
            onClick={() => {
              haptic();
              setHistoryOpen((v) => !v);
            }}
            aria-label={`Historique de ${label}`}
            aria-expanded={historyOpen}
            className={clsx(
              "flex h-5 w-5 flex-none items-center justify-center rounded-full transition-colors",
              historyOpen ? "bg-terracotta text-white" : "bg-terracotta/10 text-terracotta"
            )}
          >
            <IconClock size={11} strokeWidth={2} />
          </button>
        )}
        <input
          value={champ.valeur}
          onChange={(e) => onChange(numeric ? sanitizeMeasurement(e.target.value) : e.target.value)}
          inputMode={numeric ? "decimal" : "text"}
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
            aria-label={`Effacer ${label}`}
            className="flex-none text-ink-faint/70 active:text-terracotta"
          >
            <IconX size={12} />
          </button>
        )}
      </span>

      {historyOpen && hasHistory && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setHistoryOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute right-0 top-full z-30 mt-1 w-[min(240px,80vw)] rounded-2xl border border-line-strong/30 bg-ink text-paper p-3 shadow-lift">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-paper/60">Ancienne valeur</p>
            <p className="mt-1 wrap-break-word text-[14px] font-bold line-through decoration-terracotta decoration-2">
              {dernierRaye}
            </p>
            <button
              type="button"
              onClick={() => {
                haptic();
                onRestore();
                setHistoryOpen(false);
              }}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-paper/10 px-3 py-1.5 text-[12px] font-bold active:bg-paper/20"
            >
              <IconRotateCcw size={12} strokeWidth={2.2} />
              Restaurer
            </button>
          </div>
        </>
      )}
    </label>
  );
}
