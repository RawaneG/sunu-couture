import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { motion } from "framer-motion";
import { IconCamera, IconImage, IconX } from "../../lib/icons";
import ImageCropper from "./ImageCropper";
import { haptic } from "../../lib/haptics";

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
    haptic();
    if (value) URL.revokeObjectURL(value);
    onChange(null);
  }

  function openSheet() {
    haptic();
    setSheetOpen(true);
  }

  const circle = shape === "circle";

  return (
    <div className={clsx("relative", circle && "flex justify-center")}>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {value ? (
        <div className={clsx("relative", circle ? "h-28 w-28" : "h-40 w-full")}>
          <div
            className={clsx("h-full w-full overflow-hidden", circle ? "rounded-full" : "rounded-2xl")}
          >
            <img src={value} alt="" className="h-full w-full object-cover" />
          </div>
          <button
            type="button"
            onClick={remove}
            className={clsx(
              "absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md active:scale-90 transition-transform",
              circle ? "-bottom-1 -right-1" : "right-2.5 top-2.5"
            )}
            aria-label="Retirer la photo"
          >
            <IconX size={15} />
          </button>
        </div>
      ) : (
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={openSheet}
          className={clsx(
            "glass-chip flex flex-col items-center justify-center gap-2 border-2 border-dashed border-line-strong text-ink-faint transition-colors",
            circle ? "h-28 w-28 rounded-full" : "h-40 w-full rounded-2xl"
          )}
        >
          <IconCamera size={circle ? 20 : 26} />
          <span className="text-xs font-bold">{label}</span>
        </motion.button>
      )}

      {sheetOpen && (
        <PhotoSourceSheet
          onCamera={() => {
            setSheetOpen(false);
            cameraInputRef.current?.click();
          }}
          onGallery={() => {
            setSheetOpen(false);
            galleryInputRef.current?.click();
          }}
          onClose={() => setSheetOpen(false)}
        />
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

export function PhotoSourceSheet({
  onCamera,
  onGallery,
  onClose,
}: {
  onCamera: () => void;
  onGallery: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        className="relative z-10 w-full max-w-sm rounded-t-3xl border border-line-strong/40 bg-surface/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lift backdrop-blur-2xl backdrop-saturate-150 lg:rounded-3xl lg:pb-3"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line-strong lg:hidden" />
        <p className="px-3 pb-2 pt-1 text-[13px] font-bold text-ink-soft">Ajouter une photo</p>
        <SheetOption icon={<IconCamera size={18} />} label="Prendre une photo" onClick={onCamera} />
        <SheetOption icon={<IconImage size={18} />} label="Choisir depuis la galerie" onClick={onGallery} />
        <button
          type="button"
          onClick={onClose}
          className="glass-chip mt-1.5 flex w-full items-center justify-center rounded-2xl px-4 py-3 text-[14px] font-bold text-ink-soft active:scale-[0.98] transition-transform"
        >
          Annuler
        </button>
      </motion.div>
    </div>,
    document.body
  );
}

function SheetOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        haptic();
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-surface-2 active:bg-surface-2 transition-colors"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-tint text-indigo">
        {icon}
      </span>
      <span className="text-[14px] font-bold">{label}</span>
    </motion.button>
  );
}
