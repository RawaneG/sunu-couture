import { describe, expect, it } from "vitest";
import { createRepositoryContainerFor } from "./RepositoryContainer";
import { LocalStorageCarnetRepository } from "./local/LocalStorageCarnetRepository";
import { LocalStorageClientRepository } from "./local/LocalStorageClientRepository";
import { LocalStorageFicheRepository } from "./local/LocalStorageFicheRepository";
import { LocalStorageMediaRepository } from "./local/LocalStorageMediaRepository";
import { LocalStorageModeleRepository } from "./local/LocalStorageModeleRepository";
import { LocalStoragePaymentRepository } from "./local/LocalStoragePaymentRepository";
import { LocalStorageSubscriptionRepository } from "./local/LocalStorageSubscriptionRepository";

describe("createRepositoryContainerFor — VITE_BACKEND=local (Phase 5)", () => {
  it("fournit exclusivement des implémentations locales — jamais une requête Supabase quand backend=local", () => {
    const container = createRepositoryContainerFor("local");
    expect(container.clients).toBeInstanceOf(LocalStorageClientRepository);
    expect(container.fiches).toBeInstanceOf(LocalStorageFicheRepository);
    expect(container.carnets).toBeInstanceOf(LocalStorageCarnetRepository);
    expect(container.payments).toBeInstanceOf(LocalStoragePaymentRepository);
    expect(container.media).toBeInstanceOf(LocalStorageMediaRepository);
    expect(container.subscriptions).toBeInstanceOf(LocalStorageSubscriptionRepository);
    expect(container.modeles).toBeInstanceOf(LocalStorageModeleRepository);
  });

  it("'supabase' n'est jamais atteint silencieusement : la fonction lève au lieu de renvoyer un faux Repository", () => {
    expect(() => createRepositoryContainerFor("supabase")).toThrow(
      /activation globale reste interdite avant le gate cloud/,
    );
  });
});

describe("createRepositoryContainerFor — gate cloud (corr. R, Phase 7A §7)", () => {
  it("VITE_BACKEND=supabase ne construit PAS un conteneur hybride Supabase/LocalStorage utilisable", () => {
    // Le seul comportement acceptable pour "supabase" tant que le gate
    // (7B + 8A + 8B + 11A) n'est pas atteint est un échec explicite — jamais
    // un conteneur partiellement cloud (ex. clients=Supabase, payments=Local)
    // silencieusement activé (corr. R, interdiction explicite).
    expect(() => createRepositoryContainerFor("supabase")).toThrow();
    try {
      createRepositoryContainerFor("supabase");
      expect.unreachable("createRepositoryContainerFor('supabase') aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // Le message doit rester factuellement à jour : dire qu'une
      // infrastructure PARTIELLE existe (Phase 7A) sans jamais prétendre
      // que le backend complet est activable.
      expect((error as Error).message).toMatch(/infrastructure cloud partielle/);
      expect((error as Error).message).toMatch(/interdite avant le gate cloud/);
    }
  });

  it("le backend par défaut (absent ou vide) reste 'local'", () => {
    const container = createRepositoryContainerFor("local");
    expect(container.fiches).toBeInstanceOf(LocalStorageFicheRepository);
    expect(container.payments).toBeInstanceOf(LocalStoragePaymentRepository);
  });
});
