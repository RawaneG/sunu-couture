// Phase 11A — paiements cloud minimal : ledger append-only `client_payments`
// (CRUD PostgREST normal — Phase 4 accorde déjà SELECT/INSERT `authenticated`,
// AUCUN UPDATE/DELETE, aucune Edge Function nécessaire) + balance
// AUTORITATIVE `public.fiche_balances` (vue SQL, SELECT `authenticated`).
//
// Deux sources distinctes, jamais mélangées :
//   - `paymentsStore` (CloudCollectionStore<Payment>, cache-first IndexedDB)
//     — le ledger réel, un jour utile pour un historique détaillé (Phase 11).
//   - `balances` (Map en mémoire UNIQUEMENT, jamais persisté IndexedDB) — la
//     vue `fiche_balances` fait foi ; `reste` peut être négatif (surpaiement),
//     jamais recalculé ni tronqué côté client (§5/§36).
//
// `getStatus()` ne devient "ready" que lorsque LES DEUX sont chargés — un
// solde pas encore arrivé ne doit jamais être confondu avec un solde à zéro
// (§18/§22, même invariant que `useFicheMedia`/`useCatalogueModeles`).
import type { Payment, FicheBalance, AddPaymentInput, PaymentRepository } from "../PaymentRepository";
import type { RepositoryStatus } from "../RepositoryStatus";
import { READY_STATUS, LOADING_STATUS } from "../RepositoryStatus";
import { addPaymentInputSchema, parseOrThrow, storedPaymentSchema } from "../schemas";
import { CloudCollectionStore } from "./CloudCollectionStore";
import { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import { mapAddPaymentInputToInsert, mapClientPaymentRowToDomain, mapFicheBalanceRowToDomain } from "./mappers/payment";
import { clientPaymentRowSchema, ficheBalanceRowSchema, parseRowOrThrow } from "./schemas";
import type { SupabaseGateway } from "./gateway";

/** Référence STABLE — un `getBalance()` appelé avant que la balance de cette
 * fiche soit arrivée doit renvoyer TOUJOURS la même référence vide, sinon
 * chaque `getSnapshot()` verrait une valeur "différente" et déclencherait une
 * boucle de rendu infinie (même bug déjà corrigé en Phase 8A — `EMPTY_PHOTOS`). */
const ZERO_BALANCE: FicheBalance = { price: 0, paid: 0, reste: 0 };

export interface SupabasePaymentRepositoryOptions {
  gateway: SupabaseGateway;
  workshopId: string;
  /** Injection pour les tests — par défaut un `IndexedDbCollectionCache` réel. */
  cache?: IndexedDbCollectionCache<Payment>;
}

export class SupabasePaymentRepository implements PaymentRepository {
  private readonly gateway: SupabaseGateway;
  private readonly workshopId: string;
  private readonly store: CloudCollectionStore<Payment>;

  private balances = new Map<string, FicheBalance>();
  private balancesStatus: RepositoryStatus = LOADING_STATUS;
  private lastBalanceRefreshError: Error | null = null;

  /** Résout une fois payments (cache + réseau) ET balances chargés — succès
   * ou échec de chaque côté. */
  readonly bootstrapped: Promise<void>;

  constructor(options: SupabasePaymentRepositoryOptions) {
    if (!options.workshopId) {
      throw new Error("SupabasePaymentRepository : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
    }
    this.gateway = options.gateway;
    this.workshopId = options.workshopId;
    this.store = new CloudCollectionStore<Payment>({
      cache: options.cache ?? new IndexedDbCollectionCache<Payment>("payments", options.workshopId),
      getId: (p) => p.id,
      validateCachedItem: (raw) => parseOrThrow(storedPaymentSchema, raw, "SupabasePaymentRepository cache"),
    });
    this.bootstrapped = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.hydrateFromCache();
    await Promise.all([this.store.refresh(() => this.fetchActivePayments()), this.refreshAllBalances()]);
  }

  /** Un lot réseau est un SNAPSHOT ATOMIQUE — la moindre ligne invalide fait
   * échouer le fetch entier (voir `SupabaseClientRepository.fetchActiveClients`). */
  private async fetchActivePayments(): Promise<Payment[]> {
    const { data, error } = await this.gateway.listClientPayments(this.workshopId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((raw) => mapClientPaymentRowToDomain(parseRowOrThrow(clientPaymentRowSchema, raw, "SupabasePaymentRepository")));
  }

  private async refreshAllBalances(): Promise<void> {
    try {
      const { data, error } = await this.gateway.listFicheBalances(this.workshopId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []).map((raw) => parseRowOrThrow(ficheBalanceRowSchema, raw, "SupabasePaymentRepository"));
      this.commitBalances(rows.map((row) => [row.fiche_id, mapFicheBalanceRowToDomain(row)] as const));
      this.lastBalanceRefreshError = null;
      this.balancesStatus = READY_STATUS;
      this.notify();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastBalanceRefreshError = error;
      if (this.balances.size === 0) {
        this.balancesStatus = { status: "error", error };
        this.notify();
      }
      // Sinon : dernières balances connues conservées telles quelles, jamais
      // remplacées par un faux zéro (§18/§24) — seule `getLastBalanceRefreshError()` change.
    }
  }

  /** Remplace le Map en conservant la référence de CHAQUE entrée dont la
   * valeur n'a pas changé — évite de casser inutilement la stabilité
   * référentielle de `getBalance()` pour des fiches dont le solde réel est
   * identique entre deux refresh. */
  private commitBalances(entries: readonly (readonly [string, FicheBalance])[]): void {
    const next = new Map<string, FicheBalance>();
    for (const [ficheId, balance] of entries) {
      const prev = this.balances.get(ficheId);
      const unchanged = prev && prev.price === balance.price && prev.paid === balance.paid && prev.reste === balance.reste;
      next.set(ficheId, unchanged ? prev : balance);
    }
    this.balances = next;
  }

  /** Upsert CIBLÉ d'UNE seule entrée — copie TOUTES les autres fiches déjà
   * connues sans y toucher (jamais un remplacement intégral comme
   * `commitBalances()`, réservé au snapshot complet de `refreshAllBalances()`).
   * Préserve aussi la référence de la fiche mise à jour si sa valeur n'a pas
   * réellement changé, même contrat de stabilité que `commitBalances()`. */
  private commitBalance(ficheId: string, balance: FicheBalance): void {
    const prev = this.balances.get(ficheId);
    const unchanged = prev && prev.price === balance.price && prev.paid === balance.paid && prev.reste === balance.reste;
    const next = new Map(this.balances);
    next.set(ficheId, unchanged ? prev : balance);
    this.balances = next;
  }

  /** Rafraîchissement CIBLÉ d'UNE fiche (§28) — appelé par la page après un
   * événement externe qui affecte la balance (ex. `total_price` modifié via
   * `FicheRepository`), sans jamais recalculer le solde côté client. Doit
   * IMPÉRATIVEMENT passer par `commitBalance()` (upsert) et non
   * `commitBalances()` (remplacement intégral) : sinon chaque appel — y
   * compris celui déclenché par `add()` à CHAQUE versement — effacerait les
   * balances déjà connues de toutes les AUTRES fiches en cache. */
  async refreshBalance(ficheId: string): Promise<void> {
    try {
      const { data, error } = await this.gateway.getFicheBalance(this.workshopId, ficheId);
      if (error || !data) throw new Error(error?.message ?? "réponse vide");
      const row = parseRowOrThrow(ficheBalanceRowSchema, data, "SupabasePaymentRepository.refreshBalance");
      this.commitBalance(ficheId, mapFicheBalanceRowToDomain(row));
      this.lastBalanceRefreshError = null;
      this.notify();
    } catch (err) {
      this.lastBalanceRefreshError = err instanceof Error ? err : new Error(String(err));
      // Ancienne balance conservée telle quelle — jamais un faux zéro.
    }
  }

  getLastBalanceRefreshError(): Error | null {
    return this.lastBalanceRefreshError;
  }

  getStatus(): RepositoryStatus {
    const paymentsStatus = this.store.getStatus();
    if (paymentsStatus.status === "error") return paymentsStatus;
    if (this.balancesStatus.status === "error") return this.balancesStatus;
    if (paymentsStatus.status === "loading" || this.balancesStatus.status === "loading") return LOADING_STATUS;
    return READY_STATUS;
  }

  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    const unsubStore = this.store.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      unsubStore();
    };
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Référence STABLE par fiche tant que la collection globale n'a pas
   * réellement changé (§21, même contrat que `rowsForFiche`/`getDerived`
   * dans `SupabaseMediaRepository`) — `this.store.list()` est déjà stable par
   * référence globale (`CloudCollectionStore`), ce cache dérive juste le
   * FILTRE par fiche sans jamais reconstruire un tableau si la source n'a
   * pas changé. */
  private derivedByFiche = new Map<string, { source: Payment[]; result: Payment[] }>();

  list(ficheId: string): Payment[] {
    const source = this.store.list();
    const cached = this.derivedByFiche.get(ficheId);
    if (cached && cached.source === source) return cached.result;
    const result = source.filter((p) => p.ficheId === ficheId);
    this.derivedByFiche.set(ficheId, { source, result });
    return result;
  }

  getBalance(ficheId: string): FicheBalance {
    return this.balances.get(ficheId) ?? ZERO_BALANCE;
  }

  dispose(): void {
    this.store.dispose();
    this.listeners.clear();
  }

  /** Ordre imposé (§23) : validation → INSERT serveur → confirmation +
   * validation de la ligne → commit dans le store (jamais optimiste) →
   * rafraîchissement CIBLÉ de la balance → notify. Le refresh balance est
   * AWAIT ICI (pas fire-and-forget) : à la résolution de `add()`,
   * `getLastBalanceRefreshError()` reflète déjà fidèlement le résultat de CE
   * rafraîchissement précis pour l'appelant (§24/§35). Un échec du refresh
   * balance NE fait PAS rejeter `add()` — le paiement est réellement créé,
   * `add()` ne doit jamais le renier (§24). Aucun retry automatique de
   * l'INSERT lui-même (§25) — `client_payments` est immuable. */
  async add(input: AddPaymentInput): Promise<Payment> {
    const parsed = parseOrThrow(addPaymentInputSchema, input, "SupabasePaymentRepository.add");
    const payload = mapAddPaymentInputToInsert(parsed, this.workshopId);
    const { data, error } = await this.gateway.insertClientPayment(payload);
    if (error) throw new Error(error.message);
    const payment = mapClientPaymentRowToDomain(parseRowOrThrow(clientPaymentRowSchema, data, "SupabasePaymentRepository.add"));
    this.store.applyMutation(payment.id, payment);
    await this.refreshBalance(parsed.ficheId);
    this.notify();
    return payment;
  }
}
