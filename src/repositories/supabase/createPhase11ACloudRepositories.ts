// Point d'entrée testable des fondations cloud Phase 11A — PAS le backend
// applicatif complet (même principe que les factories 7A/8A/8B, corr. R).
// N'est appelé nulle part dans `RepositoryContainer.ts` : `VITE_BACKEND=
// supabase` reste bloqué tant que le gate (7B + 8A + 8B + 11A) n'est pas
// ATTEINT — 11A implémentée ici ne l'active pas elle-même (§39/§40, gate =
// étape séparée après merge/déploiement/vérification). Réutilise la factory
// 8B telle quelle et ajoute `payments: SupabasePaymentRepository`, scopé au
// même atelier.
import { createPhase8BCloudRepositories, disposePhase8BCloudRepositories, type Phase8BCloudRepositories } from "./createPhase8BCloudRepositories";
import { SupabasePaymentRepository } from "./SupabasePaymentRepository";
import type { SupabaseGateway } from "./gateway";

export interface Phase11ACloudRepositories extends Phase8BCloudRepositories {
  payments: SupabasePaymentRepository;
}

export interface CreatePhase11ACloudRepositoriesOptions {
  gateway: SupabaseGateway;
  /** Jamais un "premier atelier disponible" ni une valeur arbitraire — doit
   * venir de `auth.workshop.id` (corr. R §13). */
  workshopId: string;
}

export function createPhase11ACloudRepositories(options: CreatePhase11ACloudRepositoriesOptions): Phase11ACloudRepositories {
  const phase8B = createPhase8BCloudRepositories(options);
  const payments = new SupabasePaymentRepository({ gateway: options.gateway, workshopId: options.workshopId });
  return { ...phase8B, payments };
}

export function disposePhase11ACloudRepositories(repos: Phase11ACloudRepositories): void {
  disposePhase8BCloudRepositories(repos);
  repos.payments.dispose();
}
