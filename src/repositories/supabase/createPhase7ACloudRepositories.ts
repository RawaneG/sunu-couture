// Point d'entrée testable des fondations cloud Phase 7A — PAS le backend
// applicatif complet (corr. R §15). N'est appelé nulle part dans
// `RepositoryContainer.ts` : `VITE_BACKEND=supabase` reste bloqué tant que
// le gate (7B + 8A + 8B + 11A) n'est pas atteint. Cette factory sert à
// construire/tester les 3 repositories cloud 7A ensemble, avec un
// `SupabaseGateway` injectable (jamais le singleton `supabase` importé en
// dur — voir gateway.ts).
import type { SupabaseGateway } from "./gateway";
import { SupabaseClientRepository } from "./SupabaseClientRepository";
import { SupabaseCarnetRepository } from "./SupabaseCarnetRepository";
import { SupabaseFicheRepository } from "./SupabaseFicheRepository";

export interface Phase7ACloudRepositories {
  clients: SupabaseClientRepository;
  carnets: SupabaseCarnetRepository;
  fiches: SupabaseFicheRepository;
}

export interface CreatePhase7ACloudRepositoriesOptions {
  gateway: SupabaseGateway;
  /** Jamais un "premier atelier disponible" ni une valeur arbitraire — doit
   * venir de `auth.workshop.id` (corr. R §13). */
  workshopId: string;
}

/** Construit les 3 repositories cloud de la Phase 7A, correctement scopés au
 * même atelier et interconnectés (`fiches` a besoin de `carnets` pour
 * résoudre `carnetNumero`). Ne construit PAS `payments`/`media`/`modeles` —
 * hors périmètre 7A (corr. R). Attendre `Promise.all([...bootstrapped])`
 * avant de lire `list()`/`get()` pour un état garanti hydraté, ou laisser
 * les hooks React gérer l'état `loading` normalement. */
export function createPhase7ACloudRepositories(options: CreatePhase7ACloudRepositoriesOptions): Phase7ACloudRepositories {
  if (!options.workshopId) {
    throw new Error("createPhase7ACloudRepositories : workshopId requis (jamais un atelier arbitraire, corr. R §13).");
  }
  const carnets = new SupabaseCarnetRepository({ gateway: options.gateway, workshopId: options.workshopId });
  const clients = new SupabaseClientRepository({ gateway: options.gateway, workshopId: options.workshopId });
  const fiches = new SupabaseFicheRepository({ gateway: options.gateway, workshopId: options.workshopId, carnets });
  return { clients, carnets, fiches };
}

/** Libère les abonnements/epochs des 3 repositories — à appeler avant de
 * jeter une instance (changement d'atelier, démontage de test). */
export function disposePhase7ACloudRepositories(repos: Phase7ACloudRepositories): void {
  repos.clients.dispose();
  repos.carnets.dispose();
  repos.fiches.dispose();
}
