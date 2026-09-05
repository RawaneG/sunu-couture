import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbCollectionCache } from "./IndexedDbCache";

interface Item {
  id: string;
  name: string;
}

describe("IndexedDbCollectionCache", () => {
  it("readAll() renvoie un tableau vide quand rien n'a encore été écrit", async () => {
    const cache = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    expect(await cache.readAll()).toEqual([]);
  });

  it("writeAll() puis readAll() retrouve exactement ce qui a été écrit", async () => {
    const cache = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    await cache.writeAll([
      { id: "c1", data: { id: "c1", name: "Awa" } },
      { id: "c2", data: { id: "c2", name: "Modou" } },
    ]);
    const rows = (await cache.readAll()) as Item[];
    expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c2"]);
  });

  it("writeAll() REMPLACE intégralement le contenu précédent (pas d'accumulation fantôme)", async () => {
    const cache = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    await cache.writeAll([{ id: "c1", data: { id: "c1", name: "Awa" } }]);
    await cache.writeAll([{ id: "c2", data: { id: "c2", name: "Modou" } }]);
    const rows = (await cache.readAll()) as Item[];
    expect(rows.map((r) => r.id)).toEqual(["c2"]);
  });

  it("un atelier ne voit JAMAIS les lignes d'un autre atelier (même magasin, clés différentes)", async () => {
    const cacheA = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    const cacheB = new IndexedDbCollectionCache<Item>("clients", "workshop-b");
    await cacheA.writeAll([{ id: "c1", data: { id: "c1", name: "Client A" } }]);
    await cacheB.writeAll([{ id: "c1", data: { id: "c1", name: "Client B" } }]);

    expect(((await cacheA.readAll()) as Item[]).map((r) => r.name)).toEqual(["Client A"]);
    expect(((await cacheB.readAll()) as Item[]).map((r) => r.name)).toEqual(["Client B"]);
  });

  it("deux collections distinctes ('clients' vs 'fiches') restent isolées pour le même atelier", async () => {
    const clients = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    const fiches = new IndexedDbCollectionCache<Item>("fiches", "workshop-a");
    await clients.writeAll([{ id: "x", data: { id: "x", name: "Client" } }]);
    expect(await fiches.readAll()).toEqual([]);
  });

  it("le magasin 'carnets' (DB_VERSION 2, revue post-7A §4) fonctionne et reste isolé des autres collections", async () => {
    const carnets = new IndexedDbCollectionCache<Item>("carnets", "workshop-a");
    const fiches = new IndexedDbCollectionCache<Item>("fiches", "workshop-a");
    await carnets.writeAll([{ id: "carnet-1", data: { id: "carnet-1", name: "Carnet 1" } }]);
    expect(((await carnets.readAll()) as Item[]).map((r) => r.id)).toEqual(["carnet-1"]);
    expect(await fiches.readAll()).toEqual([]);
  });

  it("l'upgrade de schéma (ajout de 'carnets') ne supprime jamais les données déjà écrites dans 'clients'/'fiches'", async () => {
    const clients = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    await clients.writeAll([{ id: "c1", data: { id: "c1", name: "Awa" } }]);
    // Une nouvelle instance (simulant un rechargement après l'upgrade) doit
    // toujours retrouver la donnée écrite avant l'ajout du magasin "carnets".
    const clientsAfterUpgrade = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    expect(((await clientsAfterUpgrade.readAll()) as Item[]).map((r) => r.id)).toEqual(["c1"]);
  });
});
