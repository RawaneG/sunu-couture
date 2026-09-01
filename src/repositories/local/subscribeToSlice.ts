import { useStore, type StoreState } from "../../lib/store";

/** Abonnement scopé à UNE clé du store : le listener n'est appelé que lorsque
 * la référence de cette clé change réellement (Zustand ne remplace que les
 * clés effectivement modifiées par un `set()`, jamais l'objet entier) — évite
 * toute notification/rendu superflu pour un changement sans rapport. */
export function subscribeToSlice(key: keyof StoreState, listener: () => void): () => void {
  return useStore.subscribe((state, prevState) => {
    if (state[key] !== prevState[key]) listener();
  });
}
