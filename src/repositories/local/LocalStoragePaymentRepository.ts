import { resteFor, useStore } from "../../lib/store";
import type { Fiche } from "../../lib/types";
import type { AddPaymentInput, FicheBalance, Payment, PaymentRepository } from "../PaymentRepository";
import { addPaymentInputSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

export class LocalStoragePaymentRepository implements PaymentRepository {
  // Cache par ficheId, tenu par référence de `fiches` — même raison que
  // LocalStorageCarnetRepository : `list()` doit renvoyer la MÊME référence
  // de tableau tant que rien n'a changé (instantané stable, useSyncExternalStore).
  private cache = new Map<string, { fiches: Fiche[]; result: Payment[] }>();

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
    if (!fiche) return { price: 0, paid: 0, reste: 0 };
    return { price: fiche.price, paid: fiche.avance, reste: resteFor(fiche) };
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("fiches", listener);
  }
}
