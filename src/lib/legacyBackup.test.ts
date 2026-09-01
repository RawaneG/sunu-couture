import { describe, expect, it } from "vitest";
import {
  buildLegacyBackup,
  serializeLegacyBackup,
  verifyLegacyBackup,
  legacyBackupFileName,
  LEGACY_BACKUP_FORMAT,
  type StorageLike,
} from "./legacyBackup";
import { LEGACY_STORAGE_KEY } from "./store";

/** Minimal in-memory stand-in for `Storage` — only the read surface `buildLegacyBackup` uses. */
function fakeStorage(entries: Record<string, string>): StorageLike {
  const keys = Object.keys(entries);
  return {
    getItem: (key) => (key in entries ? entries[key] : null),
    key: (i) => keys[i] ?? null,
    get length() {
      return keys.length;
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

  it("carries every other localStorage key over verbatim as annex, without touching the main key", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: persistedPayload({ clients: [], fiches: [] }),
      "sunu-theme": "dark",
      "sunu-swipe-hint-seen": "1",
    });
    const backup = buildLegacyBackup(storage);
    expect(backup.annex).toEqual({ "sunu-theme": "dark", "sunu-swipe-hint-seen": "1" });
    expect(backup.annex).not.toHaveProperty(LEGACY_STORAGE_KEY);
  });

  it("reports a corrupted main key clearly (rawParseError) instead of throwing or silently dropping data", () => {
    const backup = buildLegacyBackup(fakeStorage({ [LEGACY_STORAGE_KEY]: "{not json" }));
    expect(backup.rawParseError).not.toBeNull();
    // annex/other keys must still be captured even though the main key failed to parse.
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

  it("never mutates the storage it reads from", () => {
    const raw = persistedPayload({ clients: [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }], fiches: [] });
    const storage = fakeStorage({ [LEGACY_STORAGE_KEY]: raw });
    buildLegacyBackup(storage);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
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
  it("passes when the reparsed backup's counters match the source exactly", () => {
    const storage = fakeStorage({
      [LEGACY_STORAGE_KEY]: persistedPayload({
        clients: [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }],
        fiches: [],
      }),
    });
    const backup = buildLegacyBackup(storage);
    const serialized = serializeLegacyBackup(backup);
    const result = verifyLegacyBackup(backup.normalized, serialized);
    expect(result.status).toBe("ok");
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ clients: 1, fiches: 0, modeles: 0 });
  });

  it("fails clearly on invalid JSON instead of throwing", () => {
    const result = verifyLegacyBackup({ clients: [], fiches: [], modeles: [] }, "{not json");
    expect(result.status).toBe("invalid_json");
    expect(result.ok).toBe(false);
  });

  it("fails clearly on an unexpected structure (wrong format tag)", () => {
    const result = verifyLegacyBackup({ clients: [], fiches: [], modeles: [] }, JSON.stringify({ format: "something-else" }));
    expect(result.status).toBe("invalid_structure");
    expect(result.ok).toBe(false);
  });

  it("fails clearly when a counter diverges between source and backup", () => {
    const source = { clients: [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }], fiches: [], modeles: [] };
    const tamperedBackup = JSON.stringify({
      format: "tayoo-legacy-backup",
      normalized: { clients: [], fiches: [], modeles: [] }, // client silently dropped
    });
    const result = verifyLegacyBackup(source, tamperedBackup);
    expect(result.status).toBe("counts_mismatch");
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.startsWith("clients"))).toBe(true);
  });

  it("counts legacy media (tissu photos, signature, voice note, modele photos) and flags a mismatch there too", () => {
    const fiche = {
      id: "f1", carnetNumero: 1, numero: 1, nom: "", prenom: "", telephone: "", clientId: null,
      champs: {} as import("./types").Fiche["champs"], voiceNote: { url: "x", duration: 1, recordedAt: "2026-01-01" }, tissuPhotos: [{ id: "p1", dataUrl: "x" }],
      dueDate: null, soldeLe: null, signature: "data:sig", price: 0, avance: 0, garment: "", description: null,
      fabricColor: "#000", status: "recu" as const, late: false, createdAt: "2026-01-01T00:00:00.000Z",
    };
    const source = { clients: [], fiches: [fiche], modeles: [] };
    const backupSameMedia = JSON.stringify({ format: "tayoo-legacy-backup", normalized: source });
    expect(verifyLegacyBackup(source, backupSameMedia).status).toBe("ok");

    const strippedFiche = { ...fiche, tissuPhotos: [], signature: null, voiceNote: null };
    const backupMissingMedia = JSON.stringify({ format: "tayoo-legacy-backup", normalized: { clients: [], fiches: [strippedFiche], modeles: [] } });
    const result = verifyLegacyBackup(source, backupMissingMedia);
    expect(result.status).toBe("counts_mismatch");
    expect(result.mismatches.some((m) => m.startsWith("médias"))).toBe(true);
  });
});
