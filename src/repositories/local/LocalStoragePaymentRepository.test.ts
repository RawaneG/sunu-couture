import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../../lib/store";
import { RepositoryValidationError } from "../schemas";
import { LocalStorageFicheRepository } from "./LocalStorageFicheRepository";
import { LocalStoragePaymentRepository } from "./LocalStoragePaymentRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStoragePaymentRepository — contrat", () => {
  it("list() est vide tant qu'aucune avance n'a été versée", async () => {
    const fiches = new LocalStorageFicheRepository();
    const id = await fiches.add();
    expect(new LocalStoragePaymentRepository().list(id)).toEqual([]);
  });

  it("setAmount() fait apparaître un unique paiement représentant l'avance", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await payments.setAmount(id, 15000);
    expect(payments.list(id)).toEqual([{ id: `${id}-avance`, ficheId: id, amount: 15000 }]);
  });

  it("setAmount() REMPLACE l'avance précédente plutôt que de l'accumuler", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await payments.setAmount(id, 10000);
    await payments.setAmount(id, 15000);
    expect(payments.list(id)).toEqual([{ id: `${id}-avance`, ficheId: id, amount: 15000 }]);
  });

  it("setAmount() rejette un montant négatif ou non entier avec une RepositoryValidationError", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await expect(payments.setAmount(id, -100)).rejects.toThrow(RepositoryValidationError);
    await expect(payments.setAmount(id, 100.5)).rejects.toThrow(RepositoryValidationError);
  });

  it("getBalance() calcule reste = price - paid, jamais stocké", async () => {
    const fiches = new LocalStorageFicheRepository();
    const payments = new LocalStoragePaymentRepository();
    const id = await fiches.add();
    await fiches.setInfo(id, { price: 25000 });
    await payments.setAmount(id, 15000);
    expect(payments.getBalance(id)).toEqual({ price: 25000, paid: 15000, reste: 10000 });
  });

  it("getBalance() sur une fiche inconnue renvoie des zéros plutôt que de lever une exception", () => {
    expect(new LocalStoragePaymentRepository().getBalance("inconnue")).toEqual({ price: 0, paid: 0, reste: 0 });
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
    await payments.setAmount(id, 5000);
    const after = payments.list(id);
    expect(after).not.toBe(before);
  });
});
