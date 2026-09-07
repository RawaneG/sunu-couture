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
// Import TYPE UNIQUEMENT depuis `./supabase/gateway` — ce module ne dépend
// d'aucun client Supabase concret (`SupabaseClient` n'y est utilisé que
// comme paramètre de `createSupabaseGateway()`, jamais importé). Les
// factories `createPhase*ACloudRepositories` prennent elles aussi un
// `SupabaseGateway` déjà construit, jamais `src/lib/supabase/client.ts` —
// c'est cette propriété qui permet à ce fichier (et donc à
// `RepositoryProvider.tsx`) de rester chargeable dans les tests sans
// `VITE_SUPABASE_*` (corr. Gate §6/§9).
import type { SupabaseGateway } from "./supabase/gateway";
import { createPhase11ACloudRepositories, disposePhase11ACloudRepositories } from "./supabase/createPhase11ACloudRepositories";

export interface RepositoryContainer {
  clients: ClientRepository;
  fiches: FicheRepository;
  carnets: CarnetRepository;
  payments: PaymentRepository;
  media: MediaRepository;
  subscriptions: SubscriptionRepository;
  modeles: ModeleRepository;
  /** Présent uniquement pour les conteneurs à cycle de vie propre (timers,
   * abonnements, `CloudCollectionStore`, cycle de vie des URLs signées — le
   * backend `supabase`). Le conteneur `local` n'en a pas besoin et ne le
   * fournit pas — l'appelant doit toujours utiliser `container.dispose?.()`,
   * jamais présumer sa présence (corr. Gate §13). */
  dispose?(): void;
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
  /** Atelier authentifié courant (`auth.workshop.id`, résolu par
   * `AuthProvider` — jamais un "premier atelier disponible" ni un id
   * arbitraire, corr. R Phase 7A §13). Ignoré par le backend `local`, qui
   * n'a jamais besoin d'atelier. Obligatoire pour `backend = "supabase"`
   * (corr. Gate §7) : absent/vide → échec explicite, jamais un fallback vers
   * un autre atelier ni vers le backend local. */
  workshopId?: string;
  /** Gateway Supabase déjà construit — voir `createSupabaseGateway()` dans
   * `./supabase/gateway.ts`, appelé par l'appelant RÉEL (aujourd'hui
   * `RepositoryProvider`) avec le singleton `src/lib/supabase/client.ts`.
   * Obligatoire pour `backend = "supabase"` (corr. Gate §6/§20) : absent →
   * échec explicite, jamais un fallback vers le backend local. */
  supabaseGateway?: SupabaseGateway;
}

/** Construit le lot cloud complet Phase 11A (clients/fiches/carnets/
 * payments/media/modeles — tous SCOPÉS AU MÊME `workshopId`, jamais un
 * mélange Supabase/LocalStorage, corr. Gate §5) et referme dessus
 * `subscriptions` : Phase 14 n'existe pas encore, donc l'adaptateur pilote
 * `LocalStorageSubscriptionRepository` reste utilisé tel quel — ce n'est PAS
 * un fallback de données métier cloud (il ne lit/n'écrit aucune donnée
 * LocalStorage métier ; `canCreateFiche()` est une règle pilote statique
 * toujours autorisée aujourd'hui), seulement l'absence assumée du domaine
 * abonnement avant son implémentation réelle (corr. Gate §15). */
function createSupabaseRepositoryContainer(options: RepositoryContainerOptions): RepositoryContainer {
  if (!options.supabaseGateway) {
    throw new Error(
      "RepositoryContainer : backend=\"supabase\" requiert un supabaseGateway (voir createSupabaseGateway()) — jamais un fallback local (corr. Gate §6/§20).",
    );
  }
  if (!options.workshopId) {
    throw new Error(
      "RepositoryContainer : backend=\"supabase\" requiert un workshopId réel (auth.workshop.id) — jamais un atelier arbitraire ni un fallback local (corr. Gate §7/§21).",
    );
  }
  const cloud = createPhase11ACloudRepositories({ gateway: options.supabaseGateway, workshopId: options.workshopId });
  return {
    clients: cloud.clients,
    fiches: cloud.fiches,
    carnets: cloud.carnets,
    payments: cloud.payments,
    media: cloud.media,
    modeles: cloud.modeles,
    subscriptions: new LocalStorageSubscriptionRepository(),
    dispose() {
      disposePhase11ACloudRepositories(cloud);
    },
  };
}

export function createRepositoryContainerFor(backend: Backend, options?: RepositoryContainerOptions): RepositoryContainer {
  switch (backend) {
    case "local":
      return createLocalRepositoryContainer();
    case "supabase":
      return createSupabaseRepositoryContainer(options ?? {});
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
