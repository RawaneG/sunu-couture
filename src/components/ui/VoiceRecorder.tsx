import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { IconMic, IconPlay, IconPause, IconStop, IconTrash } from "../../lib/icons";
import { formatDuration } from "../../lib/format";
import type { VoiceNote } from "../../lib/types";

const BAR_HEIGHTS = [5, 12, 8, 16, 6, 11, 4, 14, 7, 10, 5, 13];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceRecorder({
  value,
  onChange,
  label = "Mesures",
  persist = false,
}: {
  value: VoiceNote | null;
  onChange: (v: VoiceNote | null) => void;
  label?: string;
  /** Store the recording as a persistent data URL instead of a session-only blob URL. */
  persist?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = persist ? await blobToDataUrl(blob) : URL.createObjectURL(blob);
        onChange({ url, duration: elapsedRef.current, recordedAt: new Date().toISOString() });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsed((e) => e + 1);
      }, 1000);
    } catch {
      setError("Micro indisponible — vérifiez l'autorisation.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  function remove() {
    if (value?.url.startsWith("blob:")) URL.revokeObjectURL(value.url);
    onChange(null);
    setPlaying(false);
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="flex w-full items-center gap-3 rounded-2xl bg-terracotta-tint px-4 py-3 text-left"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-terracotta text-white animate-pulse">
          <IconStop size={16} />
        </span>
        <span className="flex-1 flex items-end gap-0.5 h-5">
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className="w-0.5 rounded-full bg-terracotta animate-pulse"
              style={{ height: h, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </span>
        <span className="text-xs font-bold text-terracotta tabular-nums">{formatDuration(elapsed)}</span>
      </button>
    );
  }

  if (value) {
    return (
      <div className="glass-card flex w-full items-center gap-3 rounded-2xl px-4 py-3">
        <audio
          ref={audioRef}
          src={value.url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo text-white"
          aria-label={playing ? "Pause" : "Écouter"}
        >
          {playing ? <IconPause size={15} /> : <IconPlay size={15} />}
        </button>
        <span className="flex-1 flex items-end gap-0.5 h-5">
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={clsx("w-0.5 rounded-full bg-ink-faint", playing && "bg-indigo")}
              style={{ height: h }}
            />
          ))}
        </span>
        <span className="text-xs font-bold text-ink-faint tabular-nums">{formatDuration(value.duration)}</span>
        <button
          type="button"
          onClick={remove}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-ink-faint hover:text-terracotta hover:bg-terracotta-tint"
          aria-label="Supprimer la note vocale"
        >
          <IconTrash size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={startRecording}
        className="glass-card flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-surface-3 transition-colors"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-terracotta text-white">
          <IconMic size={16} />
        </span>
        <span className="flex-1 text-sm font-bold text-ink-soft">Enregistrer — {label}</span>
      </button>
      {error && <p className="mt-1.5 text-xs font-semibold text-terracotta">{error}</p>}
    </div>
  );
}
