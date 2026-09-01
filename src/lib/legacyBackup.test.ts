import { describe, expect, it } from "vitest";
import {
  buildLegacyBackup,
  serializeLegacyBackup,
  verifyLegacyBackup,
  legacyBackupFileName,
  LEGACY_BACKUP_FORMAT,
  SAFE_LEGACY_ANNEX_KEYS,
  type StorageLike,
} from "./legacyBackup";
import { LEGACY_STORAGE_KEY } from "./store";

/** Minimal in-memory stand-in for `Storage` — only the read surface `buildLegacyBackup`
 * uses (allowlist-based `getItem`, no `key()`/`length` sweep since Phase 6A's security
 * correction). `setItem` throws deliberately: if `buildLegacyBackup`/`verifyLegacyBackup`
 * ever tried to write, the test would fail loudly instead of silently succeeding. */
function fakeStorage(entries: Record<string, string>): StorageLike & { setItem: () => never } {
  return {
    getItem: (key) => (key in entries ? entries[key] : null),
    setItem: () => {
      throw new Error("buildLegacyBackup/verifyLegacyBackup must never write to storage");
    },
  };
}

function persistedPayload(state: unknown, version = 12): string {
  return JSON.stringify({ state, version });
}

describe("buildLegacyBackup — export", () => {
  it("produces a valid, zero-count backup when the store is empty (no localStorage key at all)", () => {
    const backup = buildLegacyBackup(fakeStorage({}));
    expect(backup.format).toBe(LEGACY_BACKUP_FORMAT);
    expect(backup.counts).toEqual({ clients: 0, fiches: 0, modeles: 0 });
    expect(backup.normalized).toEqual({ clients: [], fiches: [], modeles: [] });
    expect(backup.rawParseError).toBeNull();
    expect(backup.rawStorageValue).toBeNull();
  });

  it("exports every client, fiche and modele present in storage", () => {
    const state = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }],
      fiches: [
        {
          id: "f1", carnetNumero: 1, numero: 1, nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", clientId: "c1",
          champs: {}, voiceNote: null, tissuPhotos: [], dueDate: null, soldeLe: null, signature: null,
          price: 25000, avance: 10000, garment: "Boubou", description: null, fabricColor: "#123",
          status: "recu", late: false, createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      modeles: [{ id: "m1", nom: "Boubou wax", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" }],
    };
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: persistedPayload(state) }));
    expect(backup.counts).toEqual({ clients: 1, fiches: 1, modeles: 1 });
    expect(backup.normalized.clients[0].id).toBe("c1");
    expect(backup.normalized.fiches[0].id).toBe("f1");
    expect(backup.normalized.modeles[0].id).toBe("m1");
  });

  it("reports a corrupted main key clearly (rawParseError) instead of throwing or silently dropping data", () => {
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: "{not json" }));
    expect(backup.rawParseError).not.toBeNull();
    expect(backup.counts).toEqual({ clients: 0, fiches: 0, modeles: 0 });
  });

  it("produces a JSON string that can be parsed back with the exact same counters (no silent mutation on serialization)", () => {
    const state = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }],
      fiches: [],
    };
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: persistedPayload(state) });
    const backup = buildLegacyBackup(storage);
    const serialized = serializeLegacyBackup(backup);
    const reparsed = JSON.parse(serialized);
    expect(reparsed.counts).toEqual(backup.counts);
    expect(reparsed.normalized).toEqual(backup.normalized);
  });

  it("never writes to storage while building the backup (fakeStorage.setItem throws if called)", () => {
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: persistedPayload({ clients: [], fiches: [] }) });
    expect(() => buildLegacyBackup(storage)).not.toThrow();
  });
});

