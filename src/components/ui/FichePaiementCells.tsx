import clsx from "clsx";
import { IconX } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import { formatFCFA } from "../../lib/format";

/** Same row shape/typography/interaction as FicheChampCell — Prix/Avance/Reste sit in the
 * exact table position they occupy on the paper sheet. Prix and Avance are typed directly,
 * just like every other champ; Reste is the one cell that's never editable, since it's
 * always derived so the tailor never has to recompute it by hand. */

function MontantChampCell({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  function handleInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    onChange(digits ? Math.min(9999999, parseInt(digits, 10)) : 0);
  }
  return (
    <label className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">{label}</span>
      <span className="flex min-w-22 flex-1 items-center justify-end gap-1.5">
        <input
          value={value ? formatFCFA(value) : ""}
          onChange={(e) => handleInput(e.target.value)}
          inputMode="numeric"
          placeholder="—"
          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-extrabold tabular-nums outline-none placeholder:font-normal placeholder:text-ink-faint/40"
        />
        {value > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic();
              onChange(0);
            }}
            aria-label={`Effacer ${label.toLowerCase()}`}
            className="flex-none text-ink-faint/70 active:text-terracotta"
          >
            <IconX size={12} />
          </button>
        )}
      </span>
    </label>
  );
}

export function PrixChampCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <MontantChampCell label="Prix" value={value} onChange={onChange} />;
}

export function AvanceChampCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <MontantChampCell label="Avance" value={value} onChange={onChange} />;
}

export function ResteChampCell({ reste }: { reste: number }) {
  const solde = reste <= 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dotted border-line-strong py-2.5">
      <span className="flex-none text-[13px] font-bold text-ink-soft">Reste</span>
      <span
        className={clsx(
          "flex-1 text-right text-[15px] font-extrabold tabular-nums",
          solde ? "text-teal" : "text-terracotta"
        )}
      >
        {formatFCFA(Math.max(reste, 0))}
      </span>
    </div>
  );
}
