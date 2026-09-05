import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createPhase7ACloudRepositories, disposePhase7ACloudRepositories } from "./createPhase7ACloudRepositories";
import type { SupabaseGateway } from "./gateway";

function ficheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    workshop_id: "w1",
    carnet_id: "carnet-1",
    client_id: null,
    number: 1,
    page_number: 1,
    slot_number: 1,
    state: "active",
    status: "received",
    measurements: {},
    garment: "Boubou",
    description: null,
    fabric_notes: null,
    quantity: 1,
    due_date: null,
    total_price: 10000,
    settled_at: null,
    version: 1,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    is_late: false,
    ...overrides,
  };
}

function fakeGateway(workshopId: string, overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({
      data: [{ id: "carnet-1", workshop_id: workshopId, number: 1, status: "active", next_number: 2 }],
      error: null,
    })),
    listActiveFiches: vi.fn(async () => ({ data: [ficheRow({ workshop_id: workshopId })], error: null })),
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

describe("createPhase7ACloudRepositories — construction", () => {
  it("refuse un workshopId vide", () => {
    expect(() => createPhase7ACloudRepositories({ gateway: fakeGateway("w1"), workshopId: "" })).toThrow(
      /workshopId requis/,
    );
  });

  it("fiches et carnets partagent le même atelier — carnetNumero se résout correctement de bout en bout", async () => {
    const repos = createPhase7ACloudRepositories({ gateway: fakeGateway("w1"), workshopId: "w1" });
    await Promise.all([repos.clients.bootstrapped, repos.carnets.bootstrapped, repos.fiches.bootstrapped]);
    expect(repos.fiches.get("f1")?.carnetNumero).toBe(1);
    disposePhase7ACloudRepositories(repos);
  });
});

describe("createPhase7ACloudRepositories — reload retrouve le cache (corr. R §35)", () => {
  it("après dispose puis reconstruction pour le MÊME atelier, une nouvelle instance retrouve la fiche depuis IndexedDB avant même le réseau", async () => {
    const workshopId = `w-reload-${Math.random()}`;
    const gateway = fakeGateway(workshopId);

    const first = createPhase7ACloudRepositories({ gateway, workshopId });
    await Promise.all([first.carnets.bootstrapped, first.fiches.bootstrapped]);
    expect(first.fiches.get("f1")).toBeDefined();
    disposePhase7ACloudRepositories(first);

    // Laisse le temps à l'écriture cache asynchrone (best-effort) de se terminer.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const networkGateway = fakeGateway(workshopId, {
      // Simule un réseau qui ne répond jamais tout de suite — le cache doit
      // quand même rendre la fiche visible avant cette résolution.
      listActiveFiches: vi.fn(() => new Promise<never>(() => {})),
      listCarnets: vi.fn(() => new Promise<never>(() => {})),
    });
    const second = createPhase7ACloudRepositories({ gateway: networkGateway, workshopId });
    // On n'attend PAS `bootstrapped` (le réseau ne répondra jamais ici) —
    // seule l'hydratation cache, plus rapide, doit avoir eu le temps de courir.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second.fiches.get("f1")).toBeDefined();
    disposePhase7ACloudRepositories(second);
  });
});

describe("createPhase7ACloudRepositories — isolation par atelier (corr. R §17/§32)", () => {
  it("le cache de l'atelier A n'est jamais visible pour l'atelier B", async () => {
    const gatewayA = fakeGateway("workshop-a", {
      listActiveFiches: vi.fn(async () => ({ data: [ficheRow({ id: "fA", workshop_id: "workshop-a" })], error: null })),
    });
    const reposA = createPhase7ACloudRepositories({ gateway: gatewayA, workshopId: "workshop-a" });
    await Promise.all([reposA.carnets.bootstrapped, reposA.fiches.bootstrapped]);
    expect(reposA.fiches.get("fA")).toBeDefined();
    disposePhase7ACloudRepositories(reposA);

    const gatewayB = fakeGateway("workshop-b", {
      listActiveFiches: vi.fn(async () => ({ data: [ficheRow({ id: "fB", workshop_id: "workshop-b" })], error: null })),
    });
    const reposB = createPhase7ACloudRepositories({ gateway: gatewayB, workshopId: "workshop-b" });
    await Promise.all([reposB.carnets.bootstrapped, reposB.fiches.bootstrapped]);
    expect(reposB.fiches.get("fA")).toBeUndefined();
    expect(reposB.fiches.get("fB")).toBeDefined();
    disposePhase7ACloudRepositories(reposB);
  });
});
