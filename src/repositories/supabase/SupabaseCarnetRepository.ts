// Lecture seule (corr. R, Phase 7A §25) — aucune création/mise à jour de
// carnet ici. Sert principalement de map `carnet_id → carnets.number` pour
// que `SupabaseFicheRepository` reconstitue `Fiche.carnetNumero` (aucune vue
// SQL ne fait ce join, voir corr. R). `getActiveCarnetNumero()`/
// `getNextSlot()` restent des méthodes de l'interface (parité avec
// `LocalStorageCarnetRepository`) mais n'ont aucun sens métier tant que la
// création cloud n'existe pas (9A/7B) — elles renvoient une valeur dérivée
// honnête du cache, jamais un calcul de "prochain numéro" inventé côté client.
import type { CarnetRepository, CarnetSlot } from "../CarnetRepository";
import { READY_STATUS, LOADING_STATUS, type RepositoryStatus } from "../RepositoryStatus";
import type { SupabaseGateway } from "./gateway";
import { parseRowOrThrow, carnetRowSchema, type CarnetRow } from "./schemas";

export interface SupabaseCarnetRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
}

export class SupabaseCarnetRepository implements CarnetRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private carnets: CarnetRow[] = [];
  private byId = new Map<string, CarnetRow>();
  private status: RepositoryStatus = LOADING_STATUS;
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;

  /** Résout une fois l'hydratation initiale terminée (succès ou échec) —
   * les tests l'attendent au lieu de sonder `getStatus()` en boucle. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabaseCarnetRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabaseCarnetRepository : workshopId requis (jamais un atelier arbitraire).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.bootstrapped = this.refresh();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  async refresh(): Promise<void> {
    const myEpoch = (this.epoch += 1);
    const { data, error } = await this.gateway.listCarnets(this.workshopId);
    if (this.disposed || myEpoch !== this.epoch) return;
    if (error) {
      this.status = { status: "error", error: new Error(error.message) };
      this.notify();
      return;
    }
    const rows: CarnetRow[] = [];
    for (const raw of data ?? []) {
      try {
        rows.push(parseRowOrThrow(carnetRowSchema, raw, "SupabaseCarnetRepository"));
      } catch (err) {
        console.warn("[SupabaseCarnetRepository] ligne rejetée :", err);
      }
    }
    this.carnets = rows;
    this.byId = new Map(rows.map((r) => [r.id, r]));
    this.status = READY_STATUS;
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    this.listeners.clear();
  }

  getStatus = (): RepositoryStatus => this.status;

  getCarnetNumero(carnetId: string): number | undefined {
    return this.byId.get(carnetId)?.number;
  }

  getActiveCarnetNumero(): number {
    return this.carnets.reduce((max, c) => Math.max(max, c.number), 0) || 1;
  }

  getNextSlot(): CarnetSlot {
    const activeNumero = this.getActiveCarnetNumero();
    const active = this.carnets.find((c) => c.number === activeNumero);
    return { carnetNumero: activeNumero, numero: active?.next_number ?? 1 };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
