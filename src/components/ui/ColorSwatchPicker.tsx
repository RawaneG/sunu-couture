import { IconCheck } from "../../lib/icons";

export default function ColorSwatchPicker({
  value,
  onChange,
  detected,
}: {
  value: string;
  onChange: (hex: string) => void;
  detected: boolean;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <label className="relative flex-none">
        <span
          className="block h-14 w-14 rounded-full ring-2 ring-offset-2 ring-offset-surface ring-line-strong"
          style={{ background: value }}
        />
        {detected && (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-teal text-white ring-2 ring-surface">
            <IconCheck size={12} strokeWidth={2.4} />
          </span>
        )}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Choisir la couleur du tissu"
        />
      </label>
      <div className="min-w-0">
        <p className="text-[13px] font-bold uppercase tracking-wide">{value}</p>
        <p className="text-[12px] text-ink-faint">
          {detected ? "Détectée depuis la photo · touchez pour ajuster" : "Touchez le rond pour choisir"}
        </p>
      </div>
    </div>
  );
}
