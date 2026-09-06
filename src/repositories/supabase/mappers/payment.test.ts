import { describe, expect, it } from "vitest";
import { mapAddPaymentInputToInsert, mapClientPaymentRowToDomain, mapFicheBalanceRowToDomain } from "./payment";
import { clientPaymentRowSchema, ficheBalanceRowSchema } from "../schemas";

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

describe("mapClientPaymentRowToDomain", () => {
  it("mappe une ligne complète", () => {
    const row = clientPaymentRowSchema.parse(paymentRow({ paid_at: "2026-01-05T00:00:00.000Z", method: "wave", note: "acompte" }));
    expect(mapClientPaymentRowToDomain(row)).toEqual({
      id: "p1",
      ficheId: "f1",
      amount: 5000,
      paidAt: "2026-01-05T00:00:00.000Z",
      method: "wave",
      note: "acompte",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("paid_at null conservé (jamais une date inventée)", () => {
    const row = clientPaymentRowSchema.parse(paymentRow({ paid_at: null }));
    expect(mapClientPaymentRowToDomain(row).paidAt).toBeNull();
  });

  it("method null conservé", () => {
    const row = clientPaymentRowSchema.parse(paymentRow({ method: null }));
    expect(mapClientPaymentRowToDomain(row).method).toBeNull();
  });

  it("note null conservé", () => {
    const row = clientPaymentRowSchema.parse(paymentRow({ note: null }));
    expect(mapClientPaymentRowToDomain(row).note).toBeNull();
  });

  it("chaque valeur payment_method valide est acceptée", () => {
    for (const method of ["cash", "wave", "orange_money", "free_money", "bank", "other"] as const) {
      const row = clientPaymentRowSchema.parse(paymentRow({ method }));
      expect(mapClientPaymentRowToDomain(row).method).toBe(method);
    }
  });

  it("une ligne malformée (amount manquant) est rejetée atomiquement, jamais mappée silencieusement", () => {
    expect(() => clientPaymentRowSchema.parse({ ...paymentRow(), amount: undefined })).toThrow();
  });

  it("amount 0 ou négatif dans la ligne réseau est rejeté (ledger immuable, jamais une ligne invalide déjà en base)", () => {
    expect(() => clientPaymentRowSchema.parse(paymentRow({ amount: 0 }))).toThrow();
    expect(() => clientPaymentRowSchema.parse(paymentRow({ amount: -100 }))).toThrow();
  });
});

describe("mapAddPaymentInputToInsert", () => {
  it("construit le payload d'insertion sans fournir recorded_at/created_at (defaults serveur)", () => {
    const insert = mapAddPaymentInputToInsert({ ficheId: "f1", amount: 3000 }, "w1");
    expect(insert).toEqual({ workshop_id: "w1", fiche_id: "f1", amount: 3000, paid_at: null, method: null, note: null, metadata: {} });
    expect(insert).not.toHaveProperty("recorded_at");
    expect(insert).not.toHaveProperty("created_at");
  });

  it("propage paidAt/method/note fournis", () => {
    const insert = mapAddPaymentInputToInsert({ ficheId: "f1", amount: 3000, paidAt: "2026-02-01", method: "cash", note: "vu au marché" }, "w1");
    expect(insert).toMatchObject({ paid_at: "2026-02-01", method: "cash", note: "vu au marché" });
  });
});

describe("mapFicheBalanceRowToDomain", () => {
  it("mappe total_price/total_paid/reste tels quels", () => {
    const row = ficheBalanceRowSchema.parse(balanceRow());
    expect(mapFicheBalanceRowToDomain(row)).toEqual({ price: 10000, paid: 5000, reste: 5000 });
  });

  it("reste NÉGATIF (surpaiement) accepté par le schéma et conservé fidèlement, jamais forcé à 0", () => {
    const row = ficheBalanceRowSchema.parse(balanceRow({ total_paid: 12000, reste: -2000 }));
    expect(mapFicheBalanceRowToDomain(row).reste).toBe(-2000);
  });

  it("une ligne malformée (total_price manquant) est rejetée atomiquement", () => {
    expect(() => ficheBalanceRowSchema.parse({ ...balanceRow(), total_price: undefined })).toThrow();
  });

  it("total_price/total_paid négatifs sont rejetés (contrairement à reste)", () => {
    expect(() => ficheBalanceRowSchema.parse(balanceRow({ total_price: -1 }))).toThrow();
    expect(() => ficheBalanceRowSchema.parse(balanceRow({ total_paid: -1 }))).toThrow();
  });
});
