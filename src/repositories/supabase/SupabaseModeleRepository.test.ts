import { describe, expect, it, vi } from "vitest";
import { SupabaseModeleRepository } from "./SupabaseModeleRepository";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { SupabaseGateway } from "./gateway";
import type { Modele } from "../../lib/types";

function modeleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mod1",
    workshop_id: "w1",
    nom: "Robe wax",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function emptyCache(): IndexedDbCollectionCache<Modele> {
  return {
    readAll: vi.fn(async () => []),
    writeAll: vi.fn(async () => undefined),
  } as unknown as IndexedDbCollectionCache<Modele>;
}

function fakeGateway(overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({ data: [], error: null })),
    listActiveFiches: vi.fn(async () => ({ data: [], error: null })),
    getFicheById: vi.fn(async () => ({ data: null, error: null })),
    updateFiche: vi.fn(async () => ({ data: null, error: null })),
    softDeleteFiches: vi.fn(async () => ({ data: null, error: null })),
    createFicheFromDraft: vi.fn(async () => ({ data: null, error: null })),
    listActiveMediaAssets: vi.fn(async () => ({ data: [], error: null })),
    insertMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    softDeleteMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    restoreMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    uploadMediaObject: vi.fn(async () => ({ data: null, error: null })),
    createSignedMediaUrl: vi.fn(async () => ({ data: "https://example.test/signed", error: null })),
    downloadMediaObject: vi.fn(async () => ({ data: new Blob(), error: null })),
    listActiveModeles: vi.fn(async () => ({ data: [modeleRow()], error: null })),
    getModeleById: vi.fn(async () => ({ data: modeleRow(), error: null })),
    insertModele: vi.fn(async () => ({ data: modeleRow({ id: "new-id", nom: "Nouveau modèle" }), error: null })),
    updateModeleNom: vi.fn(async () => ({ data: modeleRow({ nom: "Renommé" }), error: null })),
    softDeleteModeles: vi.fn(async () => ({ data: null, error: null })),
    listActiveModeleMedias: vi.fn(async () => ({ data: [], error: null })),
    insertModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    deleteModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
}

describe("SupabaseModeleRepository — construction", () => {
  it("refuse un workshopId vide — jamais un atelier arbitraire (corr. R §13)", () => {
    expect(() => new SupabaseModeleRepository({ gateway: fakeGateway(), workshopId: "", cache: emptyCache() })).toThrow(/workshopId requis/);
  });
});

describe("SupabaseModeleRepository — statut observable (loading/ready/error)", () => {
  it("getStatus() passe loading → ready après bootstrap réussi", async () => {
    const repo = new SupabaseModeleRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    expect(repo.getStatus()).toEqual({ status: "loading" });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "ready" });
  });

  it("getStatus() passe à 'error' si le réseau échoue et qu'aucun cache n'existe", async () => {
    const gateway = fakeGateway({ listActiveModeles: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });
});

