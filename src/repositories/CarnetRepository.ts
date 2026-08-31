/** Le carnet n'est pas encore une entité persistée séparément côté frontend
 * (contrairement au schéma Supabase cible, table `carnets`, Phase 2/7) — il
 * est aujourd'hui entièrement DÉRIVÉ des fiches existantes, exactement comme
 * dans `CarnetList.tsx` avant cette phase. Cette interface expose donc
 * uniquement ce que l'écran carnet utilise réellement : le numéro de carnet
 * actif et le prochain emplacement libre. Aucune méthode de création/
 * archivage n'est ajoutée ici — rien dans l'app actuelle n'en a besoin
 * (ce sera un vrai CRUD une fois le Repository Supabase branché, Phase 7+). */
export interface CarnetSlot {
  carnetNumero: number;
  numero: number;
}

export interface CarnetRepository {
  /** Le plus grand `carnetNumero` parmi les fiches existantes (1 si aucune
   * fiche) — même formule que l'ancien `useMemo` de `CarnetList.tsx`. */
  getActiveCarnetNumero(): number;
  /** Le prochain `{carnetNumero, numero}` qui serait attribué à une nouvelle
   * fiche — délègue à `nextFicheSlot()` (`src/lib/store.ts`), inchangé. */
  getNextSlot(): CarnetSlot;
  subscribe(listener: () => void): () => void;
}
