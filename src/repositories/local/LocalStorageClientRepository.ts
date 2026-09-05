import { useStore } from "../../lib/store";
import type { ClientRepository, NewClientInput } from "../ClientRepository";
import { newClientInputSchema, parseOrThrow, storedClientSchema, warnIfInvalid } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

/** Enveloppe fine autour de `useStore` (Zustand + `persist`, clé localStorage
 * `"sunu-couture"`, inchangée) — AUCUNE réimplémentation du stockage : même
 * moteur, même format, même migration (`migrateLegacyState`), rollback trivial
 * (revenir à `useStore` directement dans les pages). */
export class LocalStorageClientRepository implements ClientRepository {
  list() {
    const clients = useStore.getState().clients;
    warnIfInvalid(storedClientSchema, clients, "ClientRepository.list");
    return clients;
  }

  get(id: string) {
    return useStore.getState().getClient(id);
  }

  // Mutations asynchrones (corr. R, Phase 7A) — la mutation Zustand
  // elle-même reste synchrone et immédiatement visible ; seule la forme du
  // contrat (Promise) change, pour rester compatible avec un futur
  // Repository réseau sans mentir sur le résultat.
  async add(input: NewClientInput): Promise<string> {
    const parsed = parseOrThrow(newClientInputSchema, input, "ClientRepository.add");
    return useStore.getState().addClient(parsed);
  }

  async remove(id: string): Promise<void> {
    useStore.getState().deleteClient(id);
  }

  async removeMany(ids: string[]): Promise<void> {
    useStore.getState().deleteClients(ids);
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("clients", listener);
  }
}
