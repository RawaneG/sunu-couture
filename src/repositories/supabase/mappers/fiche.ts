// DB row (`fiches_view`) ↔ domaine `Fiche` — respecte D4/D8 et corr. R.
//
// IMPORTANT (corr. R §31, preflight Phase 7 ; mis à jour Phase 8A) : `Fiche`
// porte encore des champs sans source d'écriture ICI :
// `voiceNote`/`tissuPhotos`/`signature` → `media_assets`, DÉSORMAIS
// implémenté par `SupabaseMediaRepository` (Phase 8A) — jamais par ce
// mapper ni par `SupabaseFicheRepository` ; `avance` → `client_payments`
// (ledger), toujours Phase 11A. Ce mapper continue de renvoyer
// `voiceNote`/`tissuPhotos`/`signature` à leur valeur neutre (`null`/`[]`)
// et `avance` à `0` : à partir de la Phase 8A, ces trois champs deviennent
// VOLONTAIREMENT NON AUTORITATIFS sur `Fiche` — la source de vérité cloud
// est `MediaRepository` (`useFicheMedia()`, `FicheDetail.tsx`), jamais un
// join artificiel ajouté ici ou dans `fiches_view`. `avance` reste non
// autoritatif jusqu'à la Phase 11A. C'est précisément pour cette raison que
// `VITE_BACKEND=supabase` reste bloqué globalement tant que 8A (médias) et
// 11A (paiements) ne sont pas *toutes deux* terminées (voir
// `RepositoryContainer.test.ts` et `SupabaseFicheRepository.test.ts`).
//
// `nom`/`prenom`/`telephone`/`fabricColor` en revanche viennent de données
// RÉELLEMENT présentes dans `metadata` (D4 `legacy_identity`, D7
// `fabric_color`) — jamais inventées.
//
// `public.fiches.quantity` n'a AUCUN équivalent direct dans `Fiche`
// aujourd'hui — ni `nbrePagnes` (un champ texte libre façon papier, pas un
// entier de quantité) ni aucun autre champ ne le représente. Ce n'est pas un
// oubli : tant qu'une décision produit ne rattache pas explicitement
// `quantity` à un usage UI, ce mapper se contente de valider sa forme
// réseau (`ficheViewRowSchema`) sans l'exposer ni le réinventer ailleurs.
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "../../../lib/types";
import type { Fiche, FicheChamp, FicheChampKey, OrderStatus } from "../../../lib/types";
import type { FicheViewRow } from "../schemas";

const FICHE_CHAMP_KEYS: readonly FicheChampKey[] = [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS];

export const CLOUD_STATUS_TO_DOMAIN: Record<FicheViewRow["status"], OrderStatus> = {
  received: "recu",
  sewing: "couture",
  ready: "pret",
  delivered: "livre",
};

export const DOMAIN_STATUS_TO_CLOUD: Record<OrderStatus, FicheViewRow["status"]> = {
  recu: "received",
  couture: "sewing",
  pret: "ready",
  livre: "delivered",
};

/** Lève quand `row.status` n'est aucune des 4 valeurs attendues — une valeur
 * inconnue est REJETÉE, jamais silencieusement coercée (corr. R §28). */
export function mapCloudStatusToDomain(status: string): OrderStatus {
  const mapped = CLOUD_STATUS_TO_DOMAIN[status as FicheViewRow["status"]];
  if (!mapped) throw new Error(`Statut fiche cloud inconnu : "${status}"`);
  return mapped;
}

function isFicheChampKey(key: string): key is FicheChampKey {
  return (FICHE_CHAMP_KEYS as readonly string[]).includes(key);
}

function parseMeasurementEntry(raw: unknown, key: string): FicheChamp {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`measurements.${key} invalide : attendu { valeur: string; historique: string[] }, reçu ${JSON.stringify(raw)}.`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.valeur !== "string") {
    throw new Error(`measurements.${key}.valeur invalide : une chaîne est attendue.`);
  }
  if (!Array.isArray(obj.historique) || !obj.historique.every((h) => typeof h === "string")) {
    throw new Error(`measurements.${key}.historique invalide : un tableau de chaînes est attendu.`);
  }
  return { valeur: obj.valeur, historique: obj.historique as string[] };
}

/** Valide strictement la racine `measurements` (revue post-7A — plus de
 * coercition silencieuse vers un champ vide pour une donnée MALFORMÉE) :
 * - une racine qui n'est pas un objet est REJETÉE (lève) ;
 * - toute clé métier CONNUE (`FICHE_MESURE_KEYS`/`FICHE_INFO_KEYS`) présente
 *   doit avoir la forme `{valeur: string, historique: string[]}` — une
 *   forme différente fait REJETER toute la ligne ;
 * - une clé connue simplement ABSENTE reste acceptée, `buildChamps` la
 *   complète avec `{valeur: "", historique: []}` ;
 * - les clés inconnues (compat future) sont tolérées SANS validation —
 *   elles n'affaiblissent ni ne renforcent la validation des clés connues. */
