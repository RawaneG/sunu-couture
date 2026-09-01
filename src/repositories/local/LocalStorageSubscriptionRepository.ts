import { peutCreerNouveauCarnet } from "../../lib/entitlements";
import type { SubscriptionRepository } from "../SubscriptionRepository";

export class LocalStorageSubscriptionRepository implements SubscriptionRepository {
  canCreateFiche(): boolean {
    // Le nombre de carnets existants n'a aucune influence tant que le pilote
    // n'a pas d'offre active — voir entitlements.ts.
    return peutCreerNouveauCarnet(0);
  }
}
