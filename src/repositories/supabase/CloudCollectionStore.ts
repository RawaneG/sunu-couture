// Store réactif générique partagé par les Repository cloud (Phase 7A) —
// cache-first, protégé contre les réponses réseau obsolètes (corr. R §18/§32).
import { READY_STATUS, LOADING_STATUS, type RepositoryStatus } from "../RepositoryStatus";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";

export interface CloudCollectionStoreOptions<TDomain> {
  cache: IndexedDbCollectionCache<TDomain>;
  getId: (item: TDomain) => string;
}

/**
 * Cycle (corr. R §18) :
 *   1. `hydrateFromCache()` — lecture IndexedDB, snapshot immédiat si non vide.
 *   2. `refresh(fetcher)` — requête réseau ; epoch capturé au départ.
 *      - réponse encore actuelle (epoch inchangé) → remplace le snapshot,
 *        persiste le cache, notifie.
 *      - réponse OBSOLÈTE (un `refresh()`/`applyMutation()` plus récent a
 *        déjà tourné) → ignorée silencieusement (§32).
 *      - échec réseau + cache non vide → cache conservé, statut "ready"
 *        inchangé, erreur exposée via `getLastRefreshError()` (jamais
 *        supprimé, jamais "introuvable").
 *      - échec réseau + aucun cache → statut "error".
 *   3. `applyMutation()` — après une écriture réseau réussie (UPDATE),
 *      applique le résultat validé et bumpe l'epoch (une mutation plus
 *      récente ne doit jamais être écrasée par un refresh plus ancien
 *      encore en vol).
 */
export class CloudCollectionStore<TDomain> {
  private map = new Map<string, TDomain>();
  private snapshot: TDomain[] = [];
  private statusValue: RepositoryStatus = LOADING_STATUS;
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private lastRefreshError: Error | null = null;

  private readonly options: CloudCollectionStoreOptions<TDomain>;

  constructor(options: CloudCollectionStoreOptions<TDomain>) {
    this.options = options;
  }

  getStatus = (): RepositoryStatus => this.statusValue;
  list = (): TDomain[] => this.snapshot;
  get = (id: string): TDomain | undefined => this.map.get(id);
  getLastRefreshError = (): Error | null => this.lastRefreshError;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Génération courante — un appelant externe (ex. un test de concurrence)
   * peut la lire pour vérifier qu'un `refresh()` a bien été superseded. */
  currentEpoch(): number {
    return this.epoch;
  }

  /** Invalide tout refresh en vol et arrête les notifications futures —
   * appelé quand l'atelier change (le conteneur entier est reconstruit,
   * cette instance devient orpheline, voir `RepositoryProvider`). */
  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private setStatus(next: RepositoryStatus): void {
    if (this.statusValue === next) return;
    this.statusValue = next;
  }

  private rebuildSnapshot(): void {
    this.snapshot = Array.from(this.map.values());
  }

  async hydrateFromCache(): Promise<void> {
    if (this.disposed) return;
    try {
      const cached = await this.options.cache.readAll();
      if (this.disposed || cached.length === 0) return;
      this.map = new Map(cached.map((item) => [this.options.getId(item), item]));
      this.rebuildSnapshot();
      this.setStatus(READY_STATUS);
      this.notify();
    } catch {
      // Cache indisponible (navigation privée, quota, ancien navigateur) —
      // pas fatal : le réseau (`refresh`) prend le relais normalement.
    }
  }

  async refresh(fetcher: () => Promise<TDomain[]>): Promise<void> {
    const myEpoch = (this.epoch += 1);
    let items: TDomain[];
    try {
      items = await fetcher();
    } catch (error) {
      if (this.disposed || myEpoch !== this.epoch) return; // obsolète, ignorée
      this.lastRefreshError = error instanceof Error ? error : new Error(String(error));
      if (this.map.size === 0) {
        this.setStatus({ status: "error", error: this.lastRefreshError });
        this.notify();
      }
      // Sinon : cache existant conservé tel quel, jamais supprimé, jamais
      // remplacé par une fausse valeur — seul `getLastRefreshError()` change.
      return;
    }
    if (this.disposed || myEpoch !== this.epoch) return; // réponse obsolète (switch d'atelier / refresh plus récent)
    this.map = new Map(items.map((item) => [this.options.getId(item), item]));
    this.rebuildSnapshot();
    this.lastRefreshError = null;
    this.setStatus(READY_STATUS);
    this.notify();
    void this.persistCache();
  }

  /** Applique le résultat d'une mutation réseau déjà réussie (ex. après un
   * `UPDATE` validé) — jamais un write optimiste avant confirmation
   * serveur. Bumpe l'epoch : un `refresh()` plus ancien encore en vol ne
   * pourra plus écraser cette valeur plus récente à sa résolution (§32). */
  applyMutation(id: string, item: TDomain | null): void {
    this.epoch += 1;
    if (item === null) this.map.delete(id);
    else this.map.set(id, item);
    this.rebuildSnapshot();
    this.setStatus(READY_STATUS);
    this.notify();
    void this.persistCache();
  }

  private async persistCache(): Promise<void> {
    try {
      await this.options.cache.writeAll(this.snapshot.map((item) => ({ id: this.options.getId(item), data: item })));
    } catch {
      // Écriture cache best-effort — n'affecte jamais l'affichage réseau déjà réussi.
    }
  }
}
