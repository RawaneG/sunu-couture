// Cache IndexedDB natif (pas de dépendance `idb` — un wrapper mince suffit
// ici, corr. R Phase 7A §16) : un magasin par collection ("clients",
// "fiches"), clé composite `(workshopId, id)` — un atelier ne peut
// structurellement pas voir les lignes d'un autre (corr. R §17).
//
// Le cache n'est JAMAIS l'autorité : `CloudCollectionStore` (voir
// `CloudCollectionStore.ts`) ne l'utilise que pour un affichage immédiat au
// démarrage, toujours corrigé par le réseau ensuite.
const DB_NAME = "tayoo-cloud-cache";
const DB_VERSION = 1;
export const CACHE_STORE_NAMES = ["clients", "fiches"] as const;
export type CacheStoreName = (typeof CACHE_STORE_NAMES)[number];

interface StoredRow<T> {
  workshopId: string;
  id: string;
  data: T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible dans cet environnement."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of CACHE_STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: ["workshopId", "id"] });
          store.createIndex("workshopId", "workshopId", { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB : échec d'ouverture"));
  });
}

/** Cache d'UNE collection, scopé à UN atelier — jamais deux ateliers dans la
 * même instance (corr. R §17 : "atelier A != atelier B sans ambiguïté"). */
export class IndexedDbCollectionCache<T> {
  private readonly storeName: CacheStoreName;
  private readonly workshopId: string;

  constructor(storeName: CacheStoreName, workshopId: string) {
    this.storeName = storeName;
    this.workshopId = workshopId;
  }

  async readAll(): Promise<T[]> {
    const db = await openDb();
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const index = tx.objectStore(this.storeName).index("workshopId");
        const range = IDBKeyRange.only(this.workshopId);
        const rows: T[] = [];
        const cursorRequest = index.openCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            rows.push((cursor.value as StoredRow<T>).data);
            cursor.continue();
          } else {
            resolve(rows);
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });
    } finally {
      db.close();
    }
  }

  /** Remplace INTÉGRALEMENT le contenu mis en cache pour cet atelier — une
   * ligne supprimée côté serveur depuis le dernier refresh ne doit pas
   * ressurgir d'un cache jamais purgé. */
  async writeAll(items: Array<{ id: string; data: T }>): Promise<void> {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const index = store.index("workshopId");
        const range = IDBKeyRange.only(this.workshopId);
        const cursorRequest = index.openCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            for (const item of items) {
              store.put({ workshopId: this.workshopId, id: item.id, data: item.data });
            }
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}
