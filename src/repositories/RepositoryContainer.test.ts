import { describe, expect, it, vi } from "vitest";
import { createRepositoryContainerFor } from "./RepositoryContainer";
import { LocalStorageCarnetRepository } from "./local/LocalStorageCarnetRepository";
import { LocalStorageClientRepository } from "./local/LocalStorageClientRepository";
import { LocalStorageFicheRepository } from "./local/LocalStorageFicheRepository";
import { LocalStorageMediaRepository } from "./local/LocalStorageMediaRepository";
import { LocalStorageModeleRepository } from "./local/LocalStorageModeleRepository";
import { LocalStoragePaymentRepository } from "./local/LocalStoragePaymentRepository";
import { LocalStorageSubscriptionRepository } from "./local/LocalStorageSubscriptionRepository";
import { SupabaseCarnetRepository } from "./supabase/SupabaseCarnetRepository";
import { SupabaseClientRepository } from "./supabase/SupabaseClientRepository";
import { SupabaseFicheRepository } from "./supabase/SupabaseFicheRepository";
import { SupabaseMediaRepository } from "./supabase/SupabaseMediaRepository";
import { SupabaseModeleRepository } from "./supabase/SupabaseModeleRepository";
import { SupabasePaymentRepository } from "./supabase/SupabasePaymentRepository";
import type { SupabaseGateway } from "./supabase/gateway";

/** Gateway factice complet — aucune requête réseau réelle, chaque méthode
 * renvoie une réponse vide "réussie" par défaut. Permet de construire le lot
 * cloud complet Phase 11A sans jamais toucher `src/lib/supabase/client.ts`
 * ni exiger `VITE_SUPABASE_*`. */
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
    listClientPayments: vi.fn(async () => ({ data: [], error: null })),
    listFicheBalances: vi.fn(async () => ({ data: [], error: null })),
    getFicheBalance: vi.fn(async () => ({ data: null, error: null })),
    insertClientPayment: vi.fn(async () => ({ data: null, error: null })),
  };
}

describe("createRepositoryContainerFor — VITE_BACKEND=local", () => {
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

  it("le backend par défaut (absent ou vide) reste 'local'", () => {
    const container = createRepositoryContainerFor("local");
    expect(container.fiches).toBeInstanceOf(LocalStorageFicheRepository);
    expect(container.payments).toBeInstanceOf(LocalStoragePaymentRepository);
  });

  it("aucune méthode `dispose()` — le conteneur local n'a rien à libérer", () => {
    const container = createRepositoryContainerFor("local");
    expect(container.dispose).toBeUndefined();
  });
});

describe("createRepositoryContainerFor — VITE_BACKEND=supabase (gate atteint)", () => {
  it("construit le lot cloud complet Phase 11A pour les domaines migrés — jamais leurs versions LocalStorage", () => {
    const container = createRepositoryContainerFor("supabase", { workshopId: "w1", supabaseGateway: fakeGateway() });
    expect(container.clients).toBeInstanceOf(SupabaseClientRepository);
    expect(container.fiches).toBeInstanceOf(SupabaseFicheRepository);
    expect(container.carnets).toBeInstanceOf(SupabaseCarnetRepository);
    expect(container.payments).toBeInstanceOf(SupabasePaymentRepository);
    expect(container.media).toBeInstanceOf(SupabaseMediaRepository);
    expect(container.modeles).toBeInstanceOf(SupabaseModeleRepository);
    container.dispose?.();
  });

  it("subscriptions reste l'adaptateur pilote LocalStorage — Phase 14 n'existe pas encore, ce n'est pas un fallback métier cloud", () => {
    const container = createRepositoryContainerFor("supabase", { workshopId: "w1", supabaseGateway: fakeGateway() });
    expect(container.subscriptions).toBeInstanceOf(LocalStorageSubscriptionRepository);
    container.dispose?.();
  });

  it("workshopId manquant/vide -> échec explicite, jamais un fallback local (corr. Gate §7/§21)", () => {
    expect(() => createRepositoryContainerFor("supabase", { supabaseGateway: fakeGateway() })).toThrow(/workshopId/);
    expect(() => createRepositoryContainerFor("supabase", { workshopId: "", supabaseGateway: fakeGateway() })).toThrow(/workshopId/);
  });

  it("supabaseGateway manquant -> échec explicite, jamais un fallback local (corr. Gate §6/§20)", () => {
    expect(() => createRepositoryContainerFor("supabase", { workshopId: "w1" })).toThrow(/supabaseGateway/);
  });

  it("aucun paramètre du tout -> échec explicite (le gateway est vérifié en premier)", () => {
    expect(() => createRepositoryContainerFor("supabase")).toThrow(/supabaseGateway/);
  });

  it("dispose() libère exactement UNE fois le lot cloud complet (aucun double dispose, aucun oubli)", () => {
    const gateway = fakeGateway();
    const container = createRepositoryContainerFor("supabase", { workshopId: "w1", supabaseGateway: gateway });
    const clientsDisposeSpy = vi.spyOn(container.clients as SupabaseClientRepository, "dispose");
    const fichesDisposeSpy = vi.spyOn(container.fiches as SupabaseFicheRepository, "dispose");
    const carnetsDisposeSpy = vi.spyOn(container.carnets as SupabaseCarnetRepository, "dispose");
    const mediaDisposeSpy = vi.spyOn(container.media as SupabaseMediaRepository, "dispose");
    const modelesDisposeSpy = vi.spyOn(container.modeles as SupabaseModeleRepository, "dispose");
    const paymentsDisposeSpy = vi.spyOn(container.payments as SupabasePaymentRepository, "dispose");

    container.dispose?.();

    expect(clientsDisposeSpy).toHaveBeenCalledTimes(1);
    expect(fichesDisposeSpy).toHaveBeenCalledTimes(1);
    expect(carnetsDisposeSpy).toHaveBeenCalledTimes(1);
    expect(mediaDisposeSpy).toHaveBeenCalledTimes(1);
    expect(modelesDisposeSpy).toHaveBeenCalledTimes(1);
    expect(paymentsDisposeSpy).toHaveBeenCalledTimes(1);
  });
});
