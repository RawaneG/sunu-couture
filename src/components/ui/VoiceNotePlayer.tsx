import { useRef, useState } from "react";
import clsx from "clsx";
import { IconPlay, IconPause, IconMic } from "../../lib/icons";
import { formatDuration } from "../../lib/format";
import type { VoiceNote } from "../../lib/types";

const BAR_HEIGHTS = [5, 12, 8, 16, 6, 11, 4, 14, 7, 10, 5, 13];

export default function VoiceNotePlayer({ note }: { note: VoiceNote | null }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!note) {
    return (
      <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 text-ink-faint">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface-3">
          <IconMic size={16} />
        </span>
        <span className="text-sm font-semibold">Aucune note vocale</span>
      </div>
    );
  }

  return (
    <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
      <audio
        ref={audioRef}
        src={note.url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo text-white"
        aria-label={playing ? "Pause" : "Écouter la note vocale"}
      >
        {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
      </button>
      <span className="flex flex-1 items-end gap-0.5 h-5">
        {BAR_HEIGHTS.map((h, i) => (
          <span key={i} className={clsx("w-0.5 rounded-full bg-ink-faint", playing && "bg-indigo")} style={{ height: h }} />
        ))}
      </span>
      <span className="text-xs font-bold text-ink-faint tabular-nums">{formatDuration(note.duration)}</span>
    </div>
  );
}
