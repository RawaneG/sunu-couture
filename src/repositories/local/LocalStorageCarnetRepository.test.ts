import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "../../lib/store";
import { LocalStorageCarnetRepository } from "./LocalStorageCarnetRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStorageCarnetRepository — contrat", () => {
  it("un carnet vide commence au carnet n° 1, prochaine fiche n° 1", () => {
    const repo = new LocalStorageCarnetRepository();
    expect(repo.getActiveCarnetNumero()).toBe(1);
    expect(repo.getNextSlot()).toEqual({ carnetNumero: 1, numero: 1 });
  });

  it("suit la création de fiches (carnet actif = le plus grand carnetNumero observé)", () => {
    const repo = new LocalStorageCarnetRepository();
    useStore.getState().addFiche();
    useStore.getState().addFiche();
    expect(repo.getActiveCarnetNumero()).toBe(1);
    expect(repo.getNextSlot()).toEqual({ carnetNumero: 1, numero: 3 });
  });
});

describe("LocalStorageCarnetRepository — stabilité du snapshot (contrat useSyncExternalStore)", () => {
  it("getNextSlot() renvoie la MÊME référence tant que les fiches n'ont pas changé", () => {
    const repo = new LocalStorageCarnetRepository();
    const first = repo.getNextSlot();
    const second = repo.getNextSlot();
    expect(second).toBe(first); // même référence, pas seulement égal en valeur
  });

  it("getNextSlot() renvoie une NOUVELLE référence après une mutation réelle des fiches", () => {
    const repo = new LocalStorageCarnetRepository();
    const before = repo.getNextSlot();
    useStore.getState().addFiche();
    const after = repo.getNextSlot();
    expect(after).not.toBe(before);
    expect(after).toEqual({ carnetNumero: 1, numero: 2 });
  });
});
