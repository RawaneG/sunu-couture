import { describe, expect, it, vi } from "vitest";
import { CloudCollectionStore } from "./CloudCollectionStore";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";

interface Item {
  id: string;
  name: string;
}

function isValidItem(raw: unknown): raw is Item {
  return !!raw && typeof raw === "object" && typeof (raw as Item).id === "string" && typeof (raw as Item).name === "string";
}

/** Validateur par défaut pour les tests — lève sur toute ligne qui n'a pas
 * la forme `Item` (utilisé pour la validation cache, §3). */
function validateItem(raw: unknown): Item {
  if (!isValidItem(raw)) throw new Error(`ligne cache invalide : ${JSON.stringify(raw)}`);
  return raw;
}

/** Double en mémoire du cache IndexedDB — suffisant pour tester le cycle
 * cache→réseau et la protection anti-obsolescence sans dépendre d'un vrai
 * IndexedDB (couvert séparément par `IndexedDbCache.test.ts`). `initial`
 * accepte volontairement `unknown[]` pour pouvoir injecter une ligne
 * corrompue (§3). */
function fakeCache(initial: unknown[] = []): IndexedDbCollectionCache<Item> {
  let stored = initial;
  return {
    readAll: vi.fn(async () => stored),
    writeAll: vi.fn(async (items: Array<{ id: string; data: Item }>) => {
      stored = items.map((i) => i.data);
    }),
  } as unknown as IndexedDbCollectionCache<Item>;
}

function makeStore(cache: IndexedDbCollectionCache<Item>) {
  return new CloudCollectionStore<Item>({ cache, getId: (i) => i.id, validateCachedItem: validateItem });
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
    const store = makeStore(fakeCache());
    expect(store.getStatus()).toEqual({ status: "loading" });

    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "loading" });

    await store.refresh(async () => [{ id: "a", name: "A" }]);
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "A" }]);
  });

  it("cache présent : visible AVANT même que le réseau réponde", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "Cache A" }]));
    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "Cache A" }]);
  });

  it("le refresh réseau REMPLACE le cache par la donnée serveur", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "Cache A" }]));
    await store.hydrateFromCache();
    await store.refresh(async () => [{ id: "a", name: "Serveur A" }]);
    expect(store.list()).toEqual([{ id: "a", name: "Serveur A" }]);
  });

  it("erreur réseau AVEC cache existant : le cache est conservé, jamais supprimé, statut reste 'ready'", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "Cache A" }]));
    await store.hydrateFromCache();
    await store.refresh(async () => {
      throw new Error("réseau indisponible");
    });
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "Cache A" }]);
    expect(store.getLastRefreshError()?.message).toBe("réseau indisponible");
  });

  it("erreur réseau SANS cache : statut 'error' contrôlé, jamais confondu avec 'introuvable'", async () => {
    const store = makeStore(fakeCache());
    await store.hydrateFromCache();
    await store.refresh(async () => {
      throw new Error("réseau indisponible");
    });
    expect(store.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
  });
});

describe("CloudCollectionStore — un lot réseau est un snapshot atomique (revue post-7A, §2)", () => {
  it("un fetcher qui lève pour une ligne invalide (batch rejeté par le Repository appelant) + cache valide → cache CONSERVÉ intact", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "A cache" }, { id: "b", name: "B cache" }]));
    await store.hydrateFromCache();
    expect(store.list()).toEqual([{ id: "a", name: "A cache" }, { id: "b", name: "B cache" }]);

    // Simule le Repository : la ligne "b" est invalide côté serveur, le
    // fetcher entier lève — jamais un résultat partiel [A] ni [].
    await store.refresh(async () => {
      throw new Error("ligne b invalide côté serveur");
    });

    expect(store.list()).toEqual([{ id: "a", name: "A cache" }, { id: "b", name: "B cache" }]);
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.getLastRefreshError()?.message).toMatch(/invalide/);
  });

  it("un batch invalide SANS cache → statut error, jamais un résultat partiel accepté", async () => {
    const store = makeStore(fakeCache());
    await store.hydrateFromCache();
    await store.refresh(async () => {
      throw new Error("ligne invalide côté serveur");
    });
    expect(store.getStatus()).toEqual({ status: "error", error: expect.any(Error) });
    expect(store.list()).toEqual([]);
  });
});

describe("CloudCollectionStore — validation du cache (revue post-7A, §3)", () => {
  it("une ligne de cache invalide invalide TOUTE l'hydratation — reste loading, réseau prend le relais", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "A" }, { id: "b", nomInvalide: true }]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "loading" });
    expect(store.list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // Le réseau prend le relais normalement ensuite.
    await store.refresh(async () => [{ id: "a", name: "A serveur" }]);
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "A serveur" }]);
  });

  it("un cache entièrement valide s'hydrate normalement", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "A" }]));
    await store.hydrateFromCache();
    expect(store.getStatus()).toEqual({ status: "ready" });
    expect(store.list()).toEqual([{ id: "a", name: "A" }]);
  });
});

