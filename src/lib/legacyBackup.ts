// Phase 6A — sauvegarde de secours des données legacy (docs/refonte/02-PLAN-MIGRATION.md
// §5.1.1). Lit `localStorage` DIRECTEMENT (jamais via un Repository) : c'est une
// exception délibérée — cet outil doit fonctionner même si le format sur disque
// est encore une ancienne version, avant que quoi que ce soit d'autre n'ait tourné.
// AUCUNE écriture ici : ce module ne fait que lire et sérialiser.
import { migrateLegacyState, LEGACY_STORAGE_KEY } from "./store";
import type { Client, Fiche, Modele } from "./types";

export const LEGACY_BACKUP_FORMAT = "tayoo-legacy-backup" as const;
export const LEGACY_BACKUP_FORMAT_VERSION = 1 as const;

export interface LegacyNormalizedData {
  clients: Client[];
  fiches: Fiche[];
  modeles: Modele[];
}

/**
 * Clés `localStorage` NON sensibles réellement utilisées ailleurs dans l'app,
 * en dehors du store métier — les seules recopiées dans `annex`. Toute autre
 * clé (y compris une clé future, y compris tout ce qui ressemble à une session
 * Supabase Auth : `sb-*-auth-token`, `supabase.auth.token`…) est IGNORÉE, même
 * si elle existe dans `localStorage` au moment de l'export (Phase 6A, correction
 * blocker sécurité). Une sauvegarde métier ne doit jamais pouvoir embarquer un
 * access token / refresh token / credential — l'ajout d'une clé ici doit donc
 * être un choix explicite et vérifié, jamais automatique.
 * Source : src/lib/theme.ts (`sunu-theme`), src/lib/onboarding.ts (les deux
 * indices d'onboarding). Aucune autre clé n'est écrite par l'app à ce jour.
 */
export const SAFE_LEGACY_ANNEX_KEYS = ["sunu-theme", "sunu-swipe-hint-seen", "sunu-carnet-page-hint-seen"] as const;

export interface LegacyBackupFile {
  format: typeof LEGACY_BACKUP_FORMAT;
  formatVersion: typeof LEGACY_BACKUP_FORMAT_VERSION;
  generatedAt: string;
  storageKey: string;
  /** Valeur EXACTE, verbatim, de `localStorage.getItem("sunu-couture")` au
   * moment du snapshot — jamais parsée ni transformée. C'est la copie de
   * secours réelle (celle qui permet une restauration fidèle) : `null`
   * seulement si la clé était absente ; sinon toujours la chaîne d'origine
   * telle quelle, MÊME si elle n'est pas du JSON valide (Phase 6A, correction
   * blocker « préserver réellement la copie brute »). */
  rawStorageValue: string | null;
  /** Version `zustand/persist` trouvée dans le stockage, si présente. */
  storedVersion: number | null;
  /** Vue d'analyse complémentaire : payload `.state` déjà extrait du JSON
   * parsé, pour lecture humaine / debug. NE remplace JAMAIS `rawStorageValue`
   * ci-dessus — en cas de JSON corrompu, ce champ vaut `{}` alors que
   * `rawStorageValue` continue de porter la chaîne corrompue intacte. */
  rawState: unknown;
  /** Renseigné seulement si `localStorage[storageKey]` existait mais n'était pas
   * du JSON valide. `rawStorageValue` reste néanmoins préservé intact. */
  rawParseError: string | null;
  /** Sous-ensemble ALLOWLISTÉ des autres clés `localStorage` (voir
   * `SAFE_LEGACY_ANNEX_KEYS`), verbatim — jamais une capture générique de tout
   * `localStorage` (risque de session Supabase Auth, Phase 6A correction
   * blocker sécurité). */
  annex: Partial<Record<(typeof SAFE_LEGACY_ANNEX_KEYS)[number], string>>;
  normalized: LegacyNormalizedData;
  counts: { clients: number; fiches: number; modeles: number };
}

function extractState(parsed: unknown): unknown {
  if (parsed && typeof parsed === "object" && "state" in (parsed as Record<string, unknown>)) {
    return (parsed as Record<string, unknown>).state;
  }
  return parsed;
}

function extractStoredVersion(parsed: unknown): number | null {
  if (parsed && typeof parsed === "object" && "version" in (parsed as Record<string, unknown>)) {
    const v = (parsed as Record<string, unknown>).version;
    return typeof v === "number" ? v : null;
  }
  return null;
}

/** Sous-ensemble de `Storage` utilisé — permet d'injecter un faux storage dans
 * les tests sans dépendre d'un `localStorage` réel. Lecture seule : aucune
 * méthode d'écriture n'est jamais appelée par ce module. */
export type StorageLike = Pick<Storage, "getItem">;

/**
 * Construit la sauvegarde complète en mémoire. Pure : ne lit `storage` qu'en
 * lecture, n'écrit jamais nulle part (ni `localStorage`, ni IndexedDB, ni disque).
 * Testable indépendamment de l'UI en injectant `storage`/`now`.
 */
