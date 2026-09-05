import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useStore } from "../../lib/store";
import { RepositoryValidationError } from "../schemas";
import { LocalStorageClientRepository } from "./LocalStorageClientRepository";

// Isolation entre tests : chaque test repart d'un store vide (jamais des
// données de seed de démo), sans dépendre de l'ordre d'exécution.
beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStorageClientRepository — contrat", () => {
  it("list() renvoie un tableau vide quand il n'y a aucun client", () => {
    expect(new LocalStorageClientRepository().list()).toEqual([]);
  });

  it("add() crée un client et le rend immédiatement visible via list()/get() (mutation Zustand synchrone sous la Promise)", async () => {
    const repo = new LocalStorageClientRepository();
    const id = await repo.add({ name: "Awa Diouf", phone: "77 512 44 08", photo: null });
    expect(repo.list().map((c) => c.id)).toEqual([id]);
    expect(repo.get(id)?.name).toBe("Awa Diouf");
  });

  it("get() renvoie undefined pour un id inconnu (pas d'exception)", () => {
    expect(new LocalStorageClientRepository().get("inconnu")).toBeUndefined();
  });

  it("remove() supprime un seul client sans toucher aux autres (pas de perte de données)", async () => {
    const repo = new LocalStorageClientRepository();
    const a = await repo.add({ name: "Awa Diouf", phone: "", photo: null });
    const b = await repo.add({ name: "Modou Fall", phone: "", photo: null });
    await repo.remove(a);
    expect(repo.list().map((c) => c.id)).toEqual([b]);
  });

  it("removeMany() supprime exactement les ids demandés, sans perte des autres", async () => {
    const repo = new LocalStorageClientRepository();
    const a = await repo.add({ name: "Awa", phone: "", photo: null });
    const b = await repo.add({ name: "Modou", phone: "", photo: null });
    const c = await repo.add({ name: "Fatou", phone: "", photo: null });
    await repo.removeMany([a, c]);
    expect(repo.list().map((x) => x.id)).toEqual([b]);
  });

  it("add() rejette une entrée invalide avec une RepositoryValidationError, sans créer de client", async () => {
    const repo = new LocalStorageClientRepository();
    // @ts-expect-error — phone doit être une string, on force une entrée invalide
    await expect(repo.add({ name: "Awa", phone: 12345, photo: null })).rejects.toThrow(RepositoryValidationError);
    expect(repo.list()).toEqual([]);
  });
});

describe("LocalStorageClientRepository — persistance et compatibilité", () => {
  it("les données créées par une instance restent visibles depuis une NOUVELLE instance (backend partagé, pas d'état par instance)", async () => {
    const first = new LocalStorageClientRepository();
    const id = await first.add({ name: "Awa Diouf", phone: "77 512 44 08", photo: null });

    const second = new LocalStorageClientRepository();
    expect(second.get(id)?.name).toBe("Awa Diouf");
  });

  it("reste compatible avec des données déjà présentes dans le store avant la création du Repository", () => {
    useStore.setState({
      clients: [{ id: "pre-existing", name: "Client déjà là", phone: "70 000 00 00", photo: null, colorSeed: "teal" }],
    });
    const repo = new LocalStorageClientRepository();
    expect(repo.get("pre-existing")?.name).toBe("Client déjà là");
    expect(repo.list()).toHaveLength(1);
  });
});

describe("LocalStorageClientRepository — réactivité (subscribe/unsubscribe)", () => {
  it("notifie le listener quand la collection clients change réellement", async () => {
    const repo = new LocalStorageClientRepository();
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);

    await repo.add({ name: "Awa", phone: "", photo: null });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("ne notifie plus après unsubscribe()", async () => {
    const repo = new LocalStorageClientRepository();
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);
    unsubscribe();

    await repo.add({ name: "Awa", phone: "", photo: null });
    expect(listener).not.toHaveBeenCalled();
  });

  it("ne notifie pas pour un changement d'une autre tranche du store (fiches, pas clients)", () => {
    const repo = new LocalStorageClientRepository();
    const listener = vi.fn();
    repo.subscribe(listener);

    useStore.getState().addFiche();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("LocalStorageClientRepository — aucune écriture à la lecture", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    setItemSpy.mockRestore();
  });

  it("list() et get() ne déclenchent jamais d'écriture dans localStorage", () => {
    useStore.setState({
      clients: [{ id: "c1", name: "Awa", phone: "", photo: null, colorSeed: "indigo" }],
    });
    const repo = new LocalStorageClientRepository();
    setItemSpy.mockClear();

    repo.list();
    repo.get("c1");
    repo.get("inconnu");

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
