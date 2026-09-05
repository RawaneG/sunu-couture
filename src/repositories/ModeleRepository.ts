import type { Modele } from "../lib/types";

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
 * `ClientRepository`. Aucune implémentation cloud avant la Phase 8B. */
export interface ModeleRepository {
  list(): Modele[];
  get(id: string): Modele | undefined;
  add(): Promise<string>;
  setNom(id: string, nom: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  subscribe(listener: () => void): () => void;
}