describe("CloudCollectionStore — concurrence / réponses obsolètes", () => {
  it("un refresh lancé puis superseded par un refresh plus récent est ignoré à sa résolution", async () => {
    const store = makeStore(fakeCache());
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
    const store = makeStore(fakeCache([{ id: "a", name: "A initial" }]));
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
    const store = makeStore(fakeCache());
    const pending = deferred<Item[]>();
    const refreshPromise = store.refresh(() => pending.promise);
    store.dispose();
    pending.resolve([{ id: "a", name: "A" }]);
    await refreshPromise;
    expect(store.list()).toEqual([]); // jamais appliqué : l'instance est jetée
  });
});

describe("CloudCollectionStore — persistance sérialisée (revue post-7A, §6)", () => {
  it("deux snapshots planifiés coup sur coup (A puis B) laissent le cache refléter B, jamais A — même si A résout après avoir été lancé en second", async () => {
    let persisted: Item[] = [];
    const writeCalls: string[] = [];
    let resolveFirstWrite!: () => void;
    const cache = {
      readAll: vi.fn(async () => persisted),
      writeAll: vi.fn((items: Array<{ id: string; data: Item }>) => {
        const label = items[0]?.data.name ?? "vide";
        writeCalls.push(label);
        if (writeCalls.length === 1) {
          // La 1ère écriture (A) est délibérément lente — la file sérialisée
          // (pas une simple Promise "fire-and-forget") garantit que la 2e
          // écriture (B) ne peut MÊME PAS démarrer avant que celle-ci résolve :
          // un ordre inversé de RÉSOLUTION devient donc structurellement
          // impossible, ce qui est une garantie plus forte que "la dernière
          // planifiée gagne" — elle l'implique.
          return new Promise<void>((resolve) => {
            resolveFirstWrite = () => {
              persisted = items.map((i) => i.data);
              resolve();
            };
          });
        }
        persisted = items.map((i) => i.data);
        return Promise.resolve();
      }),
    } as unknown as IndexedDbCollectionCache<Item>;

    const store = makeStore(cache);
    await store.refresh(async () => [{ id: "a", name: "A" }]); // planifie l'écriture 1 (lente, en attente)
    store.applyMutation("a", { id: "a", name: "B" }); // planifie l'écriture 2 — ne peut pas encore démarrer

    await Promise.resolve();
    await Promise.resolve();
    expect(writeCalls).toEqual(["A"]); // la 2e écriture n'a PAS démarré — preuve de la sérialisation stricte

    resolveFirstWrite();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(writeCalls).toEqual(["A", "B"]); // ordre de démarrage garanti par la file
    const finalCache = (await cache.readAll()) as Item[];
    expect(finalCache).toEqual([{ id: "a", name: "B" }]); // le cache reflète le snapshot le plus récent
  });

  it("une erreur d'écriture cache n'empêche pas les écritures planifiées suivantes", async () => {
    const cache = fakeCache();
    let callCount = 0;
    (cache.writeAll as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) throw new Error("échec d'écriture simulé");
      // Deuxième appel : réussit normalement (comportement par défaut du fake).
      return undefined;
    });

    const store = makeStore(cache);
    await store.refresh(async () => [{ id: "a", name: "A" }]);
    store.applyMutation("a", { id: "a", name: "B" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callCount).toBe(2);
  });
});

describe("CloudCollectionStore — notifications (pas de rerender inutile, revue post-7A §7)", () => {
  it("notifie les abonnés à chaque transition d'état réelle (loading→ready)", async () => {
    const store = makeStore(fakeCache());
    const listener = vi.fn();
    store.subscribe(listener);
    await store.refresh(async () => [{ id: "a", name: "A" }]);
    expect(listener).toHaveBeenCalled();
  });

  it("un refresh qui renvoie EXACTEMENT la même collection ne notifie PAS à nouveau", async () => {
    const store = makeStore(fakeCache());
    await store.refresh(async () => [{ id: "a", name: "A" }]);

    const listener = vi.fn();
    store.subscribe(listener);
    await store.refresh(async () => [{ id: "a", name: "A" }]); // donnée identique
    expect(listener).not.toHaveBeenCalled();
  });

  it("un refresh qui change réellement la donnée notifie normalement", async () => {
    const store = makeStore(fakeCache());
    await store.refresh(async () => [{ id: "a", name: "A" }]);

    const listener = vi.fn();
    store.subscribe(listener);
    await store.refresh(async () => [{ id: "a", name: "A modifiée" }]);
    expect(listener).toHaveBeenCalled();
  });

  it("list() renvoie la MÊME référence tant qu'aucun refresh/mutation n'a eu lieu (contrat useSyncExternalStore)", async () => {
    const store = makeStore(fakeCache([{ id: "a", name: "A" }]));
    await store.hydrateFromCache();
    const first = store.list();
    const second = store.list();
    expect(second).toBe(first);
  });
});
