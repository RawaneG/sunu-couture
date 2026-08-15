import { useState } from "react";
import clsx from "clsx";
import DayPicker from "./DayPicker";
import { IconCalendar } from "../../lib/icons";
import { formatFullDate, toDateInputValue, fromDateInputValue } from "../../lib/format";

export default function DueDatePicker({
  dueDate,
  dueDateStart,
  onChange,
}: {
  dueDate: string;
  dueDateStart: string | null;
  onChange: (dueDate: string, dueDateStart: string | null) => void;
}) {
  const [mode, setMode] = useState<"single" | "range">(dueDateStart ? "range" : "single");
  const today = toDateInputValue(new Date().toISOString());

  function switchMode(next: "single" | "range") {
    setMode(next);
    if (next === "single") onChange(dueDate, null);
    else if (!dueDateStart) onChange(dueDate, dueDate);
  }

  function handleStartChange(iso: string) {
    const end = new Date(iso) > new Date(dueDate) ? iso : dueDate;
    onChange(end, iso);
  }

  function handleEndChange(iso: string) {
    const start = dueDateStart && new Date(dueDateStart) > new Date(iso) ? iso : dueDateStart;
    onChange(iso, start);
  }

  return (
    <div>
      <div className="glass-chip mb-2.5 inline-flex rounded-full p-1">
        <button
          type="button"
          onClick={() => switchMode("single")}
          className={clsx(
            "rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
            mode === "single" ? "bg-indigo text-white" : "text-ink-soft"
          )}
        >
          Date précise
        </button>
        <button
          type="button"
          onClick={() => switchMode("range")}
          className={clsx(
            "rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
            mode === "range" ? "bg-indigo text-white" : "text-ink-soft"
          )}
        >
          Plage de dates
        </button>
      </div>

      {mode === "single" ? (
        <div className="flex flex-col gap-2.5">
          <DayPicker value={dueDate} onChange={(iso) => onChange(iso, null)} days={14} />
          <label className="glass-chip relative flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-bold text-ink-soft">
            <IconCalendar size={14} />
            Autre date · {formatFullDate(dueDate)}
            <input
              type="date"
              min={today}
              value={toDateInputValue(dueDate)}
              onChange={(e) => e.target.value && onChange(fromDateInputValue(e.target.value), null)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choisir une autre date de livraison"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <DateField label="Du" value={dueDateStart ?? dueDate} min={today} onChange={handleStartChange} />
          <DateField label="Au" value={dueDate} min={dueDateStart ?? today} onChange={handleEndChange} />
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (iso: string) => void;
}) {
  return (
    <label className="glass-chip relative block rounded-2xl px-4 py-3">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="mt-0.5 block text-[13.5px] font-extrabold">{formatFullDate(value)}</span>
      <input
        type="date"
        value={toDateInputValue(value)}
        min={min ? toDateInputValue(min) : undefined}
        onChange={(e) => e.target.value && onChange(fromDateInputValue(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}
