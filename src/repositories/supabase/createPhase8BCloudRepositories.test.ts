import { describe, expect, it, vi } from "vitest";
import { createPhase8BCloudRepositories, disposePhase8BCloudRepositories } from "./createPhase8BCloudRepositories";
import { SupabaseMediaRepository } from "./SupabaseMediaRepository";
import { SupabaseModeleRepository } from "./SupabaseModeleRepository";
import type { SupabaseGateway } from "./gateway";

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
    listActiveModeles: vi.fn(async () => ({ data: [], error: null })),
    getModeleById: vi.fn(async () => ({ data: null, error: null })),
    insertModele: vi.fn(async () => ({ data: null, error: null })),
    updateModeleNom: vi.fn(async () => ({ data: null, error: null })),
    softDeleteModeles: vi.fn(async () => ({ data: null, error: null })),
    listActiveModeleMedias: vi.fn(async () => ({ data: [], error: null })),
    insertModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    deleteModeleMedia: vi.fn(async () => ({ data: null, error: null })),
    listClientPayments: vi.fn(async () => ({ data: [], error: null })),
    listFicheBalances: vi.fn(async () => ({ data: [], error: null })),
    getFicheBalance: vi.fn(async () => ({ data: null, error: null })),
    insertClientPayment: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
}

function modeleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    workshop_id: "w1",
    nom: "Robe wax",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function modeleMediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mm1",
    workshop_id: "w1",
    modele_id: "m1",
    kind: "photo",
    storage_path: "workshops/w1/modeles/m1/file1",
    mime_type: "image/jpeg",
    size_bytes: 100,
    position: 0,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function ficheMediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fm1",
    workshop_id: "w1",
    fiche_id: "f1",
    type: "fabric_photo",
    storage_path: "workshops/w1/fiches/f1/file1",
    mime_type: "image/jpeg",
    size_bytes: 100,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
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

describe("createPhase8BCloudRepositories — correctif ciblé : suppression modèle n'empoisonne pas le cache/refresh média", () => {
  it("§10 : remove('m1') évince immédiatement ses médias, laisse les médias fiche intacts", async () => {
    const gateway = fakeGateway({
      listActiveModeles: vi.fn(async () => ({ data: [modeleRow({ id: "m1" })], error: null })),
      listActiveModeleMedias: vi.fn(async () => ({ data: [modeleMediaRow({ id: "mm1", modele_id: "m1" })], error: null })),
      listActiveMediaAssets: vi.fn(async () => ({ data: [ficheMediaRow({ id: "fm1", fiche_id: "f1" })], error: null })),
    });
    const repos = createPhase8BCloudRepositories({ gateway, workshopId: "w1" });
    await Promise.all([repos.media.bootstrapped, repos.modeles.bootstrapped]);

    expect(repos.media.listModelePhotos("m1")).toHaveLength(1);
    expect(repos.media.listFichePhotos("f1")).toHaveLength(1);

    await repos.modeles.remove("m1");

    expect(repos.modeles.get("m1")).toBeUndefined();
    expect(repos.media.listModelePhotos("m1")).toEqual([]); // évincé du cache mémoire
    expect(repos.media.listFichePhotos("f1")).toHaveLength(1); // JAMAIS touché

    disposePhase8BCloudRepositories(repos);
  });

  it("§10 : un soft-delete REJETÉ par le serveur -> 0 appel du callback, cache média et store modèle inchangés", async () => {
    const gateway = fakeGateway({
      listActiveModeles: vi.fn(async () => ({ data: [modeleRow({ id: "m1" })], error: null })),
      listActiveModeleMedias: vi.fn(async () => ({ data: [modeleMediaRow({ id: "mm1", modele_id: "m1" })], error: null })),
      softDeleteModeles: vi.fn(async () => ({ data: null, error: { message: "refus RLS" } })),
    });
    const repos = createPhase8BCloudRepositories({ gateway, workshopId: "w1" });
    await Promise.all([repos.media.bootstrapped, repos.modeles.bootstrapped]);

    await expect(repos.modeles.remove("m1")).rejects.toThrow("refus RLS");

    expect(repos.modeles.get("m1")).toBeDefined(); // store modèle inchangé
    expect(repos.media.listModelePhotos("m1")).toHaveLength(1); // cache média inchangé

    disposePhase8BCloudRepositories(repos);
  });

  it("§11 : le prochain rafraîchissement signé périodique NE tente plus le path du modèle supprimé ; le média fiche est resigné normalement, aucun échec/retry", async () => {
    vi.useFakeTimers();
    try {
      const signedPaths: string[] = [];
      const gateway = fakeGateway({
        listActiveModeles: vi.fn(async () => ({ data: [modeleRow({ id: "m1" })], error: null })),
        listActiveModeleMedias: vi.fn(async () => ({
          data: [modeleMediaRow({ id: "mm1", modele_id: "m1", storage_path: "workshops/w1/modeles/m1/file1" })],
          error: null,
        })),
        listActiveMediaAssets: vi.fn(async () => ({
          data: [ficheMediaRow({ id: "fm1", fiche_id: "f1", storage_path: "workshops/w1/fiches/f1/file1" })],
          error: null,
        })),
        createSignedMediaUrl: vi.fn(async (path: string) => {
          signedPaths.push(path);
          return { data: `https://signed.example${path}`, error: null };
        }),
      });
      const repos = createPhase8BCloudRepositories({ gateway, workshopId: "w1" });
      await Promise.all([repos.media.bootstrapped, repos.modeles.bootstrapped]);

      signedPaths.length = 0; // ignore les signatures de bootstrap

      await repos.modeles.remove("m1");

      // Cycle nominal du rafraîchissement signé périodique (240s).
      await vi.advanceTimersByTimeAsync(240_000);

      expect(signedPaths).not.toContain("workshops/w1/modeles/m1/file1");
      expect(signedPaths).toContain("workshops/w1/fiches/f1/file1");
      // Aucun échec/retry causé par le path stale du modèle supprimé.
      expect(repos.media.getLastRefreshError()).toBeNull();

      disposePhase8BCloudRepositories(repos);
    } finally {
      vi.useRealTimers();
    }
  });

  it("§12 : removeMany(['m1','m2']) évince les médias des DEUX modèles", async () => {
    const gateway = fakeGateway({
      listActiveModeles: vi.fn(async () => ({ data: [modeleRow({ id: "m1" }), modeleRow({ id: "m2", nom: "Autre" })], error: null })),
      listActiveModeleMedias: vi.fn(async () => ({
        data: [modeleMediaRow({ id: "mm1", modele_id: "m1" }), modeleMediaRow({ id: "mm2", modele_id: "m2", storage_path: "workshops/w1/modeles/m2/file1" })],
        error: null,
      })),
    });
    const repos = createPhase8BCloudRepositories({ gateway, workshopId: "w1" });
    await Promise.all([repos.media.bootstrapped, repos.modeles.bootstrapped]);

    expect(repos.media.listModelePhotos("m1")).toHaveLength(1);
    expect(repos.media.listModelePhotos("m2")).toHaveLength(1);

    await repos.modeles.removeMany(["m1", "m2"]);

    expect(repos.media.listModelePhotos("m1")).toEqual([]);
    expect(repos.media.listModelePhotos("m2")).toEqual([]);

    disposePhase8BCloudRepositories(repos);
  });
});
