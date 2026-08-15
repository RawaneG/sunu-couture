import clsx from "clsx";
import { formatFCFA } from "../../lib/format";

const PRESETS = [5000, 10000, 15000, 25000, 50000];

export default function PriceInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  function handleInput(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    onChange(digits ? Math.min(9999999, parseInt(digits, 10)) : 0);
  }

  return (
    <div>
      <div className="glass-input flex items-center gap-2 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo">
        <input
          type="text"
          inputMode="numeric"
          value={value ? formatFCFA(value) : ""}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="0"
          className="w-full min-w-0 bg-transparent text-xl font-extrabold tabular-nums outline-none placeholder:text-ink-faint"
        />
        <span className="flex-none text-[11px] font-bold uppercase text-ink-faint">FCFA</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
              value === p ? "bg-indigo text-white" : "glass-chip text-ink-soft hover:bg-surface-3"
            )}
          >
            {formatFCFA(p)}
          </button>
        ))}
      </div>
    </div>
  );
}
