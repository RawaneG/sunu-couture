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

  add(input: NewClientInput): string {
    const parsed = parseOrThrow(newClientInputSchema, input, "ClientRepository.add");
    return useStore.getState().addClient(parsed);
  }

  remove(id: string): void {
    useStore.getState().deleteClient(id);
  }

  removeMany(ids: string[]): void {
    useStore.getState().deleteClients(ids);
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("clients", listener);
  }
}
