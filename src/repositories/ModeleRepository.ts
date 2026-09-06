import type { Modele } from "../lib/types";
import type { ObservableRepositoryStatus } from "./RepositoryStatus";

/** Entrée de création — Phase 8B : un modèle cloud ne peut pas exister sans
 * nom (`public.modeles.nom` : `NOT NULL`, `length(btrim(nom)) BETWEEN 1 AND
 * 200`), contrairement à l'ancien `add(): Promise<string>` qui créait un
 * modèle local vide puis laissait le tailleur le nommer après coup. Le nom
 * doit toujours venir explicitement du tailleur — jamais un fallback inventé
 * ("Nouveau modèle", "Sans nom", ...), voir `ModeleNew.tsx`. */
export interface NewModeleInput {
  nom: string;
}

/** Ajout justifié au-delà des 6 repositories nommés dans le plan de
 * migration : le catalogue de modèles (`Catalogue.tsx`, `ModeleDetail.tsx`,
 * `ModeleNew.tsx`) est une donnée métier à part entière (création, nom,
 * suppression), qui ne correspond honnêtement à aucun des 6 repositories
 * demandés (ce n'est ni un client, ni une fiche, ni un carnet, ni un
 * paiement, ni de l'abonnement — ses PHOTOS vivent dans `MediaRepository`,
 * mais le modèle lui-même a besoin d'un CRUD propre pour respecter l'objectif
 * de la phase : plus aucune page ne doit lire `useStore` pour une donnée
 * métier).
 *
 * Lectures synchrones, mutations asynchrones (corr. R, Phase 7A) — voir
 * `ClientRepository`. `ObservableRepositoryStatus` (Phase 8B) : absence de
 * `getStatus()` ⇒ "ready" immédiat pour un backend local ; un backend cloud
 * (`SupabaseModeleRepository`) l'implémente pour distinguer loading/ready/
 * error, comme les autres Repository cloud. */
export interface ModeleRepository extends ObservableRepositoryStatus {
  list(): Modele[];
  get(id: string): Modele | undefined;
  add(input: NewModeleInput): Promise<string>;
  setNom(id: string, nom: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  subscribe(listener: () => void): () => void;
}
