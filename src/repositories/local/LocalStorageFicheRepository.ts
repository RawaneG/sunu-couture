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

  add(input?: NewFicheInput): string {
    const parsed = parseOrThrow(newFicheInputSchema, input, "FicheRepository.add");
    return useStore.getState().addFiche(parsed);
  }

  setInfo(id: string, patch: FicheInfoPatch): void {
    const parsed = parseOrThrow(ficheInfoPatchSchema, patch, "FicheRepository.setInfo");
    useStore.getState().setFicheInfo(id, parsed);
  }

  setChamp(id: string, key: FicheChampKey, valeur: string): void {
    const parsedKey = parseOrThrow(ficheChampKeySchemaExport, key, "FicheRepository.setChamp(key)");
    const parsedValeur = parseOrThrow(champValeurSchema, valeur, "FicheRepository.setChamp(valeur)");
    useStore.getState().setFicheChamp(id, parsedKey, parsedValeur);
  }

  strikeChamp(id: string, key: FicheChampKey): void {
    useStore.getState().strikeFicheChamp(id, key);
  }

  restoreChamp(id: string, key: FicheChampKey): void {
    useStore.getState().restoreFicheChamp(id, key);
  }

  setStatus(id: string, status: OrderStatus): void {
    useStore.getState().setFicheStatus(id, status);
  }

  advance(id: string): void {
    useStore.getState().advanceFiche(id);
  }

  remove(id: string): void {
    useStore.getState().deleteFiche(id);
  }

  removeMany(ids: string[]): void {
    useStore.getState().deleteFiches(ids);
  }

  subscribe(listener: () => void): () => void {
    return useStore.subscribe((state, prevState) => {
      if (state.fiches !== prevState.fiches) listener();
    });
  }
}
