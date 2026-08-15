import { useRef, useState } from "react";
import clsx from "clsx";
import { IconCamera, IconX } from "../../lib/icons";
import ImageCropper from "./ImageCropper";

export default function PhotoCapture({
  value,
  onChange,
  label = "Photo",
  crop = false,
  shape = "rect",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  crop?: boolean;
  shape?: "rect" | "circle";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (crop) {
      setPendingSrc(url);
    } else {
      if (value) URL.revokeObjectURL(value);
      onChange(url);
    }
    e.target.value = "";
  }

  function remove() {
    if (value) URL.revokeObjectURL(value);
    onChange(null);
  }

  const circle = shape === "circle";

  return (
    <div className={clsx("relative", circle && "flex justify-center")}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      {value ? (
        <div
          className={clsx("relative overflow-hidden", circle ? "h-28 w-28 rounded-full" : "h-40 w-full rounded-2xl")}
        >
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={remove}
            className={clsx(
              "absolute flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur",
              circle ? "bottom-0 right-0" : "right-2.5 top-2.5"
            )}
            aria-label="Retirer la photo"
          >
            <IconX size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line-strong bg-surface-2 text-ink-faint hover:bg-surface-3 transition-colors",
            circle ? "h-28 w-28 rounded-full" : "h-40 w-full rounded-2xl"
          )}
        >
          <IconCamera size={circle ? 20 : 26} />
          <span className="text-xs font-bold">{label}</span>
        </button>
      )}

      {pendingSrc && (
        <ImageCropper
          src={pendingSrc}
          shape={circle ? "circle" : "square"}
          onCancel={() => {
            URL.revokeObjectURL(pendingSrc);
            setPendingSrc(null);
          }}
          onConfirm={(dataUrl) => {
            URL.revokeObjectURL(pendingSrc);
            setPendingSrc(null);
            if (value) URL.revokeObjectURL(value);
            onChange(dataUrl);
          }}
        />
      )}
    </div>
  );
}
