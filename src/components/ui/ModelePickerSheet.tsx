import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useModeles } from "../../repositories/hooks";
import ModeleGrid from "./ModeleGrid";
import { IconScissors } from "../../lib/icons";
import { haptic } from "../../lib/haptics";
import type { Modele } from "../../lib/types";

/**
 * Bottom sheet used from a fiche's photo section — tapping a modèle drops its
 * look photos and its patron de coupe straight into that fiche's photos, in
 * one tap, and closes. No typing, no intermediate confirmation screen.
 */
export default function ModelePickerSheet({ onSelect, onClose }: { onSelect: (modele: Modele) => void; onClose: () => void }) {
  const modeles = useModeles().filter((m) => m.photos.length > 0 || m.patronPhotos.length > 0);

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
        <p className="px-2 pb-2 pt-1 text-[13px] font-bold text-ink-soft">Choisir un modèle</p>

        {modeles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-ink-faint">
            <IconScissors size={22} />
            <p className="text-center text-[12.5px] font-semibold">Le catalogue est vide.</p>
            <Link
              to="/catalogue/nouveau"
              onClick={() => haptic()}
              className="mt-1 rounded-full bg-amber-tile px-3.5 py-2 text-[12.5px] font-bold text-[#2a1c04] shadow-soft"
            >
              Ajouter un modèle
            </Link>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto px-1">
            <ModeleGrid modeles={modeles} onSelect={onSelect} />
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            haptic();
            onClose();
          }}
          className="glass-chip mt-2 flex w-full items-center justify-center rounded-2xl px-4 py-3 text-[14px] font-bold text-ink-soft active:scale-[0.98] transition-transform"
        >
          Annuler
        </button>
      </motion.div>
    </div>,
    document.body
  );
}
