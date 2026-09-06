import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../../lib/store";
import type { PaymentRepository } from "../PaymentRepository";
import { RepositoryValidationError } from "../schemas";
import { LocalStorageFicheRepository } from "./LocalStorageFicheRepository";
import { LocalStoragePaymentRepository } from "./LocalStoragePaymentRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStoragePaymentRepository — contrat", () => {
  it("list() est vide tant qu'aucun versement n'a été ajouté", async () => {
    const fiches = new LocalStorageFicheRepository();
    const id = await fiches.add();
    expect(new LocalStoragePaymentRepository().list(id)).toEqual([]);
  });

  it("add() fait apparaître un unique paiement SYNTHÉTIQUE représentant l'agrégat courant", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await payments.add({ ficheId: id, amount: 15000 });
    const list = payments.list(id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: `${id}-avance`, ficheId: id, amount: 15000 });
  });

  it("add() ACCUMULE (ancien total + nouveau versement) plutôt que de remplacer — jamais 7000 → 2000", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await payments.add({ ficheId: id, amount: 5000 });
    await payments.add({ ficheId: id, amount: 2000 });
    expect(payments.list(id)[0]).toMatchObject({ amount: 7000 });
    expect(payments.getBalance(id).paid).toBe(7000);
  });

  it("add() renvoie LE VERSEMENT AJOUTÉ (son propre montant), distinct de l'agrégat affiché par list()", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await payments.add({ ficheId: id, amount: 5000 });
    const added = await payments.add({ ficheId: id, amount: 2000 });
    expect(added.amount).toBe(2000); // pas 7000
    expect(added.ficheId).toBe(id);
    expect(added.paidAt).toBeNull();
    expect(added.method).toBeNull();
  });

  it("add() rejette un montant 0, négatif, décimal, NaN ou Infinity avec une RepositoryValidationError", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await expect(payments.add({ ficheId: id, amount: 0 })).rejects.toThrow(RepositoryValidationError);
    await expect(payments.add({ ficheId: id, amount: -100 })).rejects.toThrow(RepositoryValidationError);
    await expect(payments.add({ ficheId: id, amount: 100.5 })).rejects.toThrow(RepositoryValidationError);
    await expect(payments.add({ ficheId: id, amount: NaN })).rejects.toThrow(RepositoryValidationError);
    await expect(payments.add({ ficheId: id, amount: Infinity })).rejects.toThrow(RepositoryValidationError);
  });

  it("add() sur une fiche introuvable rejette explicitement — 0 mutation", async () => {
    const payments = new LocalStoragePaymentRepository();
    await expect(payments.add({ ficheId: "inconnue", amount: 1000 })).rejects.toThrow(/introuvable/);
  });

  it("getBalance() calcule reste = price - paid, jamais stocké", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await fiches.setInfo(id, { price: 25000 });
    await payments.add({ ficheId: id, amount: 15000 });
    expect(payments.getBalance(id)).toEqual({ price: 25000, paid: 15000, reste: 10000 });
  });

  it("getBalance() sur une fiche inconnue renvoie des zéros plutôt que de lever une exception", () => {
    expect(new LocalStoragePaymentRepository().getBalance("inconnue")).toEqual({ price: 0, paid: 0, reste: 0 });
  });

  it("getLastBalanceRefreshError()/refreshBalance() sont absents en local (aucun rafraîchissement réseau)", () => {
    const payments: PaymentRepository = new LocalStoragePaymentRepository();
    expect(payments.getLastBalanceRefreshError).toBeUndefined();
    expect(payments.refreshBalance).toBeUndefined();
  });
});

describe("LocalStoragePaymentRepository — stabilité du snapshot (contrat useSyncExternalStore)", () => {
  it("list() renvoie la MÊME référence de tableau tant que les fiches n'ont pas changé", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    const first = payments.list(id);
    const second = payments.list(id);
    expect(second).toBe(first);
  });

  it("list() renvoie une NOUVELLE référence après une mutation réelle", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    const before = payments.list(id);
    await payments.add({ ficheId: id, amount: 5000 });
    const after = payments.list(id);
    expect(after).not.toBe(before);
  });
});
