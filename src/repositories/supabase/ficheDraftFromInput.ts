// Adapte `NewFicheInput` (contrat historique du Repository, Phase 7A/9A) vers
// `FicheDraft` (Phase 9A, `src/lib/ficheDraft.ts`) — pont minimal pour que
// `SupabaseFicheRepository.add()` réutilise la MÊME règle anti-fiche-vide
// (`isMeaningfulFicheDraft`) et le MÊME mapping cloud
// (`mapFicheDraftToCloudPayload`) que le brouillon local `FicheNew`, plutôt
// que de réinventer une seconde conversion `NewFicheInput → json arbitraire`
// ici (corr. R, Phase 7B §6). Fonction PURE, sans dépendance réseau.
import { emptyFicheDraft, type FicheDraft } from "../../lib/ficheDraft";
import type { NewFicheInput } from "../FicheRepository";
import type { FicheChampKey } from "../../lib/types";

export function newFicheInputToDraft(input: NewFicheInput | undefined): FicheDraft {
  const draft = emptyFicheDraft();
  if (!input) return draft;
  draft.clientId = input.clientId ?? null;
  draft.nom = input.nom ?? "";
  draft.prenom = input.prenom ?? "";
  draft.telephone = input.telephone ?? "";
  draft.garment = input.garment ?? "";
  draft.description = input.description ?? "";
  if (input.prefillChamps) {
    for (const key of Object.keys(input.prefillChamps) as FicheChampKey[]) {
      const valeur = input.prefillChamps[key];
      if (valeur === undefined) continue;
      draft.champs[key] = { valeur, historique: [] };
    }
  }
  return draft;
}
