import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { IconAlert } from "../../lib/icons";
import { haptic } from "../../lib/haptics";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:items-center lg:pb-4">
      <motion.div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-line-strong/30 bg-surface/95 p-5 text-center shadow-lift backdrop-blur-2xl backdrop-saturate-150"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <span
          className={
            "mx-auto flex h-12 w-12 items-center justify-center rounded-full " +
            (destructive ? "bg-terracotta/12 text-terracotta" : "bg-indigo-tint text-indigo")
          }
        >
          <IconAlert size={22} />
        </span>
        <p id="confirm-dialog-title" className="mt-3 font-display italic font-bold text-lg text-balance">
          {title}
        </p>
        {description && <p className="mt-1.5 text-[13px] text-ink-faint text-balance">{description}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              haptic();
              onClose();
            }}
            className="flex-1 rounded-2xl bg-surface-3 px-4 py-3 text-[13.5px] font-bold text-ink active:scale-[0.98] transition-transform"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic(14);
              onConfirm();
            }}
            className={
              "flex-1 rounded-2xl px-4 py-3 text-[13.5px] font-bold text-white active:scale-[0.98] transition-transform " +
              (destructive ? "bg-terracotta" : "bg-indigo")
            }
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
