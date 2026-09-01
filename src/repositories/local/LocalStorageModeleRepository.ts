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

  add(): string {
    return useStore.getState().addModele();
  }

  setNom(id: string, nom: string): void {
    const parsed = parseOrThrow(modeleNomSchema, nom, "ModeleRepository.setNom");
    useStore.getState().setModeleNom(id, parsed);
  }

  remove(id: string): void {
    useStore.getState().removeModele(id);
  }

  removeMany(ids: string[]): void {
    useStore.getState().removeModeles(ids);
  }

  subscribe(listener: () => void): () => void {
    return subscribeToSlice("modeles", listener);
  }
}
