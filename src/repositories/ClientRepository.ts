import type { Client } from "../lib/types";

export interface NewClientInput {
  name: string;
  phone: string;
  photo: string | null;
}

/** Clients de l'atelier. Le lien entre un client et ses fiches vit sur
 * `FicheRepository.listByClient()` — une fiche reste la source de vérité
 * (nom/prénom/téléphone écrits comme sur papier), `Client` n'est qu'un lien
 * optionnel superposé (voir `Fiche.clientId`, décision D4). */
export interface ClientRepository {
  list(): Client[];
  get(id: string): Client | undefined;
  add(input: NewClientInput): string;
  /** Ne touche jamais les fiches du client — `FicheRepository` détache
   * `clientId` séparément (comportement actuel de `store.ts`, conservé). */
  remove(id: string): void;
  removeMany(ids: string[]): void;
  /** S'abonne aux changements de la collection clients ; renvoie une fonction
   * de désabonnement. Snapshot stable : le callback n'est appelé que lorsque
   * la référence de la collection change réellement. */
  subscribe(listener: () => void): () => void;
}
