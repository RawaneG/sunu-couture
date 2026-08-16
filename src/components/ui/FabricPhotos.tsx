import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { IconCamera, IconX } from "../../lib/icons";
import { PhotoSourceSheet } from "./PhotoCapture";
import { fileToDownscaledDataUrl } from "../../lib/image";
import { haptic } from "../../lib/haptics";
import type { TissuPhoto } from "../../lib/types";

export default function FabricPhotos({
  photos = [],
  onAdd,
  onRemove,
}: {
  photos: TissuPhoto[] | undefined;
  onAdd: (dataUrl: string) => void;
  onRemove: (photoId: string) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<TissuPhoto | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      onAdd(dataUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      <div className="flex flex-wrap gap-1 justify-center">
        <AnimatePresence initial={false}>
          {photos.map((photo) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="relative h-20 w-20 flex-none overflow-hidden rounded-xl"
            >
              <button
                type="button"
                onClick={() => {
                  haptic();
                  setViewing(photo);
                }}
                aria-label="Agrandir la photo"
                className="block h-full w-full"
              >
                <img src={photo.dataUrl} alt="Tissu" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic();
                  onRemove(photo.id);
                }}
                aria-label="Retirer la photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md active:scale-90 transition-transform"
              >
                <IconX size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          disabled={busy}
          onClick={() => {
            haptic();
            setSheetOpen(true);
          }}
          className="glass-chip flex h-20 w-20 flex-none flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line-strong text-ink-faint"
        >
          <IconCamera size={18} />
          <span className="text-[10px] font-bold">{busy ? "…" : "Ajouter"}</span>
        </motion.button>
      </div>

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

      <AnimatePresence>{viewing && <PhotoLightbox photo={viewing} onClose={() => setViewing(null)} />}</AnimatePresence>
    </div>
  );
}

function PhotoLightbox({ photo, onClose }: { photo: TissuPhoto; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <motion.div
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="relative z-10 max-h-full max-w-full"
      >
        <img src={photo.dataUrl} alt="Tissu" className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-lift" />
        <button
          type="button"
          onClick={() => {
            haptic();
            onClose();
          }}
          aria-label="Fermer"
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper shadow-lift"
        >
          <IconX size={16} />
        </button>
      </motion.div>
    </div>,
    document.body
  );
}
