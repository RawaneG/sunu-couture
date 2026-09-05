import { useStore } from "../../lib/store";
import type { FicheChampKey, OrderStatus } from "../../lib/types";
import type { FicheInfoPatch, FicheRepository, NewFicheInput } from "../FicheRepository";
import {
  champValeurSchema,
  ficheChampKeySchemaExport,
  ficheInfoPatchSchema,
  newFicheInputSchema,
  parseOrThrow,
  storedFicheSchema,
  warnIfInvalid,
} from "../schemas";

export class LocalStorageFicheRepository implements FicheRepository {
  list() {
    const fiches = useStore.getState().fiches;
    warnIfInvalid(storedFicheSchema, fiches, "FicheRepository.list");
    return fiches;
  }

  get(id: string) {
    return useStore.getState().fiches.find((f) => f.id === id);
  }

  listByClient(clientId: string) {
    return useStore.getState().fichesForClient(clientId);
  }

  // Mutations asynchrones (corr. R, Phase 7A) — voir LocalStorageClientRepository.
  async add(input?: NewFicheInput): Promise<string> {
    const parsed = parseOrThrow(newFicheInputSchema, input, "FicheRepository.add");
    return useStore.getState().addFiche(parsed);
  }

  async setInfo(id: string, patch: FicheInfoPatch): Promise<void> {
    const parsed = parseOrThrow(ficheInfoPatchSchema, patch, "FicheRepository.setInfo");
    useStore.getState().setFicheInfo(id, parsed);
  }

  async setChamp(id: string, key: FicheChampKey, valeur: string): Promise<void> {
    const parsedKey = parseOrThrow(ficheChampKeySchemaExport, key, "FicheRepository.setChamp(key)");
    const parsedValeur = parseOrThrow(champValeurSchema, valeur, "FicheRepository.setChamp(valeur)");
    useStore.getState().setFicheChamp(id, parsedKey, parsedValeur);
  }

  async strikeChamp(id: string, key: FicheChampKey): Promise<void> {
    useStore.getState().strikeFicheChamp(id, key);
  }

  async restoreChamp(id: string, key: FicheChampKey): Promise<void> {
    useStore.getState().restoreFicheChamp(id, key);
  }

  async setStatus(id: string, status: OrderStatus): Promise<void> {
    useStore.getState().setFicheStatus(id, status);
  }

  async advance(id: string): Promise<void> {
    useStore.getState().advanceFiche(id);
  }

  async remove(id: string): Promise<void> {
    useStore.getState().deleteFiche(id);
  }

  async removeMany(ids: string[]): Promise<void> {
    useStore.getState().deleteFiches(ids);
  }

  subscribe(listener: () => void): () => void {
    return useStore.subscribe((state, prevState) => {
      if (state.fiches !== prevState.fiches) listener();
    });
  }
}
