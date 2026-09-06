import { describe, expect, it, vi } from "vitest";
import { SupabasePaymentRepository } from "./SupabasePaymentRepository";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { SupabaseGateway } from "./gateway";
import type { Payment } from "../PaymentRepository";

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    workshop_id: "w1",
    fiche_id: "f1",
    amount: 5000,
    paid_at: null,
    method: null,
    note: null,
    metadata: {},
    recorded_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function balanceRow(overrides: Record<string, unknown> = {}) {
  return {
    workshop_id: "w1",
    fiche_id: "f1",
    total_price: 10000,
    total_paid: 5000,
    reste: 5000,
    is_settled: false,
    ...overrides,
  };
}

function emptyCache(): IndexedDbCollectionCache<Payment> {
  return {
    readAll: vi.fn(async () => []),
    writeAll: vi.fn(async () => undefined),
  } as unknown as IndexedDbCollectionCache<Payment>;
}

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
    listClientPayments: vi.fn(async () => ({ data: [paymentRow()], error: null })),
    listFicheBalances: vi.fn(async () => ({ data: [balanceRow()], error: null })),
    getFicheBalance: vi.fn(async () => ({ data: balanceRow(), error: null })),
    insertClientPayment: vi.fn(async () => ({ data: paymentRow({ id: "new-id" }), error: null })),
    ...overrides,
  };
}

describe("SupabasePaymentRepository — construction", () => {
  it("refuse un workshopId vide — jamais un atelier arbitraire (corr. R §13)", () => {
    expect(() => new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "", cache: emptyCache() })).toThrow(/workshopId requis/);
  });
});

