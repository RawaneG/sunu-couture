import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { formatDay, nextDays } from "../../lib/format";
import { IconCheck } from "../../lib/icons";

export default function DayPicker({
  value,
  onChange,
  days = 30,
}: {
  value: string;
  onChange: (iso: string) => void;
  days?: number;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const DAYS = useMemo(() => nextDays(days), [days]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 -mt-2 pb-1 -mx-1 px-1">
      {DAYS.map((iso) => {
        const { num, label } = formatDay(iso);
        const selected = iso.slice(0, 10) === value.slice(0, 10);
        return (
          <button
            key={iso}
            ref={selected ? selectedRef : undefined}
            type="button"
            onClick={() => onChange(iso)}
            aria-pressed={selected}
            className={clsx(
              "relative flex w-14 flex-none flex-col items-center gap-0.5 rounded-2xl py-2.5 border-2 transition-colors",
              selected
                ? "bg-indigo border-indigo text-white"
                : "glass-chip border-transparent text-ink hover:bg-surface-3"
            )}
          >
            {selected && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal text-white ring-2 ring-surface">
                <IconCheck size={9} strokeWidth={3} />
              </span>
            )}
            <span className="text-base font-extrabold tabular-nums">{num}</span>
            <span className={clsx("text-[9px] font-bold uppercase tracking-wide", selected ? "text-white/70" : "text-ink-faint")}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
