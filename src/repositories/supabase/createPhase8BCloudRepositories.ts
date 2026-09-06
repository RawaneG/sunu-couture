// Point d'entrée testable des fondations cloud Phase 8B — PAS le backend
// applicatif complet (même principe que `createPhase7ACloudRepositories`/
// `createPhase8ACloudRepositories`, corr. R). N'est appelé nulle part dans
// `RepositoryContainer.ts` : `VITE_BACKEND=supabase` reste bloqué tant que le
// gate (7B + 8A + 8B + 11A) n'est pas atteint (11A manque encore). Réutilise
// la factory 8A telle quelle et remplace `modeles` par
// `SupabaseModeleRepository` (le conteneur local par défaut de
// `createPhase8ACloudRepositories` n'en fournissait pas — Phase 8A ne
// couvrait pas le catalogue).
import { createPhase8ACloudRepositories, disposePhase8ACloudRepositories, type Phase8ACloudRepositories } from "./createPhase8ACloudRepositories";
import { SupabaseModeleRepository } from "./SupabaseModeleRepository";
import type { SupabaseGateway } from "./gateway";

export interface Phase8BCloudRepositories extends Phase8ACloudRepositories {
  modeles: SupabaseModeleRepository;
}

export interface CreatePhase8BCloudRepositoriesOptions {
  gateway: SupabaseGateway;
  /** Jamais un "premier atelier disponible" ni une valeur arbitraire — doit
   * venir de `auth.workshop.id` (corr. R §13). */
  workshopId: string;
}

export function createPhase8BCloudRepositories(options: CreatePhase8BCloudRepositoriesOptions): Phase8BCloudRepositories {
  const phase8A = createPhase8ACloudRepositories(options);
  const modeles = new SupabaseModeleRepository({ gateway: options.gateway, workshopId: options.workshopId });
  return { ...phase8A, modeles };
}

export function disposePhase8BCloudRepositories(repos: Phase8BCloudRepositories): void {
  disposePhase8ACloudRepositories(repos);
  repos.modeles.dispose();
}
