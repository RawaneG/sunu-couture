// Phase 7A — CRUD client cloud complet (lecture, création, suppression
// logique). Cache-first (`CloudCollectionStore`), scope atelier explicite en
// défense en profondeur même si RLS protège déjà côté serveur (corr. R §22).
import type { Client } from "../../lib/types";
import type { ClientRepository, NewClientInput } from "../ClientRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { newClientInputSchema, parseOrThrow, storedClientSchema } from "../schemas";
import { CloudCollectionStore } from "./CloudCollectionStore";
import { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import { mapClientRowToDomain, mapNewClientInputToInsert } from "./mappers/client";
import { clientRowSchema, parseRowOrThrow } from "./schemas";
import type { SupabaseGateway } from "./gateway";

export interface SupabaseClientRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
  /** Injection pour les tests — par défaut un `IndexedDbCollectionCache` réel. */
  cache?: IndexedDbCollectionCache<Client>;
}

export class SupabaseClientRepository implements ClientRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private readonly store: CloudCollectionStore<Client>;

  /** Résout une fois le cycle hydratation-cache + premier refresh réseau
   * terminé (succès ou échec) — les tests l'attendent au lieu de sonder
   * `getStatus()` en boucle ou d'utiliser des délais arbitraires. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseClientRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseClientRepository : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.store = new CloudCollectionStore<Client>({
      cache: options.cache ?? new IndexedDbCollectionCache<Client>("clients", options.workshopId),
      getId: (c) => c.id,
      // Le cache est une frontière non fiable au même titre que le réseau —
      // une ligne de cache dont la forme a dérivé (ancien schéma, corruption)
      // invalide TOUTE l'hydratation cache, jamais un affichage réparé.
      validateCachedItem: (raw) => parseOrThrow(storedClientSchema, raw, "SupabaseClientRepository cache"),
    });
    this.bootstrapped = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.hydrateFromCache();
    await this.store.refresh(() => this.fetchActiveClients());
  }

  /** Un lot réseau est un SNAPSHOT ATOMIQUE : la moindre ligne invalide fait
   * échouer le fetch entier (l'erreur remonte à `CloudCollectionStore.refresh()`,
   * qui conserve alors le cache existant plutôt que d'appliquer un résultat
   * partiel) — jamais un `console.warn` + `skip` qui accepterait une
   * collection tronquée comme si elle était complète (revue post-7A). */
  private async fetchActiveClients(): Promise<Client[]> {
    const { data, error } = await this.gateway.listActiveClients(this.workshopId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((raw) => mapClientRowToDomain(parseRowOrThrow(clientRowSchema, raw, "SupabaseClientRepository")));
  }

  list(): Client[] {
    return this.store.list();
  }

  get(id: string): Client | undefined {
    return this.store.get(id);
  }

  getStatus(): RepositoryStatus {
    return this.store.getStatus();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /** Rejoue le cycle hydratation-cache + refresh réseau — utile après un
   * changement d'atelier si l'instance est réutilisée (les tests l'appellent
   * directement ; en usage normal une nouvelle instance est créée à la
   * place, voir `RepositoryProvider`). */
  async refresh(): Promise<void> {
    await this.store.refresh(() => this.fetchActiveClients());
  }

  dispose(): void {
    this.store.dispose();
  }

  async add(input: NewClientInput): Promise<string> {
    const parsed = parseOrThrow(newClientInputSchema, input, "SupabaseClientRepository.add");
    const payload = mapNewClientInputToInsert(parsed, this.workshopId);
    const { data, error } = await this.gateway.insertClient(payload);
    if (error) throw new Error(error.message);
    const client = mapClientRowToDomain(parseRowOrThrow(clientRowSchema, data, "SupabaseClientRepository.add"));
    this.store.applyMutation(client.id, client);
    return client.id;
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.gateway.softDeleteClients(this.workshopId, ids);
    if (error) throw new Error(error.message);
    for (const id of ids) this.store.applyMutation(id, null);
  }
}
