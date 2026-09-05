// Store réactif générique partagé par les Repository cloud (Phase 7A) —
// cache-first, protégé contre les réponses réseau/cache obsolètes ou
// invalides (corr. R §18/§32, durci lors de la revue indépendante post-7A).
import { READY_STATUS, LOADING_STATUS, type RepositoryStatus } from "../RepositoryStatus";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";

export interface CloudCollectionStoreOptions<TDomain> {
  cache: IndexedDbCollectionCache<TDomain>;
  getId: (item: TDomain) => string;
  /** Valide UNE ligne lue depuis IndexedDB — lève si sa forme n'est plus
   * celle attendue (schéma cache obsolète, corruption). Le cache étant une
   * frontière NON FIABLE au même titre que le réseau, une ligne invalide
   * invalide la totalité de l'hydratation cache (jamais un affichage
   * provisoire partiellement construit) — voir `hydrateFromCache()`. */
  validateCachedItem: (raw: unknown) => TDomain;
}

/**
 * Cycle (corr. R §18) :
 *   1. `hydrateFromCache()` — lecture + VALIDATION IndexedDB ; si toutes les
 *      lignes sont valides, snapshot immédiat. Si UNE SEULE est invalide,
 *      rien n'est affiché depuis ce cache : le store reste `loading`, le
 *      réseau prend seul le relais (jamais une réparation silencieuse).
 *   2. `refresh(fetcher)` — requête réseau ; epoch capturé au départ. Le
 *      `fetcher` doit lui-même valider CHAQUE ligne et lever au premier
 *      échec (un lot réseau est un snapshot atomique — jamais un résultat
 *      partiel silencieusement accepté, voir les Repository appelants) :
 *      - réponse encore actuelle (epoch inchangé) → remplace le snapshot,
 *        persiste le cache (file sérialisée, voir `schedulePersist`),
 *        notifie SEULEMENT si la collection a réellement changé.
 *      - réponse OBSOLÈTE (un `refresh()`/`applyMutation()` plus récent a
 *        déjà tourné) → ignorée silencieusement (§32).
 *      - échec (réseau OU une ligne invalide, remonté par le fetcher) +
 *        cache non vide → cache conservé tel quel, statut "ready" inchangé,
 *        erreur exposée via `getLastRefreshError()` (jamais supprimé,
 *        jamais "introuvable").
 *      - échec + aucun cache → statut "error".
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
  /** File d'écritures cache sérialisée — garantit que l'ORDRE de
   * persistance suit l'ordre logique des snapshots, jamais l'ordre de
   * résolution réseau (une écriture ancienne qui traîne ne doit jamais
   * réécrire par-dessus une écriture plus récente déjà terminée). */
  private persistQueue: Promise<void> = Promise.resolve();

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

  /** Comparaison pragmatique (pas de nouvelle dépendance) : les mappers
   * (`mapClientRowToDomain`/`mapFicheRowToDomain`/...) construisent toujours
   * leurs objets avec le même ordre de clés déterministe — une comparaison
   * JSON est donc fiable ici pour détecter un changement réel de collection. */
  private snapshotsEqual(a: readonly TDomain[], b: readonly TDomain[]): boolean {
    if (a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  async hydrateFromCache(): Promise<void> {
    if (this.disposed) return;
    let cachedRaw: unknown[];
    try {
      cachedRaw = await this.options.cache.readAll();
    } catch {
      // Cache indisponible (navigation privée, quota, ancien navigateur) —
      // pas fatal : le réseau (`refresh`) prend le relais normalement.
      return;
    }
    if (this.disposed || cachedRaw.length === 0) return;
    let validated: TDomain[];
    try {
      validated = cachedRaw.map((raw) => this.options.validateCachedItem(raw));
    } catch (err) {
      // Une SEULE ligne de cache invalide invalide la totalité de
      // l'hydratation — jamais un affichage partiel/réparé silencieusement.
      // Le store reste "loading" ; le réseau prendra seul le relais.
      console.warn("[CloudCollectionStore] cache invalide, ignoré — le réseau prendra le relais :", err);
      return;
    }
    if (this.disposed) return;
    this.map = new Map(validated.map((item) => [this.options.getId(item), item]));
    this.rebuildSnapshot();
    this.setStatus(READY_STATUS);
    this.notify();
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

    const wasReady = this.statusValue === READY_STATUS;
    const previousSnapshot = this.snapshot;
    this.map = new Map(items.map((item) => [this.options.getId(item), item]));
    this.rebuildSnapshot();
    this.lastRefreshError = null;
    this.setStatus(READY_STATUS);
    // Notifie seulement si la collection a réellement changé (nouvelle
    // donnée) OU si le statut vient de changer (ex. loading/error → ready) —
    // jamais pour un refresh qui renvoie exactement la même chose.
    if (!wasReady || !this.snapshotsEqual(previousSnapshot, this.snapshot)) {
      this.notify();
    }
    this.schedulePersist();
  }

  /** Applique le résultat d'une mutation réseau déjà réussie (ex. après un
   * `UPDATE` validé) — jamais un write optimiste avant confirmation
   * serveur. Bumpe l'epoch : un `refresh()` plus ancien encore en vol ne
   * pourra plus écraser cette valeur plus récente à sa résolution (§32).
   * Une mutation représente par définition un changement voulu par
   * l'appelant — toujours notifiée, contrairement à `refresh()`. */
  applyMutation(id: string, item: TDomain | null): void {
    this.epoch += 1;
    if (item === null) this.map.delete(id);
    else this.map.set(id, item);
    this.rebuildSnapshot();
    this.setStatus(READY_STATUS);
    this.notify();
    this.schedulePersist();
  }

  /** Planifie l'écriture du snapshot ACTUEL (capturé immédiatement, pas au
   * moment où la promesse s'exécute) sur la file sérialisée — garantit que
   * deux écritures se terminent dans l'ordre où elles ont été planifiées,
   * jamais dans l'ordre (potentiellement inversé) de résolution réseau. Une
   * erreur d'écriture n'interrompt jamais les écritures suivantes. */
  private schedulePersist(): void {
    const snapshotToPersist = this.snapshot;
    const items = snapshotToPersist.map((item) => ({ id: this.options.getId(item), data: item }));
    this.persistQueue = this.persistQueue.then(
      () => this.options.cache.writeAll(items).catch(() => {
        // Écriture cache best-effort — n'affecte jamais l'affichage réseau déjà réussi.
      }),
      () => {
        // Ne devrait pas arriver (le maillon précédent avale déjà ses
        // erreurs) — filet de sécurité pour ne jamais casser la file.
      },
    );
  }
}
