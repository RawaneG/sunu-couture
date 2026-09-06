import { describe, expect, it, vi } from "vitest";
import { createPhase8BCloudRepositories, disposePhase8BCloudRepositories } from "./createPhase8BCloudRepositories";
import { SupabaseMediaRepository } from "./SupabaseMediaRepository";
import { SupabaseModeleRepository } from "./SupabaseModeleRepository";
import type { SupabaseGateway } from "./gateway";

function fakeGateway(): SupabaseGateway {
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
    listActiveModeles: vi.fn(async () => ({ data: [], error: null })),
    getModeleById: vi.fn(async () => ({ data: null, error: null })),
    insertModele: vi.fn(async () => ({ data: null, error: null })),
    updateModeleNom: vi.fn(async () => ({ data: null, error: null })),
    softDeleteModeles: vi.fn(async () => ({ data: null, error: null })),
    listActiveModeleMedias: vi.fn(async () => ({ data: [], error: null })),
    insertModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    deleteModeleMedia: vi.fn(async () => ({ data: null, error: null })),
  };
}

describe("createPhase8BCloudRepositories", () => {
  it("construit les 5 repositories (7A + media + modeles), tous scopés au même atelier", async () => {
    const gateway = fakeGateway();
    const repos = createPhase8BCloudRepositories({ gateway, workshopId: "w1" });

    expect(repos.media).toBeInstanceOf(SupabaseMediaRepository);
    expect(repos.modeles).toBeInstanceOf(SupabaseModeleRepository);
    await Promise.all([
      repos.clients.bootstrapped,
      repos.carnets.bootstrapped,
      repos.fiches.bootstrapped,
      repos.media.bootstrapped,
      repos.modeles.bootstrapped,
    ]);
    expect(gateway.listActiveModeles).toHaveBeenCalledWith("w1");

    disposePhase8BCloudRepositories(repos);
  });

  it("refuse un workshopId vide", () => {
    expect(() => createPhase8BCloudRepositories({ gateway: fakeGateway(), workshopId: "" })).toThrow(/workshopId requis/);
  });
});