export function buildLegacyBackup(
  storage: StorageLike = window.localStorage,
  now: Date = new Date(),
): LegacyBackupFile {
  // Capturée EN PREMIER, avant tout parsing — c'est cette chaîne, telle
  // quelle, qui constitue la copie de secours réelle (§1). Rien ci-dessous ne
  // doit jamais se substituer à elle dans le fichier exporté.
  const rawStorageValue = storage.getItem(LEGACY_STORAGE_KEY);

  let parsed: unknown = null;
  let rawParseError: string | null = null;
  if (rawStorageValue !== null) {
    try {
      parsed = JSON.parse(rawStorageValue);
    } catch (err) {
      rawParseError = err instanceof Error ? err.message : String(err);
    }
  }

  const state = rawParseError === null && parsed !== null ? extractState(parsed) : {};
  const storedVersion = rawParseError === null ? extractStoredVersion(parsed) : null;

  // Même logique de normalisation que l'app au démarrage — aucune deuxième
  // logique de migration concurrente (consigne Phase 6A §5).
  const { clients, fiches, modeles } = migrateLegacyState(state);

  // Allowlist explicite (§2) — jamais un balayage de tout `localStorage` :
  // une session Supabase Auth ne doit jamais pouvoir se retrouver ici.
  const annex: LegacyBackupFile["annex"] = {};
  for (const key of SAFE_LEGACY_ANNEX_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) annex[key] = value;
  }

  return {
    format: LEGACY_BACKUP_FORMAT,
    formatVersion: LEGACY_BACKUP_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    storageKey: LEGACY_STORAGE_KEY,
    rawStorageValue,
    storedVersion,
    rawState: state,
    rawParseError,
    annex,
    normalized: { clients, fiches, modeles },
    counts: { clients: clients.length, fiches: fiches.length, modeles: modeles.length },
  };
}

export function serializeLegacyBackup(backup: LegacyBackupFile): string {
  return JSON.stringify(backup, null, 2);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `tayoo-sauvegarde-YYYY-MM-DD.json`, heure locale de l'appareil (le tailleur
 * n'exporte qu'une fois par jour au plus, la date locale est sans ambiguïté ici). */
export function legacyBackupFileName(now: Date = new Date()): string {
  return `tayoo-sauvegarde-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`;
}

export type BackupVerificationStatus = "ok" | "invalid_json" | "invalid_structure" | "raw_mismatch" | "counts_mismatch";

/** Ce qui a servi à construire le snapshot dont on vérifie la sérialisation —
 * `rawStorageValue` doit venir du MÊME `LegacyBackupFile` que celui qu'on
 * relit ici (pas d'un nouveau `localStorage.getItem()` à l'instant de la
 * vérification, qui comparerait deux instants différents pour rien). */
export interface BackupVerificationSource {
  normalized: LegacyNormalizedData;
  rawStorageValue: string | null;
}

export interface BackupVerificationResult {
  status: BackupVerificationStatus;
  ok: boolean;
  counts: { clients: number; fiches: number; modeles: number };
  /** Photos tissu + signature + note vocale (fiches) + photos modèle/patron — la
   * « présence/quantité des médias legacy » demandée par le cahier des charges. */
  legacyMediaCount: number;
  /** La copie brute présente dans le fichier relu est-elle strictement
   * identique à celle qui a servi à construire le snapshot ? */
  rawStorageValueMatches: boolean;
  mismatches: string[];
}

function countLegacyMedia(data: LegacyNormalizedData): number {
  let n = 0;
  for (const f of data.fiches) {
    n += f.tissuPhotos.length;
    if (f.signature) n += 1;
    if (f.voiceNote) n += 1;
  }
  for (const m of data.modeles) {
    n += m.photos.length + m.patronPhotos.length;
  }
  return n;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Chaque élément est validé individuellement — pas seulement "c'est un
// tableau" — pour que `countLegacyMedia()` ci-dessous puisse lire
// `tissuPhotos`/`photos`/`patronPhotos` sans jamais planter sur un fichier
// relu structurellement incompatible (ex: `{"fiches":[null]}`,
// `{"fiches":[{}]}` sans `tissuPhotos`, ou `tissuPhotos: "abc"`). Phase 6A,
// correction review « aucun crash sur backup relu malformed » — Option A
// (validation renforcée en amont plutôt qu'un try/catch autour des compteurs).
function isValidLegacyClientShape(value: unknown): boolean {
  return isPlainRecord(value) && typeof value.id === "string";
}

function isValidLegacyFicheShape(value: unknown): boolean {
  return isPlainRecord(value) && typeof value.id === "string" && Array.isArray(value.tissuPhotos);
}

function isValidLegacyModeleShape(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.photos) &&
    Array.isArray(value.patronPhotos)
  );
}

