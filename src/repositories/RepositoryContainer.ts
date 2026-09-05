import { currentBackend, type Backend } from "../lib/backend";
import type { CarnetRepository } from "./CarnetRepository";
import type { ClientRepository } from "./ClientRepository";
import type { FicheRepository } from "./FicheRepository";
import type { MediaRepository } from "./MediaRepository";
import type { ModeleRepository } from "./ModeleRepository";
import type { PaymentRepository } from "./PaymentRepository";
import type { SubscriptionRepository } from "./SubscriptionRepository";
import { LocalStorageCarnetRepository } from "./local/LocalStorageCarnetRepository";
import { LocalStorageClientRepository } from "./local/LocalStorageClientRepository";
import { LocalStorageFicheRepository } from "./local/LocalStorageFicheRepository";
import { LocalStorageMediaRepository } from "./local/LocalStorageMediaRepository";
import { LocalStorageModeleRepository } from "./local/LocalStorageModeleRepository";
import { LocalStoragePaymentRepository } from "./local/LocalStoragePaymentRepository";
import { LocalStorageSubscriptionRepository } from "./local/LocalStorageSubscriptionRepository";

export interface RepositoryContainer {
  clients: ClientRepository;
  fiches: FicheRepository;
  carnets: CarnetRepository;
  payments: PaymentRepository;
  media: MediaRepository;
  subscriptions: SubscriptionRepository;
  modeles: ModeleRepository;
}

function createLocalRepositoryContainer(): RepositoryContainer {
  return {
    clients: new LocalStorageClientRepository(),
    fiches: new LocalStorageFicheRepository(),
    carnets: new LocalStorageCarnetRepository(),
    payments: new LocalStoragePaymentRepository(),
    media: new LocalStorageMediaRepository(),
    subscriptions: new LocalStorageSubscriptionRepository(),
    modeles: new LocalStorageModeleRepository(),
  };
}

export interface RepositoryContainerOptions {
  /** Atelier authentifié courant (`auth.workshop?.id`, résolu par
   * `AuthProvider` — jamais un "premier atelier disponible" ni un id
   * arbitraire, corr. R Phase 7A §13). Ignoré par le backend `local`, qui
   * n'a jamais besoin d'atelier (§12). Réservé à un futur backend
   * `supabase` complet (Phase 7B+) : `createPhase7ACloudRepositories()`
   * (voir `src/repositories/supabase/`) est le seul point qui l'utilise
   * aujourd'hui, en dehors de ce conteneur global toujours verrouillé sur
   * `"local"` (voir `case "supabase"` ci-dessous). */
  workshopId?: string;
}

/** Point d'extension unique pour les phases futures : un `case "supabase"`
 * s'ajoutera ici (Phase 7B+, une fois le gate `7B + 8A + 8B + 11A` atteint)
 * sans toucher aux pages ni aux hooks. Aujourd'hui, seul `"local"` est
 * atteignable — `resolveBackend()` (appelée par `currentBackend()`) lève déjà
 * une `BackendConfigurationError` avant d'arriver ici pour toute autre
 * valeur. La Phase 7A fournit déjà `SupabaseClientRepository`/
 * `SupabaseFicheRepository`/`SupabaseCarnetRepository` (testables,
 * constructibles directement — voir `src/repositories/supabase/`), mais ne
 * les branche PAS ici : c'est précisément l'activation interdite par la
 * correction R tant que le gate n'est pas atteint. */
/** Exporté (en plus de `createRepositoryContainer()`) pour permettre aux tests
 * de construire explicitement un conteneur pour un backend donné, sans devoir
 * manipuler `import.meta.env.VITE_BACKEND`. */
export function createRepositoryContainerFor(
  backend: Backend,
  _options?: RepositoryContainerOptions,
): RepositoryContainer {
  switch (backend) {
    case "local":
      return createLocalRepositoryContainer();
    case "supabase":
      // Inatteignable en pratique : `resolveBackend()` (appelée par
      // `currentBackend()`) lève déjà une `BackendConfigurationError` avant
      // d'arriver ici pour "supabase". Le `case` explicite documente le seul
      // endroit où un futur conteneur hybride/complet pourrait être branché
      // — et où il reste interdit tant que le gate (7B+8A+8B+11A) n'est pas
      // atteint (corr. R). Message tenu à jour : l'infrastructure cloud
      // partielle de la Phase 7A existe (`src/repositories/supabase/`) mais
      // n'est pas activable globalement.
      throw new Error(
        'Backend "supabase" : infrastructure cloud partielle disponible (Phase 7A — ' +
          "clients/fiches en lecture-écriture limitée, carnets en lecture seule), " +
          "mais l'activation globale reste interdite avant le gate cloud " +
          "(Phase 7B + 8A + 8B + 11A terminées, voir docs/refonte/03-DECISIONS.md corr. R).",
      );
    default: {
      // Exhaustivité : toute valeur de `Backend` non gérée ci-dessus est une
      // erreur de programmation détectée à la compilation.
      const exhaustive: never = backend;
      throw new Error(`Backend non géré : ${String(exhaustive)}`);
    }
  }
}

export function createRepositoryContainer(options?: RepositoryContainerOptions): RepositoryContainer {
  return createRepositoryContainerFor(currentBackend(), options);
}
