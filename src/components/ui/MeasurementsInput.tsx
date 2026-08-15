import { useState } from "react";
import clsx from "clsx";
import VoiceRecorder from "./VoiceRecorder";
import { IconMic, IconPencil } from "../../lib/icons";
import type { VoiceNote } from "../../lib/types";

export default function MeasurementsInput({
  voiceValue,
  onVoiceChange,
  textValue,
  onTextChange,
  label = "mesures",
}: {
  voiceValue: VoiceNote | null;
  onVoiceChange: (v: VoiceNote | null) => void;
  textValue: string;
  onTextChange: (v: string) => void;
  label?: string;
}) {
  const [mode, setMode] = useState<"voice" | "text">(voiceValue || !textValue ? "voice" : "text");

  return (
    <div>
      <div className="glass-chip mb-2 inline-flex rounded-full p-1">
        <button
          type="button"
          onClick={() => setMode("voice")}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
            mode === "voice" ? "bg-indigo text-white" : "text-ink-soft"
          )}
        >
          <IconMic size={13} />
          Dicter
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={clsx(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors",
            mode === "text" ? "bg-indigo text-white" : "text-ink-soft"
          )}
        >
          <IconPencil size={13} />
          Écrire
        </button>
      </div>

      {mode === "voice" ? (
        <VoiceRecorder value={voiceValue} onChange={onVoiceChange} label={label} />
      ) : (
        <textarea
          value={textValue}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Ex : épaule 44, poitrine 96, longueur 110"
          rows={3}
          className="glass-input w-full resize-none rounded-2xl px-4 py-3 text-sm font-semibold outline-none placeholder:font-normal placeholder:text-ink-faint focus:bg-surface-3"
        />
      )}
    </div>
  );
}
