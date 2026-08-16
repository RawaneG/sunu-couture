import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const historyRef = useRef<HTMLSpanElement>(null);
  const hasHistory = champ.historique.length > 0;
  const dernierRaye = champ.historique.at(-1);

  // The field's value (and thus its history) can change for reasons unrelated to
  // the popover — typing, a strike, a restore triggered elsewhere — any of which
  // should close it rather than leave a stale "ancienne valeur" open over a field
  // that no longer matches what it's showing.
  useEffect(() => {
    setHistoryOpen(false);
  }, [champ.valeur, hasHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [historyOpen]);

  return (
    <label className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-1.5">
        {hasHistory && (
          <span ref={historyRef} className="relative flex-none">
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

            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                  className="absolute left-0 top-full z-30 mt-3 w-max max-w-[min(200px,68vw)] origin-top-left rounded-2xl bg-ink p-2.5 text-paper shadow-lift"
                >
                  <span className="absolute -top-1.75 left-2.5 h-0 w-0 -translate-x-1/2 border-x-1.5 border-b-1.75 border-x-transparent border-b-ink" />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-paper/55">Ancienne valeur</p>
                  <p className="mt-0.5 wrap-break-word text-[14px] font-bold line-through decoration-terracotta decoration-2">
                    {dernierRaye}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      onRestore();
                      setHistoryOpen(false);
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-paper/10 px-3 py-1.5 text-[12px] font-bold active:bg-paper/20"
                  >
                    <IconRotateCcw size={12} strokeWidth={2.2} />
                    Restaurer
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </span>
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
    </label>
  );
}
