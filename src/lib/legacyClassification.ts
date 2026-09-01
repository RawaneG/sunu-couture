// Phase 6A — différenciation démo / réel (docs/refonte/02-PLAN-MIGRATION.md
// §5.1.3, correction G). Règle déterministe et testable, dérivée de la seed
// RÉELLEMENT connue du projet (`seedClients`/`seedFiches` dans store.ts) — on ne
// devine jamais qu'une donnée « ressemble » à une seed.
import { seedClients, seedFiches } from "./store";
import type { Client, Fiche, Modele } from "./types";

export type LegacyOrigin = "reel" | "demo";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bRec, k) && deepEqual(aRec[k], bRec[k]));
}

/**
 * Démo = seed **intacte** : même `id` ET mêmes champs qu'à l'installation
 * initiale (`id ∈ {c1..c5}` avec un contenu identique à `seedClients`).
 * Toute divergence (même minime : un tailleur qui aurait modifié la fiche démo
 * "Awa Diouf"), ou un `id` absent de la seed (généré par `uid()`, horodaté),
 * est considérée réelle — jamais l'inverse. On ne classe donc jamais en démo
 * une donnée réelle qui « ressemblerait » à la seed par coïncidence.
 */
export function classifyClientOrigin(client: Client): LegacyOrigin {
  const seed = seedClients.find((c) => c.id === client.id);
  return seed && deepEqual(seed, client) ? "demo" : "reel";
}

export function classifyFicheOrigin(fiche: Fiche): LegacyOrigin {
  const seed = seedFiches.find((f) => f.id === fiche.id);
  return seed && deepEqual(seed, fiche) ? "demo" : "reel";
}

/** Le catalogue de modèles démarre toujours vide (`modeles: []` dans l'état
 * initial du store) — il n'existe donc aucune seed de modèle. Un modèle présent
 * dans les données legacy a nécessairement été créé par le tailleur : réel. */
export function classifyModeleOrigin(_modele: Modele): LegacyOrigin {
  return "reel";
}
