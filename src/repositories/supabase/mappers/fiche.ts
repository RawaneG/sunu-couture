// DB row (`fiches_view`) ↔ domaine `Fiche` — respecte D4/D8 et corr. R.
//
// IMPORTANT (corr. R §31, preflight Phase 7) : `Fiche` porte encore des
// champs qui n'ont PAS de source cloud avant des phases ultérieures :
// `voiceNote`/`tissuPhotos`/`signature` → `media_assets`, Phase 8A ;
// `avance` → `client_payments` (ledger), Phase 11A. Tant que ces phases
// n'existent pas, AUCUNE fiche cloud ne peut légitimement en avoir — ce
// mapper les renvoie donc à leur valeur neutre (`null`/`[]`/`0`), documentée
// ici comme NON AUTORITATIVE : elle ne doit jamais être lue comme "cette
// fiche n'a pas de photo/vocal/avance", seulement comme "cette information
// n'est pas encore rapportée par cette version du Repository". C'est
// précisément pour cette raison que `VITE_BACKEND=supabase` reste bloqué
// globalement tant que 8A/11A ne sont pas terminées (voir
// `RepositoryContainer.test.ts` et `SupabaseFicheRepository.test.ts`).
//
// `nom`/`prenom`/`telephone`/`fabricColor` en revanche viennent de données
// RÉELLEMENT présentes dans `metadata` (D4 `legacy_identity`, D7
// `fabric_color`) — jamais inventées.
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "../../../lib/types";
import type { Fiche, FicheChamp, FicheChampKey, OrderStatus } from "../../../lib/types";
import type { FicheViewRow } from "../schemas";

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

function readMeasurementEntry(raw: unknown): FicheChamp {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const valeur = typeof obj.valeur === "string" ? obj.valeur : "";
    const historique = Array.isArray(obj.historique) ? obj.historique.filter((h): h is string => typeof h === "string") : [];
    return { valeur, historique };
  }
  return { valeur: "", historique: [] };
}

function buildChamps(measurements: unknown): Record<FicheChampKey, FicheChamp> {
  const source = measurements && typeof measurements === "object" && !Array.isArray(measurements)
    ? (measurements as Record<string, unknown>)
    : {};
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
    champs[key] = readMeasurementEntry(source[key]);
  }
  return champs;
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

  return {
    id: row.id,
    carnetNumero,
    numero: row.number,
    nom: readMetadataString(row.metadata, ["legacy_identity", "nom"]),
    prenom: readMetadataString(row.metadata, ["legacy_identity", "prenom"]),
    telephone: readMetadataString(row.metadata, ["legacy_identity", "telephone"]),
    clientId: row.client_id,
    champs: buildChamps(row.measurements),
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
