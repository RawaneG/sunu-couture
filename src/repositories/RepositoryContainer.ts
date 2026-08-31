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

/** Point d'extension unique pour les phases futures : un `case "supabase"`
 * s'ajoutera ici (Phase 7+) sans toucher aux pages ni aux hooks. Aujourd'hui,
 * seul `"local"` est atteignable — `resolveBackend()` (appelée par
 * `currentBackend()`) lève déjà une `BackendConfigurationError` avant
 * d'arriver ici pour toute autre valeur. */
/** Exporté (en plus de `createRepositoryContainer()`) pour permettre aux tests
 * de construire explicitement un conteneur pour un backend donné, sans devoir
 * manipuler `import.meta.env.VITE_BACKEND`. */
export function createRepositoryContainerFor(backend: Backend): RepositoryContainer {
  switch (backend) {
    case "local":
      return createLocalRepositoryContainer();
    case "supabase":
      // Inatteignable en pratique : `resolveBackend()` (appelée par
      // `currentBackend()`) lève déjà une `BackendConfigurationError` avant
      // d'arriver ici pour "supabase" (Phase 5). Le `case` explicite est ce
      // qui permettra d'y brancher `createSupabaseRepositoryContainer()`
      // en Phase 7+ sans toucher au reste de ce fichier.
      throw new Error('Backend "supabase" non géré (Repository Supabase pas encore implémenté).');
    default: {
      // Exhaustivité : toute valeur de `Backend` non gérée ci-dessus est une
      // erreur de programmation détectée à la compilation.
      const exhaustive: never = backend;
      throw new Error(`Backend non géré : ${String(exhaustive)}`);
    }
  }
}

export function createRepositoryContainer(): RepositoryContainer {
  return createRepositoryContainerFor(currentBackend());
}
