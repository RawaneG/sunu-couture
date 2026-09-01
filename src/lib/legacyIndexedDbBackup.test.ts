import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { saveLegacyBackupToIndexedDb } from "./legacyIndexedDbBackup";

/** Fake IDBFactory whose transaction always errors with the given error —
 * fake-indexeddb doesn't simulate quota exhaustion or driver-level failures
 * itself, so this hand-rolled double exercises those paths deterministically. */
function transactionErrorFactory(error: unknown): IDBFactory {
  return {
    open: () => {
      const req: Partial<IDBOpenDBRequest> & Record<string, unknown> = {};
      queueMicrotask(() => {
        const tx: Partial<IDBTransaction> & Record<string, unknown> = {
          objectStore: () => ({ put: () => undefined }) as unknown as IDBObjectStore,
        };
        Object.defineProperty(tx, "error", { get: () => error });
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

const quotaExceededFactory = () => transactionErrorFactory(new DOMException("Quota dépassé", "QuotaExceededError"));

/** Fake IDBFactory whose `open()` itself errors — simulates a DB-open failure
 * (driver unavailable, permission denied, corrupted DB…) before any transaction. */
function openErrorFactory(error: unknown): IDBFactory {
  return {
    open: () => {
      const req: Partial<IDBOpenDBRequest> & Record<string, unknown> = {};
      queueMicrotask(() => {
        (req as { error?: unknown }).error = error;
        (req.onerror as (() => void) | undefined)?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

/** Fake IDBFactory whose `db.transaction(...)` call itself throws
 * synchronously (e.g. a real browser throwing InvalidStateError/SecurityError
 * from `transaction()` rather than erroring the transaction asynchronously). */
function transactionThrowsFactory(error: unknown): IDBFactory {
  return {
    open: () => {
      const req: Partial<IDBOpenDBRequest> & Record<string, unknown> = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            throw error;
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

// Phase 6A, correction review « IndexedDB — aucune exception non gérée ».
describe("saveLegacyBackupToIndexedDb — erreurs IndexedDB inattendues (jamais relancées)", () => {
  it("reports unavailable (not a rejection) on a SecurityError raised by the transaction", async () => {
    const factory = transactionErrorFactory(new DOMException("Contexte non sécurisé", "SecurityError"));
    await expect(saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reports unavailable on an InvalidStateError raised by the transaction", async () => {
    const factory = transactionErrorFactory(new DOMException("État invalide", "InvalidStateError"));
    await expect(saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reports unavailable on a DB-open failure (driver unavailable, permission denied…)", async () => {
    const factory = openErrorFactory(new Error("Impossible d'ouvrir la base"));
    await expect(saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reports unavailable when db.transaction() itself throws synchronously (blocked/disabled IndexedDB)", async () => {
    const factory = transactionThrowsFactory(new DOMException("IndexedDB bloqué", "InvalidStateError"));
    await expect(saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory })).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("reports unavailable on a plain, non-DOMException error too", async () => {
    const factory = transactionErrorFactory(new Error("Erreur générique inattendue"));
    const outcome = await saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory });
    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.reason).toContain("Erreur générique inattendue");
    }
  });

  it("never rejects the returned promise for any of these unexpected errors (the UI never needs a try/catch)", async () => {
    const factories = [
      transactionErrorFactory(new DOMException("x", "SecurityError")),
      transactionErrorFactory(new DOMException("x", "InvalidStateError")),
      openErrorFactory(new Error("open failed")),
      transactionThrowsFactory(new DOMException("x", "InvalidStateError")),
    ];
    for (const factory of factories) {
      // Si la promesse rejetait, `.resolves` échouerait ici avec le rejet —
      // c'est la preuve elle-même, pas juste une assertion sur la forme.
      await expect(saveLegacyBackupToIndexedDb('{"a":1}', { indexedDbFactory: factory })).resolves.toEqual(
        expect.objectContaining({ status: "unavailable" }),
      );
    }
  });
});
