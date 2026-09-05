import type { Client } from "../lib/types";
import type { ObservableRepositoryStatus } from "./RepositoryStatus";

export interface NewClientInput {
  name: string;
  phone: string;
  photo: string | null;
}

/** Clients de l'atelier. Le lien entre un client et ses fiches vit sur
 * `FicheRepository.listByClient()` — une fiche reste la source de vérité
 * (nom/prénom/téléphone écrits comme sur papier), `Client` n'est qu'un lien
 * optionnel superposé (voir `Fiche.clientId`, décision D4).
 *
 * Lectures (`list`/`get`) restent des snapshots SYNCHRONES — y compris pour
 * un Repository cloud (Phase 7A) : la donnée réseau vit dans un cache déjà
 * hydraté en mémoire, jamais attendue au moment de l'appel (voir
 * `ObservableRepositoryStatus` pour distinguer "pas encore hydraté" de
 * "hydraté et absent"). Les MUTATIONS sont asynchrones (corr. R, Phase 7A) :
 * une écriture réseau ne peut pas mentir sur son résultat en renvoyant une
 * valeur avant confirmation. */
export interface ClientRepository extends ObservableRepositoryStatus {
  list(): Client[];
  get(id: string): Client | undefined;
  add(input: NewClientInput): Promise<string>;
  /** Ne touche jamais les fiches du client — `FicheRepository` détache
   * `clientId` séparément (comportement actuel de `store.ts`, conservé). */
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  /** S'abonne aux changements de la collection clients ; renvoie une fonction
   * de désabonnement. Snapshot stable : le callback n'est appelé que lorsque
   * la référence de la collection change réellement. */
  subscribe(listener: () => void): () => void;
}
