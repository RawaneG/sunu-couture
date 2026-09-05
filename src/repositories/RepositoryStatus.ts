/** État d'hydratation observable d'un Repository — capacité OPTIONNELLE
 * (`getStatus?()`), absente pour tout Repository purement synchrone
 * (`LocalStorage*Repository` : rien à charger, toujours "ready"). Un
 * Repository cloud (Phase 7A+) l'implémente pour distinguer, côté hook,
 * "pas encore hydraté" de "hydraté et introuvable" — sans ça, un
 * `get(id)` synchrone renvoyant `undefined` pendant l'hydratation serait
 * indiscernable d'une entité réellement absente (cause de fausses
 * redirections "introuvable" pendant un chargement réseau).
 *
 * `READY_STATUS` est une référence STABLE (même objet à chaque appel) —
 * indispensable pour `useSyncExternalStore`, qui compare les snapshots par
 * référence : un Repository qui n'implémente pas `getStatus()` doit être lu
 * via `repo.getStatus?.() ?? READY_STATUS`, jamais `?? { status: "ready" }`
 * (qui créerait une nouvelle référence à chaque rendu). */
export type RepositoryStatus =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; error: Error };

export const READY_STATUS: RepositoryStatus = { status: "ready" };
export const LOADING_STATUS: RepositoryStatus = { status: "loading" };

export interface ObservableRepositoryStatus {
  /** Snapshot stable (même référence tant que l'état n'a pas changé) de
   * l'hydratation de la collection. Optionnel — son absence vaut "ready". */
  getStatus?(): RepositoryStatus;
}
