import { describe, expect, it } from "vitest";
import { resteFor, nextFicheSlot, migrateLegacyState } from "./store";
import { matchesQuery } from "./search";
import { FICHES_PAR_CARNET } from "./entitlements";
import type { Fiche, FicheChamp, FicheChampKey } from "./types";
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "./types";

function emptyChamps(): Record<FicheChampKey, FicheChamp> {
  const champs = {} as Record<FicheChampKey, FicheChamp>;
  for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) champs[key] = { valeur: "", historique: [] };
  return champs;
}

function makeFiche(overrides: Partial<Fiche>): Fiche {
  return {
    id: "f", carnetNumero: 1, numero: 1, nom: "", prenom: "", telephone: "", clientId: null,
    champs: emptyChamps(), voiceNote: null, tissuPhotos: [], dueDate: new Date().toISOString(),
    soldeLe: null, signature: null, price: 0, avance: 0,
    garment: "", description: null, fabricColor: "#000",
    status: "recu", late: false, createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("resteFor", () => {
  it("subtracts the avance from the price", () => {
    const fiche = makeFiche({ price: 25000, avance: 15000 });
    expect(resteFor(fiche)).toBe(10000);
  });

  it("is 0 once the avance covers the price exactly", () => {
    const fiche = makeFiche({ price: 20000, avance: 20000 });
    expect(resteFor(fiche)).toBe(0);
  });

  it("can go negative when overpaid — callers clamp for display, resteFor itself doesn't", () => {
    const fiche = makeFiche({ price: 10000, avance: 15000 });
    expect(resteFor(fiche)).toBe(-5000);
  });
});

describe("nextFicheSlot — carnet lifecycle", () => {
  it("starts a brand new carnet at fiche 1", () => {
    expect(nextFicheSlot([])).toEqual({ carnetNumero: 1, numero: 1 });
  });

  it("assigns the next number within the active carnet", () => {
    const fiches = [makeFiche({ carnetNumero: 1, numero: 1 }), makeFiche({ carnetNumero: 1, numero: 2 })];
    expect(nextFicheSlot(fiches)).toEqual({ carnetNumero: 1, numero: 3 });
  });

  it("rolls over to a new carnet once 120 slots are taken", () => {
    const fiches = Array.from({ length: FICHES_PAR_CARNET }, (_, i) => makeFiche({ carnetNumero: 1, numero: i + 1 }));
    expect(nextFicheSlot(fiches)).toEqual({ carnetNumero: 2, numero: 1 });
  });

  it("never reuses a number, even for a carnet with gaps from deleted fiches", () => {
    const fiches = [makeFiche({ carnetNumero: 1, numero: 1 }), makeFiche({ carnetNumero: 1, numero: 5 })];
    expect(nextFicheSlot(fiches)).toEqual({ carnetNumero: 1, numero: 6 });
  });
});

describe("matchesQuery — recherche globale", () => {
  it("matches a fiche by its numero", () => {
    expect(matchesQuery("24", "Fatou Ndiaye", "70 845 21 63", 24)).toBe(true);
    expect(matchesQuery("24", "Fatou Ndiaye", "70 845 21 63", 18)).toBe(false);
  });

  it("matches a phone number with spaces", () => {
    expect(matchesQuery("77 512", "Awa Diouf", "77 512 44 08")).toBe(true);
  });

  it("is accent- and case-insensitive on the garment/name fields", () => {
    expect(matchesQuery("boubou", "BOUBOU wax bleu")).toBe(true);
    expect(matchesQuery("ndiaye", "Fatou Ndiaye")).toBe(true);
  });
});

describe("migrateLegacyState — v8 → v9", () => {
  it("carries every legacy order and legacy fiche over, losing no records", () => {
    const legacy = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }],
      orders: [
        { id: "o1", clientId: "c1", garment: "Boubou", fabricColor: "#123", photo: null, voiceNote: null, measurementsText: null, dueDate: "2026-01-01T00:00:00.000Z", dueDateStart: null, price: 25000, status: "couture", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      fiches: [
        { id: "f1", numero: 1, nom: "Sow", prenom: "Khady", telephone: "77 402 68 91", voiceNote: null, champs: {}, tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches).toHaveLength(2);
    expect(fiches.map((f) => f.id).sort()).toEqual(["f1", "o1"]);
  });

  it("keeps a legacy fiche's own nom/prenom/telephone verbatim, exactly as written on paper", () => {
    const legacy = {
      fiches: [
        { id: "f1", numero: 1, nom: "Fall", prenom: "Modou", telephone: "76 233 90 17", voiceNote: null, champs: {}, tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches[0].nom).toBe("Fall");
    expect(fiches[0].prenom).toBe("Modou");
    expect(fiches[0].telephone).toBe("76 233 90 17");
  });

  it("links a legacy fiche to an existing client by phone as a bonus, without touching its own nom/prenom", () => {
    const legacy = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }],
      fiches: [
        { id: "f1", numero: 1, nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", voiceNote: null, champs: {}, tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const { clients, fiches } = migrateLegacyState(legacy);
    expect(clients).toHaveLength(1);
    expect(fiches[0].clientId).toBe("c1");
    expect(fiches[0].nom).toBe("Diouf");
  });

  it("leaves clientId null (not an orphan-forcing new client) when no registered client matches", () => {
    const legacy = {
      fiches: [
        { id: "f1", numero: 1, nom: "Fall", prenom: "Modou", telephone: "76 233 90 17", voiceNote: null, champs: {}, tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const { clients, fiches } = migrateLegacyState(legacy);
    expect(clients).toHaveLength(0);
    expect(fiches[0].clientId).toBeNull();
    expect(fiches[0].nom).toBe("Fall");
  });

  it("converts legacy prix/avance champs into plain price/avance numbers", () => {
    const legacy = {
      fiches: [
        {
          id: "f1", numero: 1, nom: "Diouf", prenom: "Awa", telephone: "", voiceNote: null,
          champs: { prix: { valeur: "25000", historique: [] }, avance: { valeur: "10000", historique: [] } },
          tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches[0].price).toBe(25000);
    expect(fiches[0].avance).toBe(10000);
  });

  it("normalizes an already-unified fiche stuck on an intermediate shape (payments array, no avance) instead of wiping its price/avance", () => {
    const legacy = {
      fiches: [
        {
          id: "f1", carnetNumero: 1, numero: 1, nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", clientId: "c1",
          champs: {}, voiceNote: null, tissuPhotos: [], dueDate: "2026-08-20T00:00:00.000Z", soldeLe: null, signature: null,
          price: 45000, payments: [{ id: "p1", montant: 15000, date: "2026-08-01T00:00:00.000Z" }],
          garment: "Costume", description: null, fabricColor: "#123", status: "recu", late: false,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches).toHaveLength(1);
    expect(fiches[0].price).toBe(45000);
    expect(fiches[0].avance).toBe(15000);
    expect(fiches[0].dueDate).toBe("2026-08-20T00:00:00.000Z");
    expect(Number.isNaN(fiches[0].avance)).toBe(false);
  });

  it("leaves a legacy fiche's retrait date null rather than inventing a default", () => {
    const legacy = {
      fiches: [
        { id: "f1", numero: 1, nom: "Diouf", prenom: "Awa", telephone: "", voiceNote: null, champs: {}, tissuPhotos: [], retraitLe: null, soldeLe: null, signature: null, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches[0].dueDate).toBeNull();
  });

  it("fills a migrated order's identity fields from its linked client, since orders never had their own nom/prenom", () => {
    const legacy = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }],
      orders: [
        { id: "o1", clientId: "c1", garment: "Costume", fabricColor: "#123", photo: null, voiceNote: null, measurementsText: null, dueDate: "2026-01-01T00:00:00.000Z", dueDateStart: null, price: 45000, status: "recu", createdAt: "2026-01-05T00:00:00.000Z" },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches[0].nom).toBe("Awa Diouf");
    expect(fiches[0].telephone).toBe("77 512 44 08");
  });

  it("folds a client's leftover measurementsText into their most recent fiche instead of discarding it", () => {
    const legacy = {
      clients: [{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo", measurementsText: "Épaule 46, poitrine 102" }],
      orders: [
        { id: "o1", clientId: "c1", garment: "Costume", fabricColor: "#123", photo: null, voiceNote: null, measurementsText: null, dueDate: "2026-01-01T00:00:00.000Z", dueDateStart: null, price: 45000, status: "recu", createdAt: "2026-01-05T00:00:00.000Z" },
      ],
    };
    const { fiches } = migrateLegacyState(legacy);
    expect(fiches[0].description).toBe("Épaule 46, poitrine 102");
  });

  // Phase 6A (docs/refonte/02-PLAN-MIGRATION.md §5.1.2) : migrateLegacyState()
  // doit aussi produire `modeles`, sans jamais supprimer une donnée inattendue.
  it("carries modeles over unchanged when already shaped like today's Modele[]", () => {
    const legacy = {
      modeles: [{ id: "m1", nom: "Boubou wax", photos: [{ id: "p1", dataUrl: "data:x" }], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" }],
    };
    const { modeles } = migrateLegacyState(legacy);
    expect(modeles).toEqual(legacy.modeles);
  });

  it("defaults missing modele fields instead of dropping the record (no silent data loss)", () => {
    const legacy = { modeles: [{ id: "m1" }] };
    const { modeles } = migrateLegacyState(legacy);
    expect(modeles).toHaveLength(1);
    expect(modeles[0]).toMatchObject({ id: "m1", nom: "", photos: [], patronPhotos: [] });
  });

  it("defaults modeles to an empty array on a persisted store from before the catalogue feature existed", () => {
    const { modeles } = migrateLegacyState({ clients: [], fiches: [] });
    expect(modeles).toEqual([]);
  });
});
