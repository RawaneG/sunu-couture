import { describe, expect, it, vi } from "vitest";
import { SupabaseCarnetRepository } from "./SupabaseCarnetRepository";
import type { SupabaseGateway } from "./gateway";

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
