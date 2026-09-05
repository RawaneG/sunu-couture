// Phase 6A — différenciation démo / réel (docs/refonte/02-PLAN-MIGRATION.md
// §5.1.3, correction G). Règle déterministe et testable, dérivée de la seed
// RÉELLEMENT connue du projet (`seedClients`/`buildSeedFiches` dans store.ts)
// — on ne devine jamais qu'une donnée « ressemble » à une seed.
import { seedClients, buildSeedFiches, SEED_FICHE_DAY_OFFSETS } from "./store";
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

/**
 * `seedFiches` (store.ts) n'est qu'UN instantané — celui pris à l'installation
 * de l'app sur CET appareil. Une nouvelle instance générée à la date du jour
 * ne correspond plus au contenu réellement persisté dès que le temps a passé
 * (`dueDate`/`createdAt` dérivent de « aujourd'hui » au moment de la
 * construction) — comparer une fiche legacy à une seed regénérée aujourd'hui
 * ferait passer une démo intacte pour réelle après quelques jours (Phase 6A,
 * correction blocker « seed datée »).
 *
 * On reconstruit donc, de façon déterministe, la seed attendue TELLE QU'ELLE
 * ÉTAIT le jour de l'installation : `createdAt` d'une fiche seed n'est jamais
 * modifié par l'app après coup (aucune action du store ne l'édite), donc pour
 * un `id` de seed connu, `createdAt − décalage-connu-de-cet-id = date
 * d'installation`. `buildSeedFiches()` appelée avec cette date reconstruite
 * régénère un catalogue byte-identique à celui réellement écrit ce jour-là ;
 * la comparaison reste stricte sur TOUS les champs (`dueDate` y compris — un
 * tailleur qui aurait réellement changé la date de retrait d'une fiche démo
 * la fait donc à bon droit basculer en « réelle », puisque le champ reconstruit
 * ne coïnciderait plus avec le champ persisté).
 */
function reconstructExpectedSeedFiche(fiche: Fiche): Fiche | undefined {
  const offsets = (SEED_FICHE_DAY_OFFSETS as Record<string, { createdAt: number }>)[fiche.id];
  if (!offsets) return undefined;

  const createdAt = new Date(fiche.createdAt);
  if (Number.isNaN(createdAt.getTime())) return undefined; // createdAt illisible : impossible d'ancrer une reconstruction fiable

  const installDate = new Date(createdAt);
  installDate.setDate(installDate.getDate() - offsets.createdAt);

  return buildSeedFiches(installDate).find((f) => f.id === fiche.id);
}

export function classifyFicheOrigin(fiche: Fiche): LegacyOrigin {
  const expectedSeed = reconstructExpectedSeedFiche(fiche);
  return expectedSeed && deepEqual(expectedSeed, fiche) ? "demo" : "reel";
}

/** Le catalogue de modèles démarre toujours vide (`modeles: []` dans l'état
 * initial du store) — il n'existe donc aucune seed de modèle. Un modèle présent
 * dans les données legacy a nécessairement été créé par le tailleur : réel. */
export function classifyModeleOrigin(_modele: Modele): LegacyOrigin {
  return "reel";
}
