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
    const rows = await cache.readAll();
    expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c2"]);
  });

  it("writeAll() REMPLACE intégralement le contenu précédent (pas d'accumulation fantôme)", async () => {
    const cache = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    await cache.writeAll([{ id: "c1", data: { id: "c1", name: "Awa" } }]);
    await cache.writeAll([{ id: "c2", data: { id: "c2", name: "Modou" } }]);
    const rows = await cache.readAll();
    expect(rows.map((r) => r.id)).toEqual(["c2"]);
  });

  it("un atelier ne voit JAMAIS les lignes d'un autre atelier (même magasin, clés différentes)", async () => {
    const cacheA = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    const cacheB = new IndexedDbCollectionCache<Item>("clients", "workshop-b");
    await cacheA.writeAll([{ id: "c1", data: { id: "c1", name: "Client A" } }]);
    await cacheB.writeAll([{ id: "c1", data: { id: "c1", name: "Client B" } }]);

    expect((await cacheA.readAll()).map((r) => r.name)).toEqual(["Client A"]);
    expect((await cacheB.readAll()).map((r) => r.name)).toEqual(["Client B"]);
  });

  it("deux collections distinctes ('clients' vs 'fiches') restent isolées pour le même atelier", async () => {
    const clients = new IndexedDbCollectionCache<Item>("clients", "workshop-a");
    const fiches = new IndexedDbCollectionCache<Item>("fiches", "workshop-a");
    await clients.writeAll([{ id: "x", data: { id: "x", name: "Client" } }]);
    expect(await fiches.readAll()).toEqual([]);
  });
});
