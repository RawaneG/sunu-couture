// Phase 6A — copie IndexedDB de secours (docs/refonte/02-PLAN-MIGRATION.md
// §5.1.1.2). Toujours APRÈS le fichier JSON téléchargé, jamais à sa place.
// N'écrit QUE dans IndexedDB — ce module ne lit ni n'écrit jamais
// `localStorage` : une erreur ici ne peut donc, par construction, ni détruire
// ni altérer la sauvegarde principale (`localStorage["sunu-couture"]`).

export const LEGACY_BACKUP_DB_NAME = "tayoo-legacy-backups";
export const LEGACY_BACKUP_STORE_NAME = "backups";

// Marge de sécurité : on n'écrit que si l'espace libre estimé est au moins
// 3x la taille de la sauvegarde — l'estimation `navigator.storage.estimate()`
// n'est qu'indicative (d'autres écritures concurrentes existent), donc on ne
// s'en sert que pour éviter une tentative manifestement vouée à l'échec.
// L'erreur `QuotaExceededError` réelle reste gérée explicitement dans tous les cas.
const QUOTA_SAFETY_FACTOR = 3;

export interface StorageEstimateLike {
  usage?: number;
  quota?: number;
}

export type LegacyIndexedDbOutcome =
  | { status: "saved"; key: string; bytes: number }
  | { status: "skipped_insufficient_quota"; estimate: StorageEstimateLike | null; requiredBytes: number }
  | { status: "quota_exceeded"; message: string }
  | { status: "unavailable"; reason: string };

/** `navigator.storage.estimate()` si disponible — jamais lancé si absent
 * (Safari plus ancien, contexte non sécurisé, etc.). */
export async function estimateStorage(
  nav: Pick<Navigator, "storage"> | undefined = typeof navigator !== "undefined" ? navigator : undefined,
): Promise<StorageEstimateLike | null> {
  try {
    if (!nav?.storage?.estimate) return null;
    return await nav.storage.estimate();
  } catch {
    return null;
  }
}

function hasEnoughRoom(estimate: StorageEstimateLike | null, requiredBytes: number): boolean {
  if (!estimate || estimate.quota === undefined || estimate.usage === undefined) return true;
  const free = estimate.quota - estimate.usage;
  return free > requiredBytes * QUOTA_SAFETY_FACTOR;
}

function isQuotaExceeded(err: unknown): boolean {
  return err instanceof DOMException && err.name === "QuotaExceededError";
}

function writeRecord(factory: IDBFactory, dbName: string, storeName: string, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const openReq = factory.open(dbName, 1);
    openReq.onupgradeneeded = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    openReq.onerror = () => reject(openReq.error ?? new Error("Impossible d'ouvrir IndexedDB"));
    openReq.onsuccess = () => {
      const db = openReq.result;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(storeName, "readwrite");
      } catch (err) {
        db.close();
        reject(err);
        return;
      }
      tx.objectStore(storeName).put({ value, savedAt: new Date().toISOString() }, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Écriture IndexedDB échouée"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Écriture IndexedDB annulée"));
      };
    };
  });
}

/**
 * Étape 4 du parcours (§4) : copie de secours IndexedDB, réalisée SEULEMENT
 * après le backup fichier et SEULEMENT si l'espace estimé semble suffisant.
 * Ne touche jamais `localStorage`. Ne lance JAMAIS d'exception vers
 * l'appelant : `QuotaExceededError` (`"quota_exceeded"`) et toute autre erreur
 * IndexedDB inattendue — SecurityError, InvalidStateError, échec d'ouverture
 * ou de transaction, IndexedDB bloqué par le navigateur… (`"unavailable"`) —
 * sont toujours converties en `LegacyIndexedDbOutcome` structuré.
 */
export async function saveLegacyBackupToIndexedDb(
  serializedBackup: string,
  opts: {
    indexedDbFactory?: IDBFactory;
    nav?: Pick<Navigator, "storage">;
    now?: Date;
    dbName?: string;
    storeName?: string;
  } = {},
): Promise<LegacyIndexedDbOutcome> {
  const factory = opts.indexedDbFactory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  if (!factory) {
    return { status: "unavailable", reason: "IndexedDB non disponible sur cet appareil." };
  }

  const bytes = new Blob([serializedBackup]).size;
  const estimate = await estimateStorage(opts.nav);
  if (!hasEnoughRoom(estimate, bytes)) {
    return { status: "skipped_insufficient_quota", estimate, requiredBytes: bytes };
  }

  const now = opts.now ?? new Date();
  const key = `backup-${now.toISOString()}`;
  const dbName = opts.dbName ?? LEGACY_BACKUP_DB_NAME;
  const storeName = opts.storeName ?? LEGACY_BACKUP_STORE_NAME;

  try {
    await writeRecord(factory, dbName, storeName, key, serializedBackup);
    return { status: "saved", key, bytes };
  } catch (err) {
    if (isQuotaExceeded(err)) {
      return { status: "quota_exceeded", message: "Mémoire du téléphone pleine — libérez de l'espace, puis réessayez." };
    }
    // Toute autre erreur IndexedDB (SecurityError, InvalidStateError, échec
    // d'ouverture/de transaction, IndexedDB bloqué par le navigateur…) est
    // rendue explicite ici plutôt que relancée — cette copie est une SECOURS
    // optionnelle, jamais autorisée à faire planter l'écran ou bloquer
    // l'appelant dans un état "checking" (Phase 6A, correction review « aucune
    // exception non gérée »). Le fichier téléchargé reste la sauvegarde réelle.
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "unavailable", reason: `Copie de secours IndexedDB indisponible : ${reason}` };
  }
}
