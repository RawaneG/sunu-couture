import { useRef } from "react";
import { motion } from "framer-motion";
import { IconMoon, IconSun, IconLogout } from "../../lib/icons";
import { useTheme } from "../../lib/theme";
import { useOptionalAuth } from "../../lib/auth/AuthProvider";
import { haptic } from "../../lib/haptics";
import BrandMark from "../ui/BrandMark";

export default function MobileBrandBar() {
  const { dark, toggle } = useTheme();
  // Optionnel (jamais `useAuth()`) — ce composant est aussi monté dans des
  // tests qui ne fournissent pas d'`<AuthProvider>` (corr. R, Phase 7A §12) ;
  // le bouton de déconnexion disparaît simplement si le contexte est absent.
  const auth = useOptionalAuth();
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="flex items-center gap-2.5 px-4 pt-5 pb-3 lg:hidden"
    >
      <span className="glass-brand flex h-8 w-8 flex-none items-center justify-center rounded-lg">
        <BrandMark size={21} />
      </span>
      <span className="flex-1 font-display italic font-bold text-lg leading-none">Tayoo</span>
      <motion.button
        ref={btnRef}
        type="button"
        whileTap={{ scale: 0.88, rotate: -12 }}
        onClick={() => {
          haptic();
          const rect = btnRef.current?.getBoundingClientRect();
          toggle(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
        }}
        aria-label="Changer de thème"
        className="glass-chip flex h-11 w-11 items-center justify-center rounded-full text-ink-soft"
      >
        {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
      </motion.button>
      {/* Corr. Jakob's Law §7/§46 — toute app authentifiée a une sortie
          évidente ; aucune n'existait jusqu'ici dans Tayoo côté mobile. */}
      {auth && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => {
            haptic();
            void auth.signOut();
          }}
          aria-label="Se déconnecter"
          className="glass-chip flex h-11 w-11 items-center justify-center rounded-full text-ink-soft"
        >
          <IconLogout size={16} />
        </motion.button>
      )}
    </motion.div>
  );
}
