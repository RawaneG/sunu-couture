import { useCallback, useSyncExternalStore } from "react";
import type { Client } from "../lib/types";
import type { Fiche } from "../lib/types";
import type { CarnetSlot } from "./CarnetRepository";
import type { Payment } from "./PaymentRepository";
import { useRepositories } from "./RepositoryProvider";

/** Liste réactive des clients — se re-rend uniquement quand la collection
 * change réellement (voir `ClientRepository.subscribe`). */
export function useClients(): Client[] {
  const { clients } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => clients.subscribe(onStoreChange), [clients]),
    () => clients.list(),
  );
}

export function useClient(id: string): Client | undefined {
  const { clients } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => clients.subscribe(onStoreChange), [clients]),
    () => clients.get(id),
  );
}

export function useFiches(): Fiche[] {
  const { fiches } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => fiches.subscribe(onStoreChange), [fiches]),
    () => fiches.list(),
  );
}

export function useFiche(id: string): Fiche | undefined {
  const { fiches } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => fiches.subscribe(onStoreChange), [fiches]),
    () => fiches.get(id),
  );
}

export function usePayments(ficheId: string): Payment[] {
  const { payments } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => payments.subscribe(onStoreChange), [payments]),
    () => payments.list(ficheId),
  );
}

export function useCarnet(): { activeCarnetNumero: number; nextSlot: CarnetSlot } {
  const { carnets } = useRepositories();
  const activeCarnetNumero = useSyncExternalStore(
    useCallback((onStoreChange) => carnets.subscribe(onStoreChange), [carnets]),
    () => carnets.getActiveCarnetNumero(),
  );
  const nextSlot = useSyncExternalStore(
    useCallback((onStoreChange) => carnets.subscribe(onStoreChange), [carnets]),
    () => carnets.getNextSlot(),
  );
  return { activeCarnetNumero, nextSlot };
}

// ── Ajouts justifiés (catalogue de modèles, cf. ModeleRepository.ts) ───────
export function useModeles() {
  const { modeles } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => modeles.subscribe(onStoreChange), [modeles]),
    () => modeles.list(),
  );
}

export function useModele(id: string) {
  const { modeles } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => modeles.subscribe(onStoreChange), [modeles]),
    () => modeles.get(id),
  );
}
