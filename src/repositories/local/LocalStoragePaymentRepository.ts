import { resteFor, useStore } from "../../lib/store";
import type { Fiche } from "../../lib/types";
import type { AddPaymentInput, FicheBalance, Payment, PaymentRepository } from "../PaymentRepository";
import { addPaymentInputSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

/** Référence STABLE — une fiche introuvable doit toujours renvoyer LE MÊME
 * objet vide, jamais un objet frais à chaque appel (même bug que
 * `ZERO_BALANCE` dans `SupabasePaymentRepository`, corr. §13 — sinon
 * `useFichePayments`/`useSyncExternalStore` voit une "nouvelle" valeur à
 * chaque rendu et boucle indéfiniment, `FicheDetail` y compris). */
const ZERO_BALANCE: FicheBalance = { price: 0, paid: 0, reste: 0 };

export class LocalStoragePaymentRepository implements PaymentRepository {
  // Cache par ficheId, tenu par référence de `fiches` — même raison que
  // LocalStorageCarnetRepository : `list()` doit renvoyer la MÊME référence
  // de tableau tant que rien n'a changé (instantané stable, useSyncExternalStore).
  private cache = new Map<string, { fiches: Fiche[]; result: Payment[] }>();

  // Cache par ficheId, tenu par référence de LA FICHE elle-même (pas tout le
  // tableau `fiches` — `getBalance()` ne dépend que d'UNE fiche) : sans ce
  // cache, `getBalance()` construisait un objet `{price, paid, reste}` FRAIS
  // à CHAQUE appel, même quand rien n'avait changé — violation directe du
  // contrat `useSyncExternalStore` (`useFichePayments`, `hooks.ts`), qui
  // provoquait une boucle de rendu infinie dès l'ouverture d'une fiche ayant
  // un prix/avance renseigné.
  private balanceCache = new Map<string, { fiche: Fiche; balance: FicheBalance }>();

  list(ficheId: string): Payment[] {
    const fiches = useStore.getState().fiches;
    const cached = this.cache.get(ficheId);
    if (cached?.fiches === fiches) return cached.result;
    const fiche = fiches.find((f) => f.id === ficheId);
    // Au plus UN paiement SYNTHÉTIQUE représentant l'agrégat courant — ce
    // backend n'a pas de vrai ledger (`Fiche.avance` reste un total unique),
    // jamais un historique inventé (plusieurs entrées fictives).
    const result: Payment[] =
      !fiche || fiche.avance <= 0
        ? []
        : [{ id: `${ficheId}-avance`, ficheId, amount: fiche.avance, paidAt: null, method: null, note: null, recordedAt: fiche.createdAt }];
    this.cache.set(ficheId, { fiches, result });
    return result;
  }

  // Mutation asynchrone (corr. R, Phase 7A) — voir LocalStorageClientRepository.
  // Phase 11A : ledger honnête même en local — `add()` INCRÉMENTE l'agrégat
  // (`fiche.avance`), ne le REMPLACE jamais (contrairement à l'ancien
  // `setAmount()`). Le `Payment` renvoyé représente CE versement précis
  // (`amount` = le montant ajouté), distinct de l'entrée synthétique de
  // `list()` (qui montre le TOTAL courant) — les deux représentent des choses
  // différentes, jamais confondues.
  async add(input: AddPaymentInput): Promise<Payment> {
    const parsed = parseOrThrow(addPaymentInputSchema, input, "PaymentRepository.add");
    const fiche = useStore.getState().fiches.find((f) => f.id === parsed.ficheId);
    if (!fiche) {
      throw new Error(`LocalStoragePaymentRepository: fiche ${parsed.ficheId} introuvable — aucun versement enregistré.`);
    }
    const nouveauTotal = fiche.avance + parsed.amount;
    useStore.getState().setFicheInfo(parsed.ficheId, { avance: nouveauTotal });
    return {
      id: crypto.randomUUID(),
      ficheId: parsed.ficheId,
      amount: parsed.amount,
      paidAt: parsed.paidAt ?? null,
      method: parsed.method ?? null,
      note: parsed.note ?? null,
      recordedAt: new Date().toISOString(),
    };
  }

  getBalance(ficheId: string): FicheBalance {
    const fiche = useStore.getState().fiches.find((f) => f.id === ficheId);
    if (!fiche) return ZERO_BALANCE;
    const cached = this.balanceCache.get(ficheId);
    if (cached && cached.fiche === fiche) return cached.balance;
    const balance: FicheBalance = { price: fiche.price, paid: fiche.avance, reste: resteFor(fiche) };
    this.balanceCache.set(ficheId, { fiche, balance });
    return balance;
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("fiches", listener);
  }
}
