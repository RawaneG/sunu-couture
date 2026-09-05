import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useStore } from "../../lib/store";
import { RepositoryValidationError } from "../schemas";
import { LocalStorageFicheRepository } from "./LocalStorageFicheRepository";

beforeEach(() => {
  useStore.setState({ clients: [], fiches: [], modeles: [] });
});

describe("LocalStorageFicheRepository — contrat", () => {
  it("add() sans argument crée une fiche vierge au prochain emplacement du carnet actif", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    const fiche = repo.get(id);
    expect(fiche?.carnetNumero).toBe(1);
    expect(fiche?.numero).toBe(1);
    expect(fiche?.status).toBe("recu");
  });

  it("add() avec des champs pré-remplis les reporte tels quels sur la nouvelle fiche", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add({ clientId: "c1", prenom: "Awa", nom: "Diouf", telephone: "77 512 44 08" });
    const fiche = repo.get(id);
    expect(fiche?.clientId).toBe("c1");
    expect(fiche?.prenom).toBe("Awa");
    expect(fiche?.nom).toBe("Diouf");
    expect(fiche?.telephone).toBe("77 512 44 08");
  });

  it("listByClient() ne renvoie que les fiches du client demandé", async () => {
    const repo = new LocalStorageFicheRepository();
    const idA = await repo.add({ clientId: "c1" });
    await repo.add({ clientId: "c2" });
    expect(repo.listByClient("c1").map((f) => f.id)).toEqual([idA]);
  });

  it("setInfo() applique un patch partiel sans toucher aux autres champs", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    await repo.setInfo(id, { garment: "Boubou", price: 25000 });
    const fiche = repo.get(id)!;
    expect(fiche.garment).toBe("Boubou");
    expect(fiche.price).toBe(25000);
    expect(fiche.nom).toBe("");
  });

  it("setInfo() rejette un patch de forme invalide avec une RepositoryValidationError", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    // @ts-expect-error — price doit être un number
    await expect(repo.setInfo(id, { price: "beaucoup" })).rejects.toThrow(RepositoryValidationError);
  });

  it("setChamp() garde un historique et restoreChamp() y revient", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    await repo.setChamp(id, "E", "46");
    await repo.setChamp(id, "E", "48");
    expect(repo.get(id)!.champs.E.valeur).toBe("48");
    await repo.restoreChamp(id, "E");
    expect(repo.get(id)!.champs.E.valeur).toBe("46");
  });

  it("strikeChamp() vide la valeur en conservant l'historique pour restoreChamp()", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    await repo.setChamp(id, "E", "46");
    await repo.strikeChamp(id, "E");
    expect(repo.get(id)!.champs.E.valeur).toBe("");
    await repo.restoreChamp(id, "E");
    expect(repo.get(id)!.champs.E.valeur).toBe("46");
  });

  it("advance() fait avancer le statut d'une étape", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add();
    expect(repo.get(id)!.status).toBe("recu");
    await repo.advance(id);
    expect(repo.get(id)!.status).toBe("couture");
  });

  it("remove() et removeMany() ne suppriment que les fiches ciblées (pas de perte de données)", async () => {
    const repo = new LocalStorageFicheRepository();
    const a = await repo.add();
    const b = await repo.add();
    const c = await repo.add();
    await repo.remove(a);
    expect(repo.list().map((f) => f.id)).toEqual([c, b]);
    await repo.removeMany([b, c]);
    expect(repo.list()).toEqual([]);
  });
});

describe("LocalStorageFicheRepository — persistance et compatibilité", () => {
  it("une fiche créée par une instance reste visible depuis une nouvelle instance", async () => {
    const id = await new LocalStorageFicheRepository().add({ nom: "Sow" });
    const second = new LocalStorageFicheRepository();
    expect(second.get(id)?.nom).toBe("Sow");
  });
});

describe("LocalStorageFicheRepository — réactivité", () => {
  it("notifie le listener quand la collection fiches change", async () => {
    const repo = new LocalStorageFicheRepository();
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);
    await repo.add();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ne notifie plus après unsubscribe()", async () => {
    const repo = new LocalStorageFicheRepository();
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);
    unsubscribe();
    await repo.add();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("LocalStorageFicheRepository — ouvrir une fiche ne déclenche aucune écriture", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    setItemSpy.mockRestore();
  });

  it("get()/list()/listByClient() (équivalent d'ouvrir une fiche) ne font aucune écriture", async () => {
    const repo = new LocalStorageFicheRepository();
    const id = await repo.add({ clientId: "c1" });
    setItemSpy.mockClear();

    repo.get(id);
    repo.list();
    repo.listByClient("c1");

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
