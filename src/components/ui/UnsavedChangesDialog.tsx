import ConfirmDialog from "./ConfirmDialog";

// Confirmation AVANT perte de saisie (corr. Jakob's Law §15) — uniquement
// affichée quand le formulaire a réellement des modifications non
// enregistrées ; un formulaire vierge revient en arrière immédiatement, sans
// cette boîte de dialogue (voir chaque appelant : ClientNew/FicheNew/ModeleNew).
// Wording fixe et partagé — jamais reformulé différemment d'un écran à l'autre.
export default function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  /** L'utilisateur choisit de rester et continuer sa saisie. */
  onStay: () => void;
  /** L'utilisateur choisit de quitter — les modifications sont perdues. */
  onLeave: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Quitter sans enregistrer ?"
      description="Tes changements seront perdus."
      confirmLabel="Quitter"
      cancelLabel="Continuer ici"
      destructive
      onConfirm={onLeave}
      onClose={onStay}
    />
  );
}
