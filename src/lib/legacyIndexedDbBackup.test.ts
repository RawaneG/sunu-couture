import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { saveLegacyBackupToIndexedDb } from "./legacyIndexedDbBackup";

/** Minimal fake IDBFactory whose transaction always errors with a real
 * QuotaExceededError DOMException — fake-indexeddb doesn't simulate quota
 * exhaustion itself, so this hand-rolled double exercises that one path. */
function quotaExceededFactory(): IDBFactory {
  return {
    open: () => {
      const req: Partial<IDBOpenDBRequest> & Record<string, unknown> = {};
      queueMicrotask(() => {
        const tx: Partial<IDBTransaction> & Record<string, unknown> = {
          objectStore: () => ({ put: () => undefined }) as unknown as IDBObjectStore,
        };
        Object.defineProperty(tx, "error", {
          get: () => new DOMException("Quota dépassé", "QuotaExceededError"),
        });
        const db = {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            queueMicrotask(() => (tx.onerror as (() => void) | undefined)?.());
            return tx as unknown as IDBTransaction;
          },
          close: () => undefined,
        };
        (req as { result?: unknown }).result = db;
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe("saveLegacyBackupToIndexedDb — succès", () => {
  it("saves the serialized backup when a fresh IDBFactory has plenty of room", async () => {
    const outcome = await saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: new IDBFactory() });
    expect(outcome.status).toBe("saved");
    if (outcome.status === "saved") {
      expect(outcome.key).toMatch(/^backup-/);
      expect(outcome.bytes).toBeGreaterThan(0);
    }
  });
});

describe("saveLegacyBackupToIndexedDb — quota insuffisant (estimate)", () => {
  it("skips the write without attempting it when navigator.storage.estimate() shows too little free room", async () => {
    const outcome = await saveLegacyBackupToIndexedDb("x".repeat(1000), {
      indexedDbFactory: new IDBFactory(),
      nav: { storage: { estimate: async () => ({ usage: 990, quota: 1000 }) } } as unknown as Pick<Navigator, "storage">,
    });
    expect(outcome.status).toBe("skipped_insufficient_quota");
  });

  it("proceeds when the estimate shows generous free room", async () => {
    const outcome = await saveLegacyBackupToIndexedDb("small", {
      indexedDbFactory: new IDBFactory(),
      nav: { storage: { estimate: async () => ({ usage: 10, quota: 1_000_000_000 }) } } as unknown as Pick<Navigator, "storage">,
    });
    expect(outcome.status).toBe("saved");
  });
});

describe("saveLegacyBackupToIndexedDb — QuotaExceededError réel à l'écriture", () => {
  it("reports quota_exceeded with a clear user-facing message instead of throwing", async () => {
    const outcome = await saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: quotaExceededFactory() });
    expect(outcome.status).toBe("quota_exceeded");
    if (outcome.status === "quota_exceeded") {
      expect(outcome.message).toMatch(/pleine/i);
    }
  });

  it("never touches localStorage when the IndexedDB write fails — the primary backup stays intact", async () => {
    window.localStorage.setItem("sunu-couture", '{"state":{"clients":[]},"version":12}');
    const before = window.localStorage.getItem("sunu-couture");

    await saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: quotaExceededFactory() });

    expect(window.localStorage.getItem("sunu-couture")).toBe(before);
    window.localStorage.removeItem("sunu-couture");
  });
});

describe("saveLegacyBackupToIndexedDb — IndexedDB indisponible", () => {
  it("reports unavailable rather than throwing when no IndexedDB implementation exists", async () => {
    vi.stubGlobal("indexedDB", undefined);
    try {
      const outcome = await saveLegacyBackupToIndexedDb("x", {});
      expect(outcome.status).toBe("unavailable");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
