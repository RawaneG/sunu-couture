import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useRepositories } from "../repositories/RepositoryProvider";
import PageHeader from "../components/ui/PageHeader";
import UnsavedChangesDialog from "../components/ui/UnsavedChangesDialog";
import { haptic } from "../lib/haptics";

const BACK_TO = "/catalogue";

/** Aligné sur la contrainte SQL réelle (Phase 8B, `public.modeles`) —
 * `length(btrim(nom)) BETWEEN 1 AND 200`. */
function isValidNom(nom: string): boolean {
  const trimmed = nom.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
}

/**
 * Phase 8B — correction obligatoire : "Nouveau modèle" ne crée PLUS le
 * modèle au montage (un modèle cloud ne peut structurellement pas exister
 * sans nom, et l'ancien comportement créait une ligne vide invisible dès
 * l'ouverture de l'écran, même en cas d'abandon immédiat). Ce composant est
 * maintenant un VRAI brouillon local : `nomDraft` vit en state React, AUCUN
 * appel `modeleRepository.add()` n'est fait tant que le tailleur n'a pas
 * validé un nom explicite — ouvrir puis quitter cet écran ne crée jamais
 * rien (0 INSERT, 0 ligne DB, 0 modèle local persistant).
 */
export default function ModeleNew() {
  const { modeles: modeleRepository } = useRepositories();
  const navigate = useNavigate();
  const [nom, setNom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const canSubmit = isValidNom(nom) && !isSubmitting;
  const dirty = nom.trim().length > 0;

  function handleBack() {
    if (!dirty) {
      navigate(BACK_TO);
      return;
    }
    haptic();
    setLeaveConfirmOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return; // guard double-submit (§57)
    setIsSubmitting(true);
    setError(null);
    try {
      const id = await modeleRepository.add({ nom });
      navigate(`/catalogue/${id}`, { replace: true });
    } catch {
      setError("Le modèle n'a pas pu être créé. Réessaie.");
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Nouveau modèle" onBack={handleBack} />

      <UnsavedChangesDialog
        open={leaveConfirmOpen}
        onStay={() => setLeaveConfirmOpen(false)}
        onLeave={() => navigate(BACK_TO)}
      />

      <form onSubmit={handleSubmit} className="px-4 lg:px-10 py-4 lg:py-8 max-w-md lg:mx-auto">
        <div className="glass-card rounded-2xl p-4 lg:rounded-3xl lg:shadow-soft lg:p-8">
          <label htmlFor="modele-nom" className="mb-2 block text-[13px] font-bold text-ink-soft">
            Nom du modèle
          </label>
          <input
            id="modele-nom"
            type="text"
            autoFocus
            autoComplete="off"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex. Robe wax manches longues"
            className="w-full rounded-2xl border border-line-strong/40 bg-surface px-4 py-3 text-[15px] font-semibold text-ink outline-none focus:border-indigo"
          />

          {error && (
            <p role="alert" className="mt-2 text-[13px] font-semibold text-terracotta">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 w-full rounded-full bg-amber-tile px-4 py-3.5 text-[14px] font-bold text-[#2a1c04] shadow-soft active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100"
          >
            {isSubmitting ? "Création…" : "Créer le modèle"}
          </button>
        </div>
      </form>
    </div>
  );
}
