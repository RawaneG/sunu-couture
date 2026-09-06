import { useStore } from "../../lib/store";
import type { ModeleRepository, NewModeleInput } from "../ModeleRepository";
import { modeleNomSchema, newModeleInputSchema, parseOrThrow, storedModeleSchema, warnIfInvalid } from "../schemas";
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
  // Phase 8B : `nom` requis, validé ici (jamais un fallback inventé si vide).
  async add(input: NewModeleInput): Promise<string> {
    const parsed = parseOrThrow(newModeleInputSchema, input, "ModeleRepository.add");
    return useStore.getState().addModele(parsed.nom);
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