describe("buildLegacyBackup — copie brute (rawStorageValue)", () => {
  it("preserves a valid JSON value byte-for-byte, including its exact whitespace/key order", () => {
    const raw = '{"version":12,"state":{"clients":[],  "fiches":[]}}'; // formatage volontairement inhabituel
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: raw }));
    expect(backup.rawStorageValue).toBe(raw);
  });

  it("preserves a corrupted (invalid JSON) value exactly, verbatim, rather than dropping it", () => {
    const corrupted = '{"state":{"clients": [ { "id": "c1", "name": "Awa"  MALFORMED}}';
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: corrupted }));
    expect(backup.rawStorageValue).toBe(corrupted);
    expect(backup.rawParseError).not.toBeNull();
  });

  it("is null only when the key is genuinely absent, never as a stand-in for a parse failure", () => {
    const empty = buildLegacyBackup(fakeStorage({}));
    expect(empty.rawStorageValue).toBeNull();

    const corrupted = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: "not json at all" }));
    expect(corrupted.rawStorageValue).toBe("not json at all");
  });

  it("keeps rawState/normalized as complementary views that never replace rawStorageValue", () => {
    const raw = persistedPayload({ clients: [], fiches: [] });
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: raw }));
    expect(backup.rawStorageValue).toBe(raw);
    // rawState is the extracted `.state`, a DIFFERENT (smaller) value than the raw wrapper string.
    expect(backup.rawState).toEqual({ clients: [], fiches: [] });
  });
});

describe("buildLegacyBackup — allowlist des clés annexes (sécurité)", () => {
  it("only ever copies the explicitly safe keys, never a generic sweep of localStorage", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: persistedPayload({ clients: [], fiches: [] }),
      "sunu-theme": "dark",
      "sunu-swipe-hint-seen": "1",
      "sunu-carnet-page-hint-seen": "1",
    });
    const backup = buildLegacyBackup(storage);
    expect(backup.annex).toEqual({ "sunu-theme": "dark", "sunu-swipe-hint-seen": "1", "sunu-carnet-page-hint-seen": "1" });
  });

  it("never exports a Supabase Auth session or any other credential-shaped key, even though it exists in storage", () => {
    const sensitiveKeys = [
      "sb-nffcdygtqzlivsresuuk-auth-token",
      "supabase.auth.token",
      "access_token",
      "refresh_token",
      "session",
      "secret",
    ];
    const entries: Record<string, string> = { [LEGACY_STORAGE_KEY]: persistedPayload({ clients: [], fiches: [] }) };
    for (const key of sensitiveKeys) entries[key] = "SENSITIVE-VALUE-SHOULD-NEVER-BE-EXPORTED";

    const backup = buildLegacyBackup(fakeStorage(entries));
    const serialized = serializeLegacyBackup(backup);

    for (const key of sensitiveKeys) {
      expect(Object.keys(backup.annex)).not.toContain(key);
    }
    // Belt-and-suspenders: the sensitive VALUE itself must not appear anywhere
    // in the serialized file (rules out it leaking under some other field name too).
    expect(serialized).not.toContain("SENSITIVE-VALUE-SHOULD-NEVER-BE-EXPORTED");
  });

  it("ignores an unknown/future localStorage key even if it looks harmless", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: persistedPayload({ clients: [], fiches: [] }),
      "some-future-preference-key": "value",
    });
    const backup = buildLegacyBackup(storage);
    expect(backup.annex).not.toHaveProperty("some-future-preference-key");
  });

  it("the allowlist itself only names the keys actually used elsewhere in the app", () => {
    expect(SAFE_LEGACY_ANNEX_KEYS).toEqual(["sunu-theme", "sunu-swipe-hint-seen", "sunu-carnet-page-hint-seen"]);
  });
});

describe("legacyBackupFileName", () => {
  it("formats as tayoo-sauvegarde-YYYY-MM-DD.json", () => {
    expect(legacyBackupFileName(new Date(2026, 8, 1))).toBe("tayoo-sauvegarde-2026-09-01.json");
  });

  it("zero-pads single-digit months and days", () => {
    expect(legacyBackupFileName(new Date(2026, 0, 5))).toBe("tayoo-sauvegarde-2026-01-05.json");
  });
});

