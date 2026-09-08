import { IconBack } from "../../lib/icons";

interface AuthBackButtonProps {
  onClick: () => void;
  /** Libellé visible — omis uniquement si l'espace disponible l'exige
   * vraiment (corr. Gate Auth navigation §18/§28) : jamais un chevron seul
   * sans texte par défaut, le retour doit être évident pour un utilisateur
   * peu instruit, pas seulement pour quelqu'un qui reconnaît une icône. */
  label?: string;
}

// Bouton Retour PARTAGÉ par tous les écrans du parcours Auth sauf Welcome
// (corr. Gate Auth navigation §18/§19) — jamais `navigate(-1)` (non
// déterministe) : chaque appelant passe sa propre destination explicite.
// Cible tactile >= 44×44px, jamais concurrent visuellement de l'action
// principale de l'écran (couleur neutre, pas de fond plein amber).
export default function AuthBackButton({ onClick, label = "Retour" }: AuthBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      className="flex min-h-11 min-w-11 items-center gap-1.5 self-start rounded-xl px-2 py-2 -ml-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
    >
      <IconBack size={20} className="flex-none" aria-hidden="true" />
      {label && <span>{label}</span>}
    </button>
  );
}
