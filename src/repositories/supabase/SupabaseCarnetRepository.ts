// Lecture seule (corr. R, Phase 7A §25) — aucune création/mise à jour de
// carnet ici. Sert principalement de map `carnet_id → carnets.number` pour
// que `SupabaseFicheRepository` reconstitue `Fiche.carnetNumero` (aucune vue
// SQL ne fait ce join, voir corr. R). `getActiveCarnetNumero()`/
// `getNextSlot()` restent des méthodes de l'interface (parité avec
// `LocalStorageCarnetRepository`) mais n'ont aucun sens métier tant que la
// création cloud n'existe pas (9A/7B) — elles renvoient une valeur dérivée
// honnête du cache, jamais un calcul de "prochain numéro" inventé côté client.
//
// Cache-first au même titre que les autres Repository cloud (revue post-7A,
// §5) : `CloudCollectionStore<CarnetRow>` garantit qu'un atelier ayant déjà
// un carnet réel n°4 en cache continue de l'afficher si le réseau est
// indisponible — jamais un `carnetNumero: 1`/`nextSlot: 1` inventé faute de
// mieux.
import type { CarnetRepository, CarnetSlot } from "../CarnetRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { CloudCollectionStore } from "./CloudCollectionStore";
import { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { SupabaseGateway } from "./gateway";
import { parseRowOrThrow, carnetRowSchema, type CarnetRow } from "./schemas";

export interface SupabaseCarnetRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
  /** Injection pour les tests — par défaut un `IndexedDbCollectionCache` réel. */
  cache?: IndexedDbCollectionCache<CarnetRow>;
}

export class SupabaseCarnetRepository implements CarnetRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private readonly store: CloudCollectionStore<CarnetRow>;

  /** Résout une fois le cycle hydratation-cache + premier refresh réseau
   * terminé (succès ou échec) — les tests l'attendent au lieu de sonder
   * `getStatus()` en boucle. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseCarnetRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseCarnetRepository : workshopId requis (jamais un atelier arbitraire).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.store = new CloudCollectionStore<CarnetRow>({
      cache: options.cache ?? new IndexedDbCollectionCache<CarnetRow>("carnets", options.workshopId),
      getId: (c) => c.id,
      validateCachedItem: (raw) => parseRowOrThrow(carnetRowSchema, raw, "SupabaseCarnetRepository cache"),
    });
    this.bootstrapped = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.hydrateFromCache();
    await this.store.refresh(() => this.fetchCarnets());
  }

  /** Un lot réseau est un snapshot atomique — la moindre ligne invalide fait
   * échouer le fetch entier, jamais un résultat partiel silencieusement
   * accepté (revue post-7A, §2). */
  private async fetchCarnets(): Promise<CarnetRow[]> {
    const { data, error } = await this.gateway.listCarnets(this.workshopId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((raw) => parseRowOrThrow(carnetRowSchema, raw, "SupabaseCarnetRepository"));
  }

  async refresh(): Promise<void> {
    await this.store.refresh(() => this.fetchCarnets());
  }

  /** Phase 7B — permet à `SupabaseFicheRepository.add()` de détecter un
   * `refresh()` qui a échoué SANS que la promesse rejette (le contrat de
   * `CloudCollectionStore.refresh()` avale l'erreur réseau et conserve le
   * cache existant, voir son commentaire de tête) : après création serveur
   * réussie d'une fiche, `add()` doit savoir si le carnet vient réellement
   * d'être synchronisé avant de tenter de résoudre `carnetNumero`, jamais
   * rejouer la création pour autant. */
  getLastRefreshError(): Error | null {
    return this.store.getLastRefreshError();
  }

  dispose(): void {
    this.store.dispose();
  }

  getStatus = (): RepositoryStatus => this.store.getStatus();

  getCarnetNumero(carnetId: string): number | undefined {
    return this.store.get(carnetId)?.number;
  }

  getActiveCarnetNumero(): number {
    return this.store.list().reduce((max, c) => Math.max(max, c.number), 0) || 1;
  }

  getNextSlot(): CarnetSlot {
    const activeNumero = this.getActiveCarnetNumero();
    const active = this.store.list().find((c) => c.number === activeNumero);
    return { carnetNumero: activeNumero, numero: active?.next_number ?? 1 };
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
}
