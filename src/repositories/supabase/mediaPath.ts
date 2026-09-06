// Path canonique du bucket Storage `media` (Phase 8A, corr. R §22) —
// `workshops/{workshopId}/fiches/{ficheId}/{fileId}`. AUCUNE PII dans le
// path : ni nom client, ni téléphone, ni vêtement — seulement des uuid.
// `fileId` vient de `crypto.randomUUID()`, jamais dérivé d'un nom de
// fichier fourni par l'utilisateur (jamais fait confiance).
export function buildMediaObjectPath(workshopId: string, ficheId: string, fileId: string): string {
  return `workshops/${workshopId}/fiches/${ficheId}/${fileId}`;
}

// Phase 8B — second path canonique dans le MÊME bucket `media` :
// `workshops/{workshopId}/modeles/{modeleId}/{fileId}`, jamais de PII. La
// migration `phase_8b_catalog_storage_policies` étend les 2 policies
// existantes pour accepter cette seconde branche, sans jamais en ajouter
// une 3ᵉ (voir la migration).
export function buildModeleMediaObjectPath(workshopId: string, modeleId: string, fileId: string): string {
  return `workshops/${workshopId}/modeles/${modeleId}/${fileId}`;
}

export const MEDIA_BUCKET = "media";
