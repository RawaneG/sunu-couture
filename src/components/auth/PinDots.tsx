// Retour visuel du PIN saisi — jamais le chiffre affiché (corr. Gate Auth
// §15). Purement décoratif pour un lecteur d'écran (les points seuls ne
// portent pas l'info, corr. §51) : le compte réel est porté par un texte
// visuellement masqué mais annoncé (`aria-live="polite"`), à côté.
interface PinDotsProps {
  length: number;
  filled: number;
}

export default function PinDots({ length, filled }: PinDotsProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-4" aria-hidden="true">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={
              "h-4 w-4 rounded-full border-2 border-amber-tile transition-colors duration-150 " +
              (i < filled ? "bg-amber-tile" : "bg-transparent")
            }
          />
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {filled} sur {length} chiffres saisis
      </span>
    </div>
  );
}
