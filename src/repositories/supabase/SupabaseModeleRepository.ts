// Phase 8B — CRUD catalogue de modèles cloud (lecture, création, rename,
// suppression logique) : `public.modeles`, Phase 4 accorde déjà
// SELECT/INSERT/UPDATE(nom, deleted_at) à `authenticated` — aucune Edge
// Function ici. Cache-first (`CloudCollectionStore`), même architecture que
// `SupabaseClientRepository`/`SupabaseFicheRepository`. Les photos/patrons
// NE vivent PAS ici (`SupabaseMediaRepository` — voir `mappers/modele.ts`).
import type { Modele } from "../../lib/types";
import type { ModeleRepository, NewModeleInput } from "../ModeleRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { modeleNomSchema, newModeleInputSchema, parseOrThrow, storedModeleSchema } from "../schemas";
import { CloudCollectionStore } from "./CloudCollectionStore";
import { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import { mapModeleRowToDomain, mapNewModeleInputToInsert } from "./mappers/modele";
import { modeleRowSchema, parseRowOrThrow } from "./schemas";
import type { SupabaseGateway } from "./gateway";

export interface SupabaseModeleRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
  /** Injection pour les tests — par défaut un `IndexedDbCollectionCache` réel. */
  cache?: IndexedDbCollectionCache<Modele>;
}

export class SupabaseModeleRepository implements ModeleRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private readonly store: CloudCollectionStore<Modele>;

  /** Résout une fois le cycle hydratation-cache + premier refresh réseau
   * terminé (succès ou échec) — voir `SupabaseClientRepository`. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseModeleRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseModeleRepository : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.store = new CloudCollectionStore<Modele>({
      cache: options.cache ?? new IndexedDbCollectionCache<Modele>("modeles", options.workshopId),
      getId: (m) => m.id,
      // Le cache stocke `photos: []`/`patronPhotos: []` (non autoritatifs) —
      // une ligne de cache dont la forme a dérivé invalide TOUTE
      // l'hydratation cache, jamais un affichage réparé silencieusement.
      validateCachedItem: (raw) => parseOrThrow(storedModeleSchema, raw, "SupabaseModeleRepository cache"),
    });
    this.bootstrapped = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.hydrateFromCache();
    await this.store.refresh(() => this.fetchActiveModeles());
  }

  /** Un lot réseau est un SNAPSHOT ATOMIQUE — la moindre ligne invalide fait
   * échouer le fetch entier (voir `SupabaseClientRepository.fetchActiveClients`). */
  private async fetchActiveModeles(): Promise<Modele[]> {
    const { data, error } = await this.gateway.listActiveModeles(this.workshopId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((raw) => mapModeleRowToDomain(parseRowOrThrow(modeleRowSchema, raw, "SupabaseModeleRepository")));
  }

  list(): Modele[] {
    return this.store.list();
  }

  get(id: string): Modele | undefined {
    return this.store.get(id);
  }

  getStatus(): RepositoryStatus {
    return this.store.getStatus();
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /** Rejoue le cycle hydratation-cache + refresh réseau — voir
   * `SupabaseClientRepository.refresh`. */
  async refresh(): Promise<void> {
    await this.store.refresh(() => this.fetchActiveModeles());
  }

  dispose(): void {
    this.store.dispose();
  }

  async add(input: NewModeleInput): Promise<string> {
    const parsed = parseOrThrow(newModeleInputSchema, input, "SupabaseModeleRepository.add");
    const payload = mapNewModeleInputToInsert(parsed, this.workshopId);
    const { data, error } = await this.gateway.insertModele(payload);
    if (error) throw new Error(error.message);
    const modele = mapModeleRowToDomain(parseRowOrThrow(modeleRowSchema, data, "SupabaseModeleRepository.add"));
    this.store.applyMutation(modele.id, modele);
    return modele.id;
  }

  /** Aucune écriture optimiste avant confirmation serveur (§27) — la ligne
   * appliquée au store est celle RENVOYÉE par le serveur après l'UPDATE. */
  async setNom(id: string, nom: string): Promise<void> {
    const parsed = parseOrThrow(modeleNomSchema, nom, "SupabaseModeleRepository.setNom");
    const { data, error } = await this.gateway.updateModeleNom(this.workshopId, id, parsed);
    if (error) throw new Error(error.message);
    const modele = mapModeleRowToDomain(parseRowOrThrow(modeleRowSchema, data, "SupabaseModeleRepository.setNom"));
    this.store.applyMutation(modele.id, modele);
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  /** `deleted_at = now()` — jamais de DELETE physique (§28). Les médias DB
   * associés (`modele_medias`) peuvent rester présents : c'est
   * `SupabaseMediaRepository.listActiveModeleMedias` (via le gateway) qui ne
   * les charge/signe jamais dès que leur modèle parent est soft-deleted. */
  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.gateway.softDeleteModeles(this.workshopId, ids);
    if (error) throw new Error(error.message);
    for (const id of ids) this.store.applyMutation(id, null);
  }
}
