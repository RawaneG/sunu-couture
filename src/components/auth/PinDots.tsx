import { motion, useReducedMotion } from "framer-motion";

// Retour visuel du PIN saisi — jamais le chiffre affiché (corr. Gate Auth
// §15). Purement décoratif pour un lecteur d'écran (les points seuls ne
// portent pas l'info, corr. §51) : le compte réel est porté par un texte
// visuellement masqué mais annoncé (`aria-live="polite"`), à côté.
interface PinDotsProps {
  length: number;
  filled: number;
}

export default function PinDots({ length, filled }: PinDotsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-5" aria-hidden="true">
        {Array.from({ length }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <motion.span
              key={i}
              animate={isFilled && !reducedMotion ? { scale: [0.5, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="block rounded-full"
              style={{
                width: 18,
                height: 18,
                background: isFilled ? "var(--color-amber-tile)" : "transparent",
                border: isFilled ? "none" : "2px solid var(--color-line-strong)",
                boxShadow: isFilled
                  ? "0 0 0 5px color-mix(in oklab, var(--color-amber-tile) 20%, transparent), 0 2px 10px -2px rgba(214, 154, 52, 0.65)"
                  : "none",
              }}
            />
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {filled} sur {length} chiffres saisis
      </span>
    </div>
  );
}