function validateMeasurementsRoot(raw: unknown): Partial<Record<FicheChampKey, FicheChamp>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`measurements : racine non-objet rejetée (reçu ${JSON.stringify(raw)}).`);
  }
  const source = raw as Record<string, unknown>;
  const validated: Partial<Record<FicheChampKey, FicheChamp>> = {};
  for (const [key, value] of Object.entries(source)) {
    if (isFicheChampKey(key)) {
      validated[key] = parseMeasurementEntry(value, key);
    }
  }
  return validated;
}

function buildChamps(measurements: unknown): Record<FicheChampKey, FicheChamp> {
  const validated = validateMeasurementsRoot(measurements);
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of FICHE_CHAMP_KEYS) {
    champs[key] = validated[key] ?? { valeur: "", historique: [] };
  }
  return champs;
}

/** `Fiche.champs.tissusDeposes` a deux sources cloud possibles (corr. R §9) :
 * la colonne dédiée `fiches.fabric_notes` (texte libre, écrite par
 * `create_fiche_from_draft` et par `SupabaseFicheRepository`) et
 * `measurements.tissusDeposes` (JSON, pour l'historique façon papier).
 * Règle retenue, appliquée ICI et documentée pour l'écriture (voir
 * `SupabaseFicheRepository.buildChampUpdate`) :
 * - la VALEUR courante fait foi depuis `fabric_notes` quand il est renseigné ;
 * - à défaut, on retombe sur `measurements.tissusDeposes.valeur` (ex. une
 *   fiche jamais encore écrite par ce chemin) ;
 * - l'HISTORIQUE vient toujours de `measurements.tissusDeposes.historique` ;
 * - si les deux valeurs sont non vides et DIFFÉRENTES → erreur contrôlée
 *   (ligne rejetée) : une divergence signale une écriture concurrente
 *   incohérente, jamais un cas à trancher silencieusement. */
function resolveTissusDeposes(fabricNotes: string | null, measurementsChamp: FicheChamp): FicheChamp {
  const fromColumn = (fabricNotes ?? "").trim();
  const fromJson = measurementsChamp.valeur.trim();
  if (fromColumn && fromJson && fromColumn !== fromJson) {
    throw new Error(
      `Fiche : fabric_notes ("${fromColumn}") et measurements.tissusDeposes.valeur ("${fromJson}") divergent — incohérence non résolue automatiquement.`,
    );
  }
  return { valeur: fromColumn || fromJson, historique: measurementsChamp.historique };
}

function readMetadataString(metadata: Record<string, unknown> | null, path: string[]): string {
  let cursor: unknown = metadata;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return "";
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" ? cursor : "";
}

/** Résout `Fiche.carnetNumero` à partir de `row.carnet_id` — jamais un
 * fallback inventé (corr. R §30). `resolveCarnetNumero` vient typiquement de
 * `SupabaseCarnetRepository.getCarnetNumero()`. */
export function mapFicheRowToDomain(row: FicheViewRow, resolveCarnetNumero: (carnetId: string) => number | undefined): Fiche {
  const carnetNumero = resolveCarnetNumero(row.carnet_id);
  if (carnetNumero === undefined) {
    throw new Error(
      `mapFicheRowToDomain: carnet ${row.carnet_id} introuvable dans le cache carnets — ` +
        "impossible de résoudre Fiche.carnetNumero sans inventer une valeur.",
    );
  }

  const champs = buildChamps(row.measurements);
  champs.tissusDeposes = resolveTissusDeposes(row.fabric_notes, champs.tissusDeposes);

  return {
    id: row.id,
    carnetNumero,
    numero: row.number,
    nom: readMetadataString(row.metadata, ["legacy_identity", "nom"]),
    prenom: readMetadataString(row.metadata, ["legacy_identity", "prenom"]),
    telephone: readMetadataString(row.metadata, ["legacy_identity", "telephone"]),
    clientId: row.client_id,
    champs,
    // Non autoritatif avant la Phase 8A — voir commentaire de tête.
    voiceNote: null,
    tissuPhotos: [],
    dueDate: row.due_date,
    soldeLe: row.settled_at,
    // Non autoritatif avant la Phase 8A — voir commentaire de tête.
    signature: null,
    price: row.total_price,
    // Non autoritatif avant la Phase 11A — voir commentaire de tête.
    avance: 0,
    garment: row.garment,
    description: row.description,
    fabricColor: readMetadataString(row.metadata, ["fabric_color"]),
    status: mapCloudStatusToDomain(row.status),
    // Dérivé par la vue SQL (`fiches_view.is_late`) — jamais recalculé ni stocké côté client (D8).
    late: row.is_late,
    createdAt: row.created_at,
  };
}
