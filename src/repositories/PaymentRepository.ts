import type { Database } from "../lib/supabase/database.types";
import type { ObservableRepositoryStatus } from "./RepositoryStatus";

/** Réutilise l'enum généré (`public.payment_method`) plutôt que de le
 * dupliquer — voir aussi `PAYMENT_METHODS` (valeur runtime, pour Zod). */
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export const PAYMENT_METHODS = ["cash", "wave", "orange_money", "free_money", "bank", "other"] as const satisfies readonly PaymentMethod[];

/** Phase 11A — `client_payments` devient un VRAI ledger append-only (décision
 * D6/Phase 11) : chaque `Payment` est une ligne immuable, jamais un montant
 * unique remplacé (`setAmount`, avant 11A). Le backend local ne peut pas
 * fabriquer un historique honnête (`Fiche.avance` reste un seul champ) — voir
 * `LocalStoragePaymentRepository` : `list()` y renvoie au plus UN paiement
 * synthétique représentant l'agrégat courant, jamais un historique inventé. */
export interface Payment {
  id: string;
  ficheId: string;
  amount: number;
  /** Date effective du versement (saisie libre) — `null` si non renseignée,
   * jamais une date inventée (`new Date()`). */
  paidAt: string | null;
  method: PaymentMethod | null;
  note: string | null;
  /** Horodatage serveur de l'enregistrement (`recorded_at`), distinct de
   * `paidAt` — voir le commentaire de `mapVoiceNoteRowToDomain` pour la même
   * distinction ailleurs dans le projet. */
  recordedAt: string;
}

/** Reflète `public.fiche_balances` (vue SQL autoritative, Phase 4/11A) —
 * jamais recalculée côté client depuis `Fiche.price`/`avance` ou depuis
 * `Payment[]`. `reste` peut être NÉGATIF (surpaiement) : jamais tronqué à 0. */
export interface FicheBalance {
  price: number;
  paid: number;
  reste: number;
}

export interface AddPaymentInput {
  ficheId: string;
  /** Entier strictement positif — voir `paymentAmountSchema`. Un ledger
   * n'accepte jamais 0 (rien à enregistrer) ni une correction (Phase 11
   * complète traitera les corrections/contre-écritures). */
  amount: number;
  paidAt?: string | null;
  method?: PaymentMethod | null;
  note?: string | null;
}

/** Lectures synchrones, mutations asynchrones (corr. R, Phase 7A) — voir
 * `ClientRepository`. `ObservableRepositoryStatus` (comme `ModeleRepository`
 * Phase 8B) : absence de `getStatus()` ⇒ "ready" immédiat pour le backend
 * local ; le backend cloud (`SupabasePaymentRepository`) distingue
 * loading/ready/error — voir §18 : un solde pas encore chargé ne doit JAMAIS
 * être confondu avec un solde à zéro. */
export interface PaymentRepository extends ObservableRepositoryStatus {
  /** Paiements d'UNE fiche — 0..N côté cloud, 0 ou 1 (synthétique) en local. */
  list(ficheId: string): Payment[];
  /** INSERT confirmé serveur AVANT tout commit mémoire (jamais optimiste) —
   * voir le commentaire de tête de `SupabasePaymentRepository`. */
  add(input: AddPaymentInput): Promise<Payment>;
  getBalance(ficheId: string): FicheBalance;
  /** Optionnel — absent en local (aucun rafraîchissement réseau n'existe).
   * Reflète l'échec du DERNIER rafraîchissement de `fiche_balances`
   * UNIQUEMENT (jamais un échec d'INSERT, qui fait rejeter `add()`
   * lui-même) : `null` si la dernière tentative a réussi. Permet à l'appelant
   * de distinguer "versement non enregistré" de "versement enregistré, solde
   * pas encore actualisé" (§24/§35) sans changer la forme de retour de
   * `add()`. */
  getLastBalanceRefreshError?(): Error | null;
  /** Optionnel — absent en local (le solde y est recalculé en direct à
   * chaque lecture, jamais mis en cache). Force un rafraîchissement CIBLÉ de
   * la balance autoritative d'une fiche après un événement externe qui
   * l'affecte (ex. `total_price` modifié via `FicheRepository`), sans jamais
   * recalculer le solde côté client (§28). */
  refreshBalance?(ficheId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}
