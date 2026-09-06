// DB row ↔ domaine `Payment`/`FicheBalance` — Phase 11A.
import type { Database } from "../../../lib/supabase/database.types";
import type { AddPaymentInput, FicheBalance, Payment } from "../../PaymentRepository";
import type { ClientPaymentRow, FicheBalanceRow } from "../schemas";

type ClientPaymentInsert = Database["public"]["Tables"]["client_payments"]["Insert"];

export function mapClientPaymentRowToDomain(row: ClientPaymentRow): Payment {
  return {
    id: row.id,
    ficheId: row.fiche_id,
    amount: row.amount,
    paidAt: row.paid_at,
    method: row.method,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

/** `AddPaymentInput` (déjà validé par `addPaymentInputSchema`) → payload
 * d'insertion. `recorded_at`/`created_at` ne sont JAMAIS fournis — les
 * defaults serveur (`now()`) suffisent (§13). `metadata` reste `{}`. */
export function mapAddPaymentInputToInsert(input: AddPaymentInput, workshopId: string): ClientPaymentInsert {
  return {
    workshop_id: workshopId,
    fiche_id: input.ficheId,
    amount: input.amount,
    paid_at: input.paidAt ?? null,
    method: input.method ?? null,
    note: input.note ?? null,
    metadata: {},
  };
}

/** `reste` reflète la vue SQL telle quelle — jamais tronqué à 0 (un
 * surpaiement produit un `reste` négatif, fidèlement conservé). */
export function mapFicheBalanceRowToDomain(row: FicheBalanceRow): FicheBalance {
  return { price: row.total_price, paid: row.total_paid, reste: row.reste };
}
