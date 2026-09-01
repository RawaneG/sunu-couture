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
    expect(() => createRepositoryContainerFor("supabase")).toThrow(/non géré/);
  });
});