describe("SupabasePaymentRepository — bootstrap (payments + balances)", () => {
  it("loading → ready seulement quand payments ET balances ont répondu", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    expect(repo.getStatus()).toEqual({ status: "loading" });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "ready" });
  });

  it("erreur réseau payments (aucun cache) → error", async () => {
    const gateway = fakeGateway({ listClientPayments: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });

  it("erreur réseau balances (aucune balance connue) → error", async () => {
    const gateway = fakeGateway({ listFicheBalances: vi.fn(async () => ({ data: null, error: { message: "hors ligne" } })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });

  it("snapshot stable : rerender sans mutation renvoie la même référence pour list() et getBalance()", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.list("f1")).toBe(repo.list("f1"));
    expect(repo.getBalance("f1")).toBe(repo.getBalance("f1"));
  });
});

describe("SupabasePaymentRepository — list(ficheId) / mapping DB → Payment", () => {
  it("isole les paiements par fiche", async () => {
    const gateway = fakeGateway({
      listClientPayments: vi.fn(async () => ({ data: [paymentRow({ id: "p1", fiche_id: "f1" }), paymentRow({ id: "p2", fiche_id: "f2" })], error: null })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.list("f1").map((p) => p.id)).toEqual(["p1"]);
    expect(repo.list("f2").map((p) => p.id)).toEqual(["p2"]);
  });

  it("mappe paid_at/method/note null fidèlement, jamais une valeur inventée", async () => {
    const gateway = fakeGateway({
      listClientPayments: vi.fn(async () => ({ data: [paymentRow({ paid_at: "2026-01-05T00:00:00.000Z", method: "wave", note: "acompte" })], error: null })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const p = repo.list("f1")[0];
    expect(p.paidAt).toBe("2026-01-05T00:00:00.000Z");
    expect(p.method).toBe("wave");
    expect(p.note).toBe("acompte");
  });

  it("une ligne réseau invalide fait échouer le lot entier — jamais un résultat partiel", async () => {
    const gateway = fakeGateway({ listClientPayments: vi.fn(async () => ({ data: [paymentRow(), { id: "invalide" }], error: null })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.list("f1")).toEqual([]);
    expect(repo.getStatus().status).toBe("error");
  });
});

describe("SupabasePaymentRepository — getBalance() / vue fiche_balances", () => {
  it("mappe exactement la vue (price/paid/reste)", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 5000, reste: 5000 });
  });

  it("reste NÉGATIF (surpaiement) conservé fidèlement, jamais tronqué à 0", async () => {
    const gateway = fakeGateway({ listFicheBalances: vi.fn(async () => ({ data: [balanceRow({ total_paid: 12000, reste: -2000 })], error: null })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getBalance("f1").reste).toBe(-2000);
  });

  it("balance jamais chargée pour une fiche -> ZERO_BALANCE stable, jamais un objet frais à chaque appel", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getBalance("f-inconnue")).toEqual({ price: 0, paid: 0, reste: 0 });
    expect(repo.getBalance("f-inconnue")).toBe(repo.getBalance("f-inconnue"));
  });
});

describe("SupabasePaymentRepository — add()", () => {
  it("amount > 0 : INSERT confirmé, row commitée, balance rafraîchie", async () => {
    const gateway = fakeGateway({
      insertClientPayment: vi.fn(async () => ({ data: paymentRow({ id: "new-id", amount: 3000 }), error: null })),
      getFicheBalance: vi.fn(async () => ({ data: balanceRow({ total_paid: 8000, reste: 2000 }), error: null })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;

    const payment = await repo.add({ ficheId: "f1", amount: 3000 });

    expect(payment.id).toBe("new-id");
    expect(payment.amount).toBe(3000);
    expect(gateway.insertClientPayment).toHaveBeenCalledWith(expect.objectContaining({ workshop_id: "w1", fiche_id: "f1", amount: 3000 }));
    expect(repo.list("f1").some((p) => p.id === "new-id")).toBe(true);
    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 8000, reste: 2000 });
    expect(repo.getLastBalanceRefreshError()).toBeNull();
  });

  it("amount = 0 rejeté AVANT tout appel gateway", async () => {
    const gateway = fakeGateway();
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ ficheId: "f1", amount: 0 })).rejects.toThrow();
    expect(gateway.insertClientPayment).not.toHaveBeenCalled();
  });

  it("amount négatif rejeté", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ ficheId: "f1", amount: -500 })).rejects.toThrow();
  });

  it("amount décimal rejeté", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await expect(repo.add({ ficheId: "f1", amount: 100.5 })).rejects.toThrow();
  });

  it("rejet serveur de l'INSERT -> aucune mutation locale", async () => {
    const gateway = fakeGateway({ insertClientPayment: vi.fn(async () => ({ data: null, error: { message: "refus RLS" } })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const before = repo.list("f1").length;
    await expect(repo.add({ ficheId: "f1", amount: 1000 })).rejects.toThrow("refus RLS");
    expect(repo.list("f1")).toHaveLength(before);
  });

  it("INSERT succès + refresh balance succès -> balance actualisée", async () => {
    const gateway = fakeGateway({
      insertClientPayment: vi.fn(async () => ({ data: paymentRow({ id: "new-id" }), error: null })),
      getFicheBalance: vi.fn(async () => ({ data: balanceRow({ total_paid: 9000, reste: 1000 }), error: null })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    await repo.add({ ficheId: "f1", amount: 4000 });
    expect(repo.getBalance("f1").reste).toBe(1000);
  });

  it("INSERT succès + refresh balance échec -> payment reste créé, aucun second INSERT, aucun faux rollback (§24)", async () => {
    const gateway = fakeGateway({
      insertClientPayment: vi.fn(async () => ({ data: paymentRow({ id: "new-id" }), error: null })),
      getFicheBalance: vi.fn(async () => ({ data: null, error: { message: "balance refresh down" } })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;

    // add() NE rejette PAS malgré l'échec du refresh balance — le paiement est réel.
    const payment = await repo.add({ ficheId: "f1", amount: 4000 });

    expect(payment.id).toBe("new-id");
    expect(repo.list("f1").some((p) => p.id === "new-id")).toBe(true); // payment conservé
    expect(gateway.insertClientPayment).toHaveBeenCalledTimes(1); // aucun second INSERT
    expect(repo.getLastBalanceRefreshError()).not.toBeNull(); // erreur signalée
    // Ancienne balance (du bootstrap) conservée, jamais remplacée par un faux zéro.
    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 5000, reste: 5000 });
  });
});

describe("SupabasePaymentRepository — refreshBalance() ciblé (§28, price → balance resync)", () => {
  it("price serveur modifié : refreshBalance(ficheId) actualise le solde sans recalcul local", async () => {
    const gateway = fakeGateway({ getFicheBalance: vi.fn(async () => ({ data: balanceRow(), error: null })) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 5000, reste: 5000 });

    gateway.getFicheBalance = vi.fn(async () => ({ data: balanceRow({ total_price: 12000, reste: 7000 }), error: null }));
    await repo.refreshBalance("f1");

    expect(repo.getBalance("f1")).toEqual({ price: 12000, paid: 5000, reste: 7000 });
  });

  it("refreshBalance() échoué conserve l'ancienne balance, jamais un faux zéro", async () => {
    const repo = new SupabasePaymentRepository({ gateway: fakeGateway(), workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const before = repo.getBalance("f1");

    const gateway2 = fakeGateway({ getFicheBalance: vi.fn(async () => ({ data: null, error: { message: "down" } })) });
    const repo2 = new SupabasePaymentRepository({ gateway: gateway2, workshopId: "w1", cache: emptyCache() });
    await repo2.bootstrapped;
    await repo2.refreshBalance("f1");
    expect(repo2.getBalance("f1")).toEqual(before);
    expect(repo2.getLastBalanceRefreshError()).not.toBeNull();
  });

  it("refreshBalance(f1) est un upsert CIBLÉ — ne détruit PAS la balance déjà connue de f2 (régression corr. ciblée)", async () => {
    const gateway = fakeGateway({
      listFicheBalances: vi.fn(async () => ({
        data: [
          balanceRow({ fiche_id: "f1", total_price: 10000, total_paid: 5000, reste: 5000 }),
          balanceRow({ fiche_id: "f2", total_price: 20000, total_paid: 2000, reste: 18000 }),
        ],
        error: null,
      })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 5000, reste: 5000 });
    expect(repo.getBalance("f2")).toEqual({ price: 20000, paid: 2000, reste: 18000 });
    const f2Before = repo.getBalance("f2");

    gateway.getFicheBalance = vi.fn(async () => ({
      data: balanceRow({ fiche_id: "f1", total_price: 12000, total_paid: 5000, reste: 7000 }),
      error: null,
    }));
    await repo.refreshBalance("f1");

    expect(repo.getBalance("f1")).toEqual({ price: 12000, paid: 5000, reste: 7000 });
    expect(repo.getBalance("f2")).toEqual({ price: 20000, paid: 2000, reste: 18000 });
    expect(repo.getBalance("f2")).toBe(f2Before); // référence inchangée — f2 n'a jamais été retouchée
  });

  it("add() (chemin réel INSERT → refreshBalance interne) ne détruit pas les balances des autres fiches", async () => {
    const gateway = fakeGateway({
      listFicheBalances: vi.fn(async () => ({
        data: [
          balanceRow({ fiche_id: "f1", total_price: 10000, total_paid: 5000, reste: 5000 }),
          balanceRow({ fiche_id: "f2", total_price: 20000, total_paid: 2000, reste: 18000 }),
        ],
        error: null,
      })),
      insertClientPayment: vi.fn(async () => ({ data: paymentRow({ id: "new-id", fiche_id: "f1", amount: 3000 }), error: null })),
      getFicheBalance: vi.fn(async () => ({ data: balanceRow({ fiche_id: "f1", total_price: 10000, total_paid: 8000, reste: 2000 }), error: null })),
    });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache: emptyCache() });
    await repo.bootstrapped;
    const f2Before = repo.getBalance("f2");

    await repo.add({ ficheId: "f1", amount: 3000 });

    expect(repo.getBalance("f1")).toEqual({ price: 10000, paid: 8000, reste: 2000 });
    expect(repo.getBalance("f2")).toEqual({ price: 20000, paid: 2000, reste: 18000 });
    expect(repo.getBalance("f2")).toBe(f2Before);
  });
});

describe("SupabasePaymentRepository — cache IndexedDB", () => {
  it("hydrate depuis le cache immédiatement, puis corrige avec le réseau", async () => {
    const cachedPayment = { id: "cached", ficheId: "f1", amount: 1000, paidAt: null, method: null, note: null, recordedAt: "2026-01-01T00:00:00.000Z" };
    const cache = {
      readAll: vi.fn(async () => [cachedPayment]),
      writeAll: vi.fn(async () => undefined),
    } as unknown as IndexedDbCollectionCache<Payment>;

    let resolveNetwork!: (v: { data: unknown[]; error: null }) => void;
    const networkPromise = new Promise<{ data: unknown[]; error: null }>((r) => (resolveNetwork = r));
    const gateway = fakeGateway({ listClientPayments: vi.fn(() => networkPromise) });
    const repo = new SupabasePaymentRepository({ gateway, workshopId: "w1", cache });

    await Promise.resolve();
    await Promise.resolve();
    expect(repo.list("f1").map((p) => p.id)).toEqual(["cached"]);

    resolveNetwork({ data: [paymentRow({ id: "server" })], error: null });
    await repo.bootstrapped;
    expect(repo.list("f1").map((p) => p.id)).toEqual(["server"]);
  });
});
