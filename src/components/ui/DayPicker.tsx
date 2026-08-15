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
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const DAYS = useMemo(() => nextDays(days), [days]);

  useEffect(() => {
    // Scroll only this strip's own horizontal axis via scrollLeft, never
    // scrollIntoView — that cascades up through every scrollable ancestor
    // (including the window itself), yanking the whole page down to reveal
    // a picker that's simply lower on the page.
    const container = containerRef.current;
    const button = selectedRef.current;
    if (!container || !button) return;
    const target = button.offsetLeft - container.clientWidth / 2 + button.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [value]);

  return (
    <div ref={containerRef} className="flex gap-2 overflow-x-auto no-scrollbar pt-2 -mt-2 pb-1 -mx-1 px-1">
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