describe("verifyLegacyBackup — vérification", () => {
  it("passes when the reparsed backup's raw copy and counters match the source snapshot exactly", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: persistedPayload({
        clients: [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }],
        fiches: [],
      }),
    });
    const backup = buildLegacyBackup(storage);
    const serialized = serializeLegacyBackup(backup);
    const result = verifyLegacyBackup({ normalized: backup.normalized, rawStorageValue: backup.rawStorageValue }, serialized);
    expect(result.status).toBe("ok");
    expect(result.ok).toBe(true);
    expect(result.rawStorageValueMatches).toBe(true);
    expect(result.counts).toEqual({ clients: 1, fiches: 0, modeles: 0 });
  });

  it("fails clearly on invalid JSON instead of throwing", () => {
    const result = verifyLegacyBackup({ normalized: { clients: [], fiches: [], modeles: [] }, rawStorageValue: null }, "{not json");
    expect(result.status).toBe("invalid_json");
    expect(result.ok).toBe(false);
  });

  it("fails clearly on an unexpected structure (wrong format tag)", () => {
    const result = verifyLegacyBackup(
      { normalized: { clients: [], fiches: [], modeles: [] }, rawStorageValue: null },
      JSON.stringify({ format: "something-else" }),
    );
    expect(result.status).toBe("invalid_structure");
    expect(result.ok).toBe(false);
  });

  it("fails clearly when a counter diverges between source and backup", () => {
    const source = {
      normalized: { clients: [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }], fiches: [], modeles: [] },
      rawStorageValue: "raw",
    };
    const tamperedBackup = JSON.stringify({
      format: "tayoo-legacy-backup",
      rawStorageValue: "raw",
      normalized: { clients: [], fiches: [], modeles: [] }, // client silently dropped
    });
    const result = verifyLegacyBackup(source, tamperedBackup);
    expect(result.status).toBe("counts_mismatch");
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.startsWith("clients"))).toBe(true);
  });

  it("fails clearly, with its own distinct status, when the raw copy itself doesn't match — even if the counters happen to agree", () => {
    const source = { normalized: { clients: [], fiches: [], modeles: [] }, rawStorageValue: "original-raw-value" };
    const tampered = JSON.stringify({
      format: "tayoo-legacy-backup",
      rawStorageValue: "SOMETHING-ELSE", // altered/corrupted during serialization
      normalized: { clients: [], fiches: [], modeles: [] },
    });
    const result = verifyLegacyBackup(source, tampered);
    expect(result.status).toBe("raw_mismatch");
    expect(result.ok).toBe(false);
    expect(result.rawStorageValueMatches).toBe(false);
  });

  it("counts legacy media (tissu photos, signature, voice note, modele photos) and flags a mismatch there too", () => {
    const fiche = {
      id: "f1", carnetNumero: 1, numero: 1, nom: "", prenom: "", telephone: "", clientId: null,
      champs: {} as import("./types").Fiche["champs"], voiceNote: { url: "x", duration: 1, recordedAt: "2026-01-01" }, tissuPhotos: [{ id: "p1", dataUrl: "x" }],
      dueDate: null, soldeLe: null, signature: "data:sig", price: 0, avance: 0, garment: "", description: null,
      fabricColor: "#000", status: "recu" as const, late: false, createdAt: "2026-01-01T00:00:00.000Z",
    };
    const source = { normalized: { clients: [], fiches: [fiche], modeles: [] }, rawStorageValue: "raw" };
    const backupSameMedia = JSON.stringify({ format: "tayoo-legacy-backup", rawStorageValue: "raw", normalized: source.normalized });
    expect(verifyLegacyBackup(source, backupSameMedia).status).toBe("ok");

    const strippedFiche = { ...fiche, tissuPhotos: [], signature: null, voiceNote: null };
    const backupMissingMedia = JSON.stringify({
      format: "tayoo-legacy-backup",
      rawStorageValue: "raw",
      normalized: { clients: [], fiches: [strippedFiche], modeles: [] },
    });
    const result = verifyLegacyBackup(source, backupMissingMedia);
    expect(result.status).toBe("counts_mismatch");
    expect(result.mismatches.some((m) => m.startsWith("médias"))).toBe(true);
  });
});
