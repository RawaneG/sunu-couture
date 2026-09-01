import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../../lib/store";
import { RepositoryValidationError } from "../schemas";
import { LocalStorageFicheRepository } from "./LocalStorageFicheRepository";
import { LocalStoragePaymentRepository } from "./LocalStoragePaymentRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStoragePaymentRepository — contrat", () => {
  it("list() est vide tant qu'aucune avance n'a été versée", () => {
    const fiches = new LocalStorageFicheRepository();
    const id = fiches.add();
    expect(new LocalStoragePaymentRepository().list(id)).toEqual([]);
  });

  it("setAmount() fait apparaître un unique paiement représentant l'avance", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    payments.setAmount(id, 15000);
    expect(payments.list(id)).toEqual([{ id: `${id}-avance`, ficheId: id, amount: 15000 }]);
  });

  it("setAmount() REMPLACE l'avance précédente plutôt que de l'accumuler", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    payments.setAmount(id, 10000);
    payments.setAmount(id, 15000);
    expect(payments.list(id)).toEqual([{ id: `${id}-avance`, ficheId: id, amount: 15000 }]);
  });

  it("setAmount() rejette un montant négatif ou non entier avec une RepositoryValidationError", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    expect(() => payments.setAmount(id, -100)).toThrow(RepositoryValidationError);
    expect(() => payments.setAmount(id, 100.5)).toThrow(RepositoryValidationError);
  });

  it("getBalance() calcule reste = price - paid, jamais stocké", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    fiches.setInfo(id, { price: 25000 });
    payments.setAmount(id, 15000);
    expect(payments.getBalance(id)).toEqual({ price: 25000, paid: 15000, reste: 10000 });
  });

  it("getBalance() sur une fiche inconnue renvoie des zéros plutôt que de lever une exception", () => {
    expect(new LocalStoragePaymentRepository().getBalance("inconnue")).toEqual({ price: 0, paid: 0, reste: 0 });
  });
});

describe("LocalStoragePaymentRepository — stabilité du snapshot (contrat useSyncExternalStore)", () => {
  it("list() renvoie la MÊME référence de tableau tant que les fiches n'ont pas changé", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    const first = payments.list(id);
    const second = payments.list(id);
    expect(second).toBe(first);
  });

  it("list() renvoie une NOUVELLE référence après une mutation réelle", () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = fiches.add();
    const before = payments.list(id);
    payments.setAmount(id, 5000);
    const after = payments.list(id);
    expect(after).not.toBe(before);
  });
});
