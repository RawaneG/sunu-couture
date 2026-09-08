import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { IconLock } from "../../lib/icons";
import AuthBackButton from "./AuthBackButton";

// Coquille visuelle commune aux écrans PIN (CreatePinFlow/PinLogin) — mêmes
// proportions/relief que Welcome/PhoneEntry pour une identité cohérente sur
// tout le parcours (corr. design review post-implémentation pivot PIN).
interface PinScreenCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Retour déterministe (corr. Gate Auth navigation §18/§19) — omis
   * uniquement sur un écran qui n'en a structurellement pas besoin. */
  onBack?: () => void;
}

export default function PinScreenCard({ title, subtitle, children, onBack }: PinScreenCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
      <div className="glass-card rounded-4xl shadow-lift p-8 lg:p-11 flex flex-col items-center gap-7 text-center">
        {onBack && (
          <div className="flex w-full">
            <AuthBackButton onClick={onBack} />
          </div>
        )}
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full text-amber-tile"
          style={{ background: "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--color-amber-tile) 30%, transparent), color-mix(in oklab, var(--color-amber-tile) 12%, transparent))" }}
        >
          <IconLock size={26} />
        </span>

        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <div className="mt-2 text-sm text-ink-soft">{subtitle}</div>}
        </div>

        {children}
      </div>
    </motion.div>
  );
}
