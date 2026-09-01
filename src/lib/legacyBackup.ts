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

export interface LegacyBackupFile {
  format: typeof LEGACY_BACKUP_FORMAT;
  formatVersion: typeof LEGACY_BACKUP_FORMAT_VERSION;
  generatedAt: string;
  storageKey: string;
  /** Version `zustand/persist` trouvée dans le stockage, si présente. */
  storedVersion: number | null;
  /** Payload `.state` exact trouvé dans le stockage — copie brute, non modifiée,
   * gardée pour une restauration fidèle même si `normalized` ci-dessous change
   * de forme dans une future version du backup. */
  rawState: unknown;
  /** Renseigné seulement si `localStorage[storageKey]` existait mais n'était pas
   * du JSON valide — la sauvegarde continue quand même (annex + reste). */
  rawParseError: string | null;
  /** Toutes les autres clés `localStorage` (préférences, indices onboarding…),
   * verbatim — « clés annexes » du plan, aucune perte silencieuse. */
  annex: Record<string, string>;
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
 * les tests sans dépendre d'un `localStorage` réel. */
export type StorageLike = Pick<Storage, "getItem" | "key" | "length">;

/**
 * Construit la sauvegarde complète en mémoire. Pure : ne lit `storage` qu'en
 * lecture, n'écrit jamais nulle part (ni `localStorage`, ni IndexedDB, ni disque).
 * Testable indépendamment de l'UI en injectant `storage`/`now`.
 */
export function buildLegacyBackup(
  storage: StorageLike = window.localStorage,
  now: Date = new Date(),
): LegacyBackupFile {
  const rawText = storage.getItem(LEGACY_STORAGE_KEY);
  let parsed: unknown = null;
  let rawParseError: string | null = null;
  if (rawText !== null) {
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      rawParseError = err instanceof Error ? err.message : String(err);
    }
  }

  const state = rawParseError === null && parsed !== null ? extractState(parsed) : {};
  const storedVersion = rawParseError === null ? extractStoredVersion(parsed) : null;

  // Même logique de normalisation que l'app au démarrage — aucune deuxième
  // logique de migration concurrente (consigne Phase 6A §5).
  const { clients, fiches, modeles } = migrateLegacyState(state);

  const annex: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null || key === LEGACY_STORAGE_KEY) continue;
    const value = storage.getItem(key);
    if (value !== null) annex[key] = value;
  }

  return {
    format: LEGACY_BACKUP_FORMAT,
    formatVersion: LEGACY_BACKUP_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    storageKey: LEGACY_STORAGE_KEY,
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

export type BackupVerificationStatus = "ok" | "invalid_json" | "invalid_structure" | "counts_mismatch";

export interface BackupVerificationResult {
  status: BackupVerificationStatus;
  ok: boolean;
  counts: { clients: number; fiches: number; modeles: number };
  /** Photos tissu + signature + note vocale (fiches) + photos modèle/patron — la
   * « présence/quantité des médias legacy » demandée par le cahier des charges. */
  legacyMediaCount: number;
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

function isNormalizedShape(value: unknown): value is LegacyNormalizedData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.clients) && Array.isArray(v.fiches) && Array.isArray(v.modeles);
}

/**
 * Étape 3 du parcours (§3) : relit le JSON généré (jamais l'objet en mémoire —
 * un bug de sérialisation ne serait sinon jamais détecté), et compare ses
 * compteurs à la donnée source actuelle. Échoue clairement (`ok: false`) sur
 * JSON invalide, structure inattendue, ou tout compteur divergent — jamais
 * de "sauvegarde réussie" affiché avant ce résultat.
 */
export function verifyLegacyBackup(source: LegacyNormalizedData, serialized: string): BackupVerificationResult {
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
      mismatches: ["Le fichier généré n'est pas un JSON valide."],
    };
  }

  const backup = parsed as Partial<LegacyBackupFile> | null;
  if (backup?.format !== LEGACY_BACKUP_FORMAT || !isNormalizedShape(backup.normalized)) {
    return {
      status: "invalid_structure",
      ok: false,
      counts: zeroCounts,
      legacyMediaCount: 0,
      mismatches: ["La structure du fichier ne correspond pas au format de sauvegarde Tayoo attendu."],
    };
  }

  const backupData = backup.normalized;
  const counts = {
    clients: backupData.clients.length,
    fiches: backupData.fiches.length,
    modeles: backupData.modeles.length,
  };
  const sourceCounts = { clients: source.clients.length, fiches: source.fiches.length, modeles: source.modeles.length };
  const legacyMediaCount = countLegacyMedia(backupData);
  const sourceMediaCount = countLegacyMedia(source);

  const mismatches: string[] = [];
  if (counts.clients !== sourceCounts.clients) mismatches.push(`clients : source=${sourceCounts.clients}, sauvegarde=${counts.clients}`);
  if (counts.fiches !== sourceCounts.fiches) mismatches.push(`fiches : source=${sourceCounts.fiches}, sauvegarde=${counts.fiches}`);
  if (counts.modeles !== sourceCounts.modeles) mismatches.push(`modèles : source=${sourceCounts.modeles}, sauvegarde=${counts.modeles}`);
  if (legacyMediaCount !== sourceMediaCount) mismatches.push(`médias : source=${sourceMediaCount}, sauvegarde=${legacyMediaCount}`);

  return {
    status: mismatches.length === 0 ? "ok" : "counts_mismatch",
    ok: mismatches.length === 0,
    counts,
    legacyMediaCount,
    mismatches,
  };
}
