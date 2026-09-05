// Brouillon « Nouvelle fiche » — Phase 9A (corr. R).
//
// Un `FicheDraft` n'est PAS une `Fiche` métier : il ne possède ni `numero`,
// ni `carnetNumero`, ni `page`/`slot` — ces champs sont attribués UNIQUEMENT
// par la porte de création (locale aujourd'hui : `FicheRepository.add()` ;
// cloud demain : l'Edge Function `create-fiche-from-draft`, Phase 7B/9A).
// Ne JAMAIS fabriquer `numero: 0`/`carnetNumero: 1` comme faux placeholders
// ici — un brouillon reste 100 % local tant qu'il n'a pas été validé.
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "./types";
import type { FicheChamp, FicheChampKey } from "./types";

export interface FicheDraft {
  clientId: string | null;
  nom: string;
  prenom: string;
  telephone: string;
  champs: Record<FicheChampKey, FicheChamp>;
  garment: string;
  description: string;
}

const ALL_CHAMP_KEYS: readonly FicheChampKey[] = [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS];

export function emptyFicheDraft(): FicheDraft {
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of ALL_CHAMP_KEYS) champs[key] = { valeur: "", historique: [] };
  return { clientId: null, nom: "", prenom: "", telephone: "", champs, garment: "", description: "" };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Reflète EXACTEMENT la règle métier serveur de
 * `app_hidden.create_fiche_from_draft()` (corr. L/R, `03-DECISIONS.md`) :
 * un client valide OU une information significative parmi
 * garment/description/measurements/legacy_identity — chaînes blanches
 * (espace, tabulation, saut de ligne compris) exclues. */
export function isMeaningfulFicheDraft(draft: FicheDraft): boolean {
  if (draft.clientId !== null) return true;
  if (!isBlank(draft.garment)) return true;
  if (!isBlank(draft.description)) return true;
  if (!isBlank(draft.nom)) return true;
  if (!isBlank(draft.prenom)) return true;
  if (!isBlank(draft.telephone)) return true;
  for (const key of ALL_CHAMP_KEYS) {
    if (!isBlank(draft.champs[key].valeur)) return true;
  }
  return false;
}

/** `FicheDraft` → payload `p_fiche` du futur chemin cloud (Edge Function
 * `create-fiche-from-draft`, Phase 7B). Fonction PURE, sans dépendance
 * réseau — sert aujourd'hui à documenter/tester le contrat, sans encore être
 * appelée par aucun Repository (le chemin local reste `FicheRepository.add()`
 * jusqu'à la Phase 7B). Ne contient JAMAIS `numero`/`carnetNumero`/
 * `carnet_id`/`page_number`/`slot_number` — ces champs sont alloués côté
 * serveur par `app_hidden.create_fiche_from_draft`, jamais fournis par le
 * navigateur. `workshopId` n'en fait pas partie non plus : il appartient à
 * l'enveloppe de la requête Edge Function, pas au JSON métier `p_fiche`. */
export interface CreateFicheDraftPayload {
  garment: string;
  description: string | null;
  measurements: Record<string, { valeur: string; historique: string[] }>;
  metadata: {
    legacy_identity: { nom: string; prenom: string; telephone: string };
  };
}

export function mapFicheDraftToCloudPayload(draft: FicheDraft): CreateFicheDraftPayload {
  const measurements: Record<string, { valeur: string; historique: string[] }> = {};
  for (const key of ALL_CHAMP_KEYS) {
    measurements[key] = { valeur: draft.champs[key].valeur, historique: draft.champs[key].historique };
  }
  return {
    garment: draft.garment,
    description: isBlank(draft.description) ? null : draft.description,
    measurements,
    metadata: {
      legacy_identity: { nom: draft.nom, prenom: draft.prenom, telephone: draft.telephone },
    },
  };
}
