// Path canonique du bucket Storage `media` (Phase 8A, corr. R §22) —
// `workshops/{workshopId}/fiches/{ficheId}/{fileId}`. AUCUNE PII dans le
// path : ni nom client, ni téléphone, ni vêtement — seulement des uuid.
// `fileId` vient de `crypto.randomUUID()`, jamais dérivé d'un nom de
// fichier fourni par l'utilisateur (jamais fait confiance).
export function buildMediaObjectPath(workshopId: string, ficheId: string, fileId: string): string {
  return `workshops/${workshopId}/fiches/${ficheId}/${fileId}`;
}

export const MEDIA_BUCKET = "media";
