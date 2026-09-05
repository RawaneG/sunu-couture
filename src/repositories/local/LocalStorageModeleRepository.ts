import { useStore } from "../../lib/store";
import type { ModeleRepository } from "../ModeleRepository";
import { modeleNomSchema, parseOrThrow, storedModeleSchema, warnIfInvalid } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

export class LocalStorageModeleRepository implements ModeleRepository {
  list() {
    const modeles = useStore.getState().modeles;
    warnIfInvalid(storedModeleSchema, modeles, "ModeleRepository.list");
    return modeles;
  }

  get(id: string) {
    return useStore.getState().getModele(id);
  }

  // Mutations asynchrones (corr. R, Phase 7A) — voir LocalStorageClientRepository.
  async add(): Promise<string> {
    return useStore.getState().addModele();
  }

  async setNom(id: string, nom: string): Promise<void> {
    const parsed = parseOrThrow(modeleNomSchema, nom, "ModeleRepository.setNom");
    useStore.getState().setModeleNom(id, parsed);
  }

  async remove(id: string): Promise<void> {
    useStore.getState().removeModele(id);
  }

  async removeMany(ids: string[]): Promise<void> {
    useStore.getState().removeModeles(ids);
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("modeles", listener);
  }
}
