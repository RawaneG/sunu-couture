/** Abonnement Tayoo. Aujourd'hui, `entitlements.ts` documente une seule règle
 * réelle (déjà dans le code, jamais encore appelée par un écran) : rien n'est
 * bloqué pendant le pilote. Cette interface expose EXACTEMENT cette règle,
 * sans inventer de méthodes de plan/facturation qui n'ont aucun appelant
 * actuel (Phase 14 les introduira). */
export interface SubscriptionRepository {
  /** Toujours `true` aujourd'hui (aucune offre active) — voir
   * `src/lib/entitlements.ts#peutCreerNouveauCarnet`, le seul point qu'un
   * futur paywall (Phase 14) aura à modifier. */
  canCreateFiche(): boolean;
}
