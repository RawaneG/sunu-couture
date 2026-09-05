import { resteFor, useStore } from "../../lib/store";
import type { Fiche } from "../../lib/types";
import type { FicheBalance, Payment, PaymentRepository } from "../PaymentRepository";
import { amountSchema, parseOrThrow } from "../schemas";
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
    const result: Payment[] = !fiche || fiche.avance <= 0 ? [] : [{ id: `${ficheId}-avance`, ficheId, amount: fiche.avance }];
    this.cache.set(ficheId, { fiches, result });
    return result;
  }

  // Mutation asynchrone (corr. R, Phase 7A) — voir LocalStorageClientRepository.
  async setAmount(ficheId: string, amount: number): Promise<void> {
    const parsed = parseOrThrow(amountSchema, amount, "PaymentRepository.setAmount");
    useStore.getState().setFicheInfo(ficheId, { avance: parsed });
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
