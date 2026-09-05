import { describe, expect, it, vi } from "vitest";
import { createPhase8ACloudRepositories, disposePhase8ACloudRepositories } from "./createPhase8ACloudRepositories";
import { SupabaseMediaRepository } from "./SupabaseMediaRepository";
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
  };
}

describe("createPhase8ACloudRepositories", () => {
  it("construit les 4 repositories (7A + media), tous scopés au même atelier", async () => {
    const gateway = fakeGateway();
    const repos = createPhase8ACloudRepositories({ gateway, workshopId: "w1" });

    expect(repos.media).toBeInstanceOf(SupabaseMediaRepository);
    await Promise.all([repos.clients.bootstrapped, repos.carnets.bootstrapped, repos.fiches.bootstrapped, repos.media.bootstrapped]);

    disposePhase8ACloudRepositories(repos);
  });

  it("refuse un workshopId vide", () => {
    expect(() => createPhase8ACloudRepositories({ gateway: fakeGateway(), workshopId: "" })).toThrow(/workshopId requis/);
  });
});
