import { describe, expect, it, vi } from "vitest";
import { SupabaseCarnetRepository } from "./SupabaseCarnetRepository";
import type { SupabaseGateway } from "./gateway";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { CarnetRow } from "./schemas";

function fakeCarnetCache(initial: unknown[] = []): IndexedDbCollectionCache<CarnetRow> {
  let stored = initial;
  return {
    readAll: vi.fn(async () => stored),
    writeAll: vi.fn(async (items: Array<{ id: string; data: CarnetRow }>) => {
      stored = items.map((i) => i.data);
    }),
  } as unknown as IndexedDbCollectionCache<CarnetRow>;
}

function fakeGateway(overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({
      data: [
        { id: "carnet-1", workshop_id: "w1", number: 1, status: "active", next_number: 42 },
        { id: "carnet-0", workshop_id: "w1", number: 0 /* jamais réel mais teste juste la lecture */ + 1, status: "archived", next_number: 121 },
      ],
      error: null,
    })),
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
    ...overrides,
  };
}

describe("SupabaseCarnetRepository — lecture seule (corr. R §25)", () => {
  it("refuse un workshopId vide", () => {
    expect(() => new SupabaseCarnetRepository({ gateway: fakeGateway(), workshopId: "" })).toThrow(/workshopId requis/);
  });

  it("getCarnetNumero() résout le numéro humain depuis un carnet_id, après bootstrap", async () => {
    const repo = new SupabaseCarnetRepository({ gateway: fakeGateway(), workshopId: "w1" });
    expect(repo.getCarnetNumero("carnet-1")).toBeUndefined(); // pas encore hydraté
    await repo.bootstrapped;
    expect(repo.getCarnetNumero("carnet-1")).toBe(1);
  });

  it("getCarnetNumero() sur un carnet inconnu renvoie undefined — jamais un fallback inventé", async () => {
    const repo = new SupabaseCarnetRepository({ gateway: fakeGateway(), workshopId: "w1" });
    await repo.bootstrapped;
    expect(repo.getCarnetNumero("carnet-inexistant")).toBeUndefined();
  });

  it("expose CarnetRepository (interface existante) sans créer/modifier aucun carnet", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseCarnetRepository({ gateway, workshopId: "w1" });
    await repo.bootstrapped;
    expect(repo.getActiveCarnetNumero()).toBeGreaterThan(0);
    expect(repo.getNextSlot()).toEqual(expect.objectContaining({ carnetNumero: expect.any(Number), numero: expect.any(Number) }));
    // Aucune méthode d'écriture n'existe sur ce Repository (vérifié à la
    // compilation par l'interface CarnetRepository elle-même — read only).
  });

  it("statut loading → ready", async () => {
    const repo = new SupabaseCarnetRepository({ gateway: fakeGateway(), workshopId: "w1" });
    expect(repo.getStatus()).toEqual({ status: "loading" });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "ready" });
  });
});

describe("SupabaseCarnetRepository — cache-first (revue post-7A, §5)", () => {
  it("cache présent : le carnet réel n°4 est visible AVANT même que le réseau réponde", async () => {
    const cache = fakeCarnetCache([{ id: "carnet-4", workshop_id: "w1", number: 4, status: "active", next_number: 12 }]);
    const gateway = fakeGateway({ listCarnets: vi.fn(() => new Promise<never>(() => {})) }); // réseau ne répond jamais
    const repo = new SupabaseCarnetRepository({ gateway, workshopId: "w1", cache });
    await new Promise((resolve) => setTimeout(resolve, 10)); // laisse hydrateFromCache() s'exécuter
    expect(repo.getCarnetNumero("carnet-4")).toBe(4);
    expect(repo.getActiveCarnetNumero()).toBe(4);
  });

  it("réseau indisponible AVEC cache valide → conserve le vrai numéro de carnet, jamais 1 inventé", async () => {
    const cache = fakeCarnetCache([{ id: "carnet-4", workshop_id: "w1", number: 4, status: "active", next_number: 12 }]);
    const gateway = fakeGateway({ listCarnets: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabaseCarnetRepository({ gateway, workshopId: "w1", cache });
    await repo.bootstrapped;
    expect(repo.getActiveCarnetNumero()).toBe(4); // jamais 1
    expect(repo.getCarnetNumero("carnet-4")).toBe(4);
  });

  it("réseau indisponible SANS cache → statut error contrôlé, jamais carnetNumero/nextSlot = 1 inventés en silence", async () => {
    const gateway = fakeGateway({ listCarnets: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabaseCarnetRepository({ gateway, workshopId: "w1", cache: fakeCarnetCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
    // getActiveCarnetNumero()/getNextSlot() renvoient un 1 dérivé d'une
    // collection VIDE (comportement documenté, comme LocalStorageCarnetRepository
    // sur un atelier neuf) — la distinction "pas de donnée" vs "vraie donnée
    // à 1" reste portée par getStatus(), jamais masquée.
    expect(repo.getActiveCarnetNumero()).toBe(1);
  });

  it("un lot carnets invalide est rejeté en bloc (revue post-7A, §2) — jamais un carnet fantôme partiellement mappé", async () => {
    const gateway = fakeGateway({
      listCarnets: vi.fn(async () => ({
        data: [{ id: "carnet-1", workshop_id: "w1", number: 1, status: "active", next_number: 2 }, { id: "invalide" }],
        error: null,
      })),
    });
    const repo = new SupabaseCarnetRepository({ gateway, workshopId: "w1", cache: fakeCarnetCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
    expect(repo.getCarnetNumero("carnet-1")).toBeUndefined();
  });
});
