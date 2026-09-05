// Point d'entrée testable des fondations cloud Phase 8A — PAS le backend
// applicatif complet (même principe que `createPhase7ACloudRepositories`,
// corr. R §42). N'est appelé nulle part dans `RepositoryContainer.ts` :
// `VITE_BACKEND=supabase` reste bloqué tant que le gate (7B + 8A + 8B + 11A)
// n'est pas atteint (§43). Réutilise la factory 7A telle quelle et ajoute
// `media: SupabaseMediaRepository`, scopé au même atelier.
import { createPhase7ACloudRepositories, disposePhase7ACloudRepositories, type Phase7ACloudRepositories } from "./createPhase7ACloudRepositories";
import { SupabaseMediaRepository } from "./SupabaseMediaRepository";
import type { SupabaseGateway } from "./gateway";

export interface Phase8ACloudRepositories extends Phase7ACloudRepositories {
  media: SupabaseMediaRepository;
}

export interface CreatePhase8ACloudRepositoriesOptions {
  gateway: SupabaseGateway;
  /** Jamais un "premier atelier disponible" ni une valeur arbitraire — doit
   * venir de `auth.workshop.id` (corr. R §13). */
  workshopId: string;
}

export function createPhase8ACloudRepositories(options: CreatePhase8ACloudRepositoriesOptions): Phase8ACloudRepositories {
  const phase7A = createPhase7ACloudRepositories(options);
  const media = new SupabaseMediaRepository({ gateway: options.gateway, workshopId: options.workshopId });
  return { ...phase7A, media };
}

export function disposePhase8ACloudRepositories(repos: Phase8ACloudRepositories): void {
  disposePhase7ACloudRepositories(repos);
  repos.media.dispose();
}