function isNormalizedShape(value: unknown): value is LegacyNormalizedData {
  if (!isPlainRecord(value)) return false;
  const { clients, fiches, modeles } = value;
  return (
    Array.isArray(clients) &&
    clients.every(isValidLegacyClientShape) &&
    Array.isArray(fiches) &&
    fiches.every(isValidLegacyFicheShape) &&
    Array.isArray(modeles) &&
    modeles.every(isValidLegacyModeleShape)
  );
}

/**
 * Valide la forme MINIMALE requise d'un backup relu pour que la suite de
 * `verifyLegacyBackup()` soit sûre — jamais juste `format`+`normalized`
 * (Phase 6A, correction review « validation stricte du format de backup ») :
 * `formatVersion` doit être explicitement correct, et `rawStorageValue` doit
 * être une clé PRÉSENTE (`"rawStorageValue" in backup` — un champ absent
 * n'est PAS une vraie valeur `null`, `backup.rawStorageValue ?? null` les
 * confondait à tort) de type `string | null`.
 */
function isValidBackupShape(parsed: unknown): parsed is LegacyBackupFile {
  if (!isPlainRecord(parsed)) return false;
  if (parsed.format !== LEGACY_BACKUP_FORMAT) return false;
  if (parsed.formatVersion !== LEGACY_BACKUP_FORMAT_VERSION) return false;
  if (!("rawStorageValue" in parsed)) return false;
  const raw = parsed.rawStorageValue;
  if (raw !== null && typeof raw !== "string") return false;
  if (!isNormalizedShape(parsed.normalized)) return false;
  return true;
}

/**
 * Étape 3 du parcours (§3) : relit le JSON généré (jamais l'objet en mémoire —
 * un bug de sérialisation ne serait sinon jamais détecté). Vérifie DEUX choses
 * indépendantes : (1) la copie brute (`rawStorageValue`) présente dans le
 * fichier relu est strictement identique à celle qui a servi à construire le
 * snapshot — la vraie sauvegarde de secours — et (2) les compteurs de la vue
 * normalisée correspondent à la donnée source actuelle. Échoue clairement
 * (`ok: false`) sur JSON invalide, structure inattendue, copie brute altérée,
 * ou tout compteur divergent — jamais de "sauvegarde réussie" affiché avant
 * ce résultat.
 */
export function verifyLegacyBackup(source: BackupVerificationSource, serialized: string): BackupVerificationResult {
  const zeroCounts = { clients: 0, fiches: 0, modeles: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      status: "invalid_json",
      ok: false,
      counts: zeroCounts,
      legacyMediaCount: 0,
      rawStorageValueMatches: false,
      mismatches: ["Le fichier généré n'est pas un JSON valide."],
    };
  }

  if (!isValidBackupShape(parsed)) {
    return {
      status: "invalid_structure",
      ok: false,
      counts: zeroCounts,
      legacyMediaCount: 0,
      rawStorageValueMatches: false,
      mismatches: ["La structure du fichier ne correspond pas au format de sauvegarde Tayoo attendu."],
    };
  }
  const backup = parsed; // narrowed à LegacyBackupFile par isValidBackupShape ci-dessus

  // rawStorageValue est garanti PRÉSENT (pas seulement `undefined` masqué en
  // `null`) par isValidBackupShape — comparaison directe, sans `?? null`.
  const rawStorageValueMatches = backup.rawStorageValue === source.rawStorageValue;

  const backupData = backup.normalized;
  const counts = {
    clients: backupData.clients.length,
    fiches: backupData.fiches.length,
    modeles: backupData.modeles.length,
  };
  const sourceCounts = {
    clients: source.normalized.clients.length,
    fiches: source.normalized.fiches.length,
    modeles: source.normalized.modeles.length,
  };
  const legacyMediaCount = countLegacyMedia(backupData);
  const sourceMediaCount = countLegacyMedia(source.normalized);

  const mismatches: string[] = [];
  if (!rawStorageValueMatches) mismatches.push("copie brute (rawStorageValue) : ne correspond pas à la valeur source du snapshot");
  if (counts.clients !== sourceCounts.clients) mismatches.push(`clients : source=${sourceCounts.clients}, sauvegarde=${counts.clients}`);
  if (counts.fiches !== sourceCounts.fiches) mismatches.push(`fiches : source=${sourceCounts.fiches}, sauvegarde=${counts.fiches}`);
  if (counts.modeles !== sourceCounts.modeles) mismatches.push(`modèles : source=${sourceCounts.modeles}, sauvegarde=${counts.modeles}`);
  if (legacyMediaCount !== sourceMediaCount) mismatches.push(`médias : source=${sourceMediaCount}, sauvegarde=${legacyMediaCount}`);

  let status: BackupVerificationStatus;
  if (!rawStorageValueMatches) {
    status = "raw_mismatch";
  } else if (mismatches.length === 0) {
    status = "ok";
  } else {
    status = "counts_mismatch";
  }

  return {
    status,
    ok: mismatches.length === 0,
    counts,
    legacyMediaCount,
    rawStorageValueMatches,
    mismatches,
  };
}
