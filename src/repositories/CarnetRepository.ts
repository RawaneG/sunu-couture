import type { ObservableRepositoryStatus } from "./RepositoryStatus";

/** Le carnet n'est pas encore une entité persistée séparément côté frontend
 * (contrairement au schéma Supabase cible, table `carnets`, Phase 2/7) — il
 * est aujourd'hui entièrement DÉRIVÉ des fiches existantes, exactement comme
 * dans `CarnetList.tsx` avant cette phase. Cette interface expose donc
 * uniquement ce que l'écran carnet utilise réellement : le numéro de carnet
 * actif et le prochain emplacement libre. Aucune méthode de création/
 * archivage n'est ajoutée ici — rien dans l'app actuelle n'en a besoin
 * (ce sera un vrai CRUD une fois le Repository Supabase branché, Phase 7+).
 *
 * Phase 7A ajoute `getCarnetNumero(carnetId)` : lecture cloud SEULE capacité
 * nécessaire pour qu'un `SupabaseFicheRepository` reconstitue
 * `Fiche.carnetNumero` à partir de `fiches.carnet_id` (aucune vue SQL ne fait
 * ce join, voir corr. R) — implémentation LocalStorage inchangée (n'a pas de
 * notion de `carnet_id` séparée, ne l'implémente pas). Toujours PAS de
 * création/mise à jour de carnet ici (lecture seule, corr. R). */
export interface CarnetSlot {
  carnetNumero: number;
  numero: number;
}

export interface CarnetRepository extends ObservableRepositoryStatus {
  /** Le plus grand `carnetNumero` parmi les fiches existantes (1 si aucune
   * fiche) — même formule que l'ancien `useMemo` de `CarnetList.tsx`. */
  getActiveCarnetNumero(): number;
  /** Le prochain `{carnetNumero, numero}` qui serait attribué à une nouvelle
   * fiche — délègue à `nextFicheSlot()` (`src/lib/store.ts`), inchangé. */
  getNextSlot(): CarnetSlot;
  /** `carnets.number` (l'entier humain 1/2/3…) pour un `carnet_id` UUID
   * cloud donné, ou `undefined` si ce carnet n'est pas (encore) dans le
   * cache. `LocalStorageCarnetRepository` n'a pas de notion de `carnet_id`
   * séparée du carnet dérivé des fiches — renvoie toujours `undefined`,
   * jamais consultée par le chemin local (`Fiche.carnetNumero` y est déjà
   * un champ direct, pas une clé étrangère à résoudre). */
  getCarnetNumero(carnetId: string): number | undefined;
  subscribe(listener: () => void): () => void;
}
