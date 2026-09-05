import { describe, expect, it, vi } from "vitest";
import { SupabaseClientRepository } from "./SupabaseClientRepository";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { SupabaseGateway } from "./gateway";
import type { Client } from "../../lib/types";

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    workshop_id: "w1",
    display_name: "Awa Diouf",
    first_name: null,
    last_name: null,
    nickname: null,
    phone_e164: "+221775124408",
    phone_display: "77 512 44 08",
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function emptyCache(): IndexedDbCollectionCache<Client> {
  return {
    readAll: vi.fn(async () => []),
    writeAll: vi.fn(async () => undefined),
  } as unknown as IndexedDbCollectionCache<Client>;
}

function fakeGateway(overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [clientRow()], error: null })),
    insertClient: vi.fn(async () => ({ data: clientRow({ id: "new-id", display_name: "Nouveau" }), error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({ data: [], error: null })),
    listActiveFiches: vi.fn(async () => ({ data: [], error: null })),
    getFicheById: vi.fn(async () => ({ data: null, error: null })),
    updateFiche: vi.fn(async () => ({ data: null, error: null })),
    softDeleteFiches: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
}

describe("SupabaseClientRepository — construction", () => {
  it("refuse un workshopId vide — jamais un atelier arbitraire (corr. R §13)", () => {
    expect(() => new SupabaseClientRepository({ gateway: fakeGateway(), workshopId: "", cache: emptyCache() })).toThrow(
      /workshopId requis/,
    );
  });
});

describe("SupabaseClientRepository — contrat", () => {
  it("list()/get() sont vides puis hydratés après bootstrap (cache vide → réseau)", async () => {
    const repo = new SupabaseClientRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    expect(repo.list()).toEqual([]);
    await repo.bootstrapped;
    expect(repo.list().map((c) => c.id)).toEqual(["c1"]);
    expect(repo.get("c1")?.name).toBe("Awa Diouf");
  });

  it("scope explicitement l'atelier : listActiveClients reçoit le bon workshopId", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseClientRepository({ gateway, workshopId: "workshop-xyz", cache: emptyCache() });
    await repo.bootstrapped;
    expect(gateway.listActiveClients).toHaveBeenCalledWith("workshop-xyz");
  });

  it("add() insère puis rend le client immédiatement visible via list()/get()", async () => {
    const repo = new SupabaseClientRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const id = await repo.add({ name: "Nouveau", phone: "", photo: null });
    expect(id).toBe("new-id");
    expect(repo.get("new-id")?.name).toBe("Nouveau");
  });

  it("add() propage une erreur Supabase sans créer d'entrée locale (aucun write silencieux)", async () => {
    const gateway = fakeGateway({ insertClient: vi.fn(async () => ({ data: null, error: { message: "insert refusé" } })) });
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ name: "X", phone: "", photo: null })).rejects.toThrow("insert refusé");
    expect(repo.list().some((c) => c.name === "X")).toBe(false);
  });

  it("remove() est un SOFT DELETE — la ligne disparaît de list() localement après confirmation serveur", async () => {
    const repo = new SupabaseClientRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.get("c1")).toBeDefined();
    await repo.remove("c1");
    expect(repo.get("c1")).toBeUndefined();
  });

  it("removeMany() scope le workshopId et les ids passés au gateway", async () => {
    const gateway = fakeGateway();
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await repo.removeMany(["c1"]);
    expect(gateway.softDeleteClients).toHaveBeenCalledWith("w1", ["c1"]);
  });

  it("removeMany() propage une erreur serveur sans supprimer localement (aucun write silencieux)", async () => {
    const gateway = fakeGateway({ softDeleteClients: vi.fn(async () => ({ data: null, error: { message: "refus RLS" } })) });
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.removeMany(["c1"])).rejects.toThrow("refus RLS");
    expect(repo.get("c1")).toBeDefined();
  });

  it("une row invalide est REJETÉE (log) sans faire planter le repository ni corrompre le cache", async () => {
    const gateway = fakeGateway({
      listActiveClients: vi.fn(async () => ({
        data: [clientRow(), { id: "invalide" /* champs requis manquants */ }],
        error: null,
      })),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.list().map((c) => c.id)).toEqual(["c1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("les lignes supprimées (deleted_at) sont exclues au niveau de la requête, jamais affichées comme actives", async () => {
    // Vérifie que le Repository DEMANDE bien l'exclusion (le filtrage réel
    // est fait côté SQL/gateway — testé ici via l'appel effectif).
    const gateway = fakeGateway();
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(gateway.listActiveClients).toHaveBeenCalled();
  });
});

describe("SupabaseClientRepository — statut observable (loading/ready/error)", () => {
  it("getStatus() passe loading → ready après bootstrap réussi", async () => {
    const repo = new SupabaseClientRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    expect(repo.getStatus()).toEqual({ status: "loading" });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "ready" });
  });

  it("getStatus() passe à 'error' si le réseau échoue et qu'aucun cache n'existe", async () => {
    const gateway = fakeGateway({ listActiveClients: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabaseClientRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });
});
