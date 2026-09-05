import { describe, expect, it, vi } from "vitest";
import { CloudCollectionStore } from "./CloudCollectionStore";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";

interface Item {
  id: string;
  name: string;
}

/** Double en mémoire du cache IndexedDB — suffisant pour tester le cycle
 * cache→réseau et la protection anti-obsolescence sans dépendre d'un vrai
 * IndexedDB (couvert séparément par `IndexedDbCache.test.ts`). */
function fakeCache(initial: Item[] = []): IndexedDbCollectionCache<Item> {
  let stored = initial;
  return {
    readAll: vi.fn(async () => stored),
    writeAll: vi.fn(async (items: Array<{ id: string; data: Item }>) => {
      stored = items.map((i) => i.data);
    }),
  } as unknown as IndexedDbCollectionCache<Item>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("CloudCollectionStore — cache d'abord, réseau ensuite", () => {
  it("aucun cache : reste 'loading' jusqu'à la résolution du refresh réseau", async () => {
    const store = new CloudCollectionStore<Item>({ cache: fakeCache(), getId: (i) => i.id });
    expect(store.getStatus()).toEqual({ status: "loading" });

    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "loading" });

    await store.refresh(async () => [{ id: "a", name: "A" }]);
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "A" }]);
  });

  it("cache présent : visible AVANT même que le réseau réponde", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "Cache A" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "Cache A" }]);
  });

  it("le refresh réseau REMPLACE le cache par la donnée serveur", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "Cache A" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();
    await store.refresh(async () => [{ id: "a", name: "Serveur A" }]);
    expect(store.list()).toEqual([{ id: "a", name: "Serveur A" }]);
  });

  it("erreur réseau AVEC cache existant : le cache est conservé, jamais supprimé, statut reste 'ready'", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "Cache A" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();
    await store.refresh(async () => {
      throw new Error("réseau indisponible");
    });
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "Cache A" }]);
    expect(store.getLastRefreshError()?.message).toBe("réseau indisponible");
  });

  it("erreur réseau SANS cache : statut 'error' contrôlé, jamais confondu avec 'introuvable'", async () => {
    const store = new CloudCollectionStore<Item>({ cache: fakeCache(), getId: (i) => i.id });
    await store.hydrateFromCache();
    await store.refresh(async () => {
      throw new Error("réseau indisponible");
    });
    expect(store.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });

  it("une row réseau invalide (fetcher qui filtre déjà) ne fait pas planter le store — cache antérieur intact si vide en sortie et cache déjà là", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "Cache A" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();
    // Le fetcher a lui-même filtré une ligne invalide (comportement réel des
    // Repository : parseRowOrThrow + skip) — ici il renvoie [] légitimement.
    await store.refresh(async () => []);
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([]); // 0 résultat serveur réel remplace bien le cache
  });
});

describe("CloudCollectionStore — concurrence / réponses obsolètes", () => {
  it("un refresh lancé puis superseded par un refresh plus récent est ignoré à sa résolution", async () => {
    const store = new CloudCollectionStore<Item>({ cache: fakeCache(), getId: (i) => i.id });
    const first = deferred<Item[]>();
    const firstRefresh = store.refresh(() => first.promise);

    // Un second refresh (plus récent) se termine AVANT le premier.
    await store.refresh(async () => [{ id: "b", name: "B (récent)" }]);
    expect(store.list()).toEqual([{ id: "b", name: "B (récent)" }]);

    // Le premier refresh, plus ancien, résout maintenant — il ne doit PAS écraser B.
    first.resolve([{ id: "a", name: "A (obsolète)" }]);
    await firstRefresh;
    expect(store.list()).toEqual([{ id: "b", name: "B (récent)" }]);
  });

  it("une mutation plus récente n'est jamais écrasée par un refresh ancien qui se termine après", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "A initial" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();

    const stale = deferred<Item[]>();
    const staleRefresh = store.refresh(() => stale.promise);

    // Une mutation (ex. après un UPDATE réussi) arrive PENDANT que le refresh est en vol.
    store.applyMutation("a", { id: "a", name: "A muté" });
    expect(store.list()).toEqual([{ id: "a", name: "A muté" }]);

    // Le refresh, lancé avant la mutation, résout après — il est obsolète, ignoré.
    stale.resolve([{ id: "a", name: "A refresh obsolète" }]);
    await staleRefresh;
    expect(store.list()).toEqual([{ id: "a", name: "A muté" }]);
  });

  it("dispose() invalide tout refresh encore en vol", async () => {
    const store = new CloudCollectionStore<Item>({ cache: fakeCache(), getId: (i) => i.id });
    const pending = deferred<Item[]>();
    const refreshPromise = store.refresh(() => pending.promise);
    store.dispose();
    pending.resolve([{ id: "a", name: "A" }]);
    await refreshPromise;
    expect(store.list()).toEqual([]); // jamais appliqué : l'instance est jetée
  });
});

describe("CloudCollectionStore — notifications (pas de rerender inutile)", () => {
  it("notifie les abonnés à chaque transition d'état réelle (loading→ready)", async () => {
    const store = new CloudCollectionStore<Item>({ cache: fakeCache(), getId: (i) => i.id });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.refresh(async () => [{ id: "a", name: "A" }]);
    expect(listener).toHaveBeenCalled();
  });

  it("list() renvoie la MÊME référence tant qu'aucun refresh/mutation n'a eu lieu (contrat useSyncExternalStore)", async () => {
    const store = new CloudCollectionStore<Item>({
      cache: fakeCache([{ id: "a", name: "A" }]),
      getId: (i) => i.id,
    });
    await store.hydrateFromCache();
    const first = store.list();
    const second = store.list();
    expect(second).toBe(first);
  });
});