describe("SupabaseModeleRepository — contrat", () => {
  it("list()/get() sont vides puis hydratés après bootstrap — photos/patronPhotos vides (non autoritatifs ici)", async () => {
    const repo = new SupabaseModeleRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    expect(repo.list()).toEqual([]);
    await repo.bootstrapped;
    expect(repo.list().map((m) => m.id)).toEqual(["mod1"]);
    const m = repo.get("mod1");
    expect(m?.nom).toBe("Robe wax");
    expect(m?.photos).toEqual([]);
    expect(m?.patronPhotos).toEqual([]);
  });

  it("scope explicitement l'atelier : listActiveModeles reçoit le bon workshopId", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "workshop-xyz", cache: emptyCache() });
    await repo.bootstrapped;
    expect(gateway.listActiveModeles).toHaveBeenCalledWith("workshop-xyz");
  });

  it("un lot réseau contenant une ligne invalide (nom vide) est rejeté EN BLOC — jamais un résultat partiel", async () => {
    const gateway = fakeGateway({
      listActiveModeles: vi.fn(async () => ({ data: [modeleRow(), modeleRow({ id: "invalide", nom: "" })], error: null })),
    });
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.list()).toEqual([]);
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });

  it("add() valide le nom (1..200 après trim), insère avec le bon workshop_id, et rend le modèle immédiatement visible", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const id = await repo.add({ nom: "Nouveau modèle" });
    expect(id).toBe("new-id");
    expect(gateway.insertModele).toHaveBeenCalledWith(expect.objectContaining({ workshop_id: "w1", nom: "Nouveau modèle" }));
    expect(repo.get("new-id")?.nom).toBe("Nouveau modèle");
  });

  it("add() rejette un nom vide/blanc AVANT tout appel gateway — jamais un fallback inventé", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ nom: "" })).rejects.toThrow();
    await expect(repo.add({ nom: "   " })).rejects.toThrow();
    await expect(repo.add({ nom: "x".repeat(201) })).rejects.toThrow();
    expect(gateway.insertModele).not.toHaveBeenCalled();
  });

  it("add() propage une erreur serveur sans créer d'entrée locale", async () => {
    const gateway = fakeGateway({ insertModele: vi.fn(async () => ({ data: null, error: { message: "insert refusé" } })) });
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ nom: "X" })).rejects.toThrow("insert refusé");
    expect(repo.list().some((m) => m.nom === "X")).toBe(false);
  });

  it("setNom() valide, met à jour via le serveur (aucune écriture optimiste), et applique la ligne renvoyée", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await repo.setNom("mod1", "Renommé");
    expect(gateway.updateModeleNom).toHaveBeenCalledWith("w1", "mod1", "Renommé");
    expect(repo.get("mod1")?.nom).toBe("Renommé");
  });

  it("setNom() rejette un nom vide — jamais envoyé au serveur", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.setNom("mod1", "   ")).rejects.toThrow();
    expect(gateway.updateModeleNom).not.toHaveBeenCalled();
  });

  it("remove() est un SOFT DELETE (deleted_at) — la ligne disparaît de list() localement après confirmation serveur", async () => {
    const repo = new SupabaseModeleRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.get("mod1")).toBeDefined();
    await repo.remove("mod1");
    expect(repo.get("mod1")).toBeUndefined();
  });

  it("removeMany() (bulk) scope le workshopId et les ids passés au gateway", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await repo.removeMany(["mod1"]);
    expect(gateway.softDeleteModeles).toHaveBeenCalledWith("w1", ["mod1"]);
    expect(repo.get("mod1")).toBeUndefined();
  });

  it("removeMany() propage une erreur serveur sans supprimer localement", async () => {
    const gateway = fakeGateway({ softDeleteModeles: vi.fn(async () => ({ data: null, error: { message: "refus RLS" } })) });
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.removeMany(["mod1"])).rejects.toThrow("refus RLS");
    expect(repo.get("mod1")).toBeDefined();
  });
});

describe("SupabaseModeleRepository — cache IndexedDB", () => {
  it("hydrate depuis le cache immédiatement, puis corrige avec le réseau", async () => {
    // Forme CACHE (`storedModeleSchema`) — distincte de la row réseau brute
    // (`modeleRow()`) : `createdAt` camelCase, `photos`/`patronPhotos`
    // toujours vides ici (non autoritatifs, voir `mappers/modele.ts`).
    const cachedModele = { id: "cached", nom: "Depuis le cache", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" };
    const cache = {
      readAll: vi.fn(async () => [cachedModele]),
      writeAll: vi.fn(async () => undefined),
    } as unknown as IndexedDbCollectionCache<Modele>;
    // Réseau volontairement retardé (résolu manuellement plus bas) — sans
    // ça, la promesse réseau mockée se résout dans le même microtask que
    // l'hydratation cache, rendant l'étape intermédiaire inobservable.
    let resolveNetwork!: (v: { data: unknown[]; error: null }) => void;
    const networkPromise = new Promise<{ data: unknown[]; error: null }>((r) => (resolveNetwork = r));
    const gateway = fakeGateway({ listActiveModeles: vi.fn(() => networkPromise) });
    const repo = new SupabaseModeleRepository({ gateway, workshopId: "w1", cache });
    await Promise.resolve(); // laisse hydrateFromCache() (micro-tasks du cache) se terminer
    await Promise.resolve();
    expect(repo.list().map((m) => m.id)).toEqual(["cached"]);
    resolveNetwork({ data: [modeleRow({ id: "server", nom: "Depuis le réseau" })], error: null });
    await repo.bootstrapped;
    expect(repo.list().map((m) => m.id)).toEqual(["server"]);
  });

  it("un cache invalide (forme obsolète) est ignoré — le réseau prend seul le relais, jamais un affichage réparé", async () => {
    const cache = {
      readAll: vi.fn(async () => [{ id: "corrompu" }]),
      writeAll: vi.fn(async () => undefined),
    } as unknown as IndexedDbCollectionCache<Modele>;
    const repo = new SupabaseModeleRepository({ gateway: fakeGateway(), workshopId: "w1", cache });
    await repo.bootstrapped;
    expect(repo.list().map((m) => m.id)).toEqual(["mod1"]);
  });
});
