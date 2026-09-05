import { useCallback, useSyncExternalStore } from "react";
import type { Client, Fiche } from "../lib/types";
import type { CarnetSlot } from "./CarnetRepository";
import type { Payment } from "./PaymentRepository";
import { READY_STATUS } from "./RepositoryStatus";
import { useRepositories } from "./RepositoryProvider";

/** Résultat discriminé d'une lecture par id — distingue explicitement
 * "pas encore hydraté" (`loading`) de "hydraté et absent" (`ready` +
 * `data: undefined`), condition nécessaire pour qu'un Repository cloud
 * (Phase 7A+) hydratant son cache de façon asynchrone ne déclenche jamais
 * une redirection "introuvable" pendant le chargement (voir `FicheDetail`/
 * `ClientDetail`). Pour un Repository purement synchrone (`LocalStorage*`,
 * pas de `getStatus()`), l'état est toujours `ready` dès le premier rendu —
 * comportement strictement identique à avant cette phase. */
export type EntityLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T | undefined }
  | { status: "error"; error: Error; data?: T };

/** Liste réactive des clients — se re-rend uniquement quand la collection
 * change réellement (voir `ClientRepository.subscribe`). */
export function useClients(): Client[] {
  const { clients } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => clients.subscribe(onStoreChange), [clients]),
    () => clients.list(),
  );
}

export function useClient(id: string): EntityLoadState<Client> {
  const { clients } = useRepositories();
  const data = useSyncExternalStore(
    useCallback((onStoreChange) => clients.subscribe(onStoreChange), [clients]),
    () => clients.get(id),
  );
  const repoStatus = useSyncExternalStore(
    useCallback((onStoreChange) => clients.subscribe(onStoreChange), [clients]),
    () => clients.getStatus?.() ?? READY_STATUS,
  );
  if (repoStatus.status === "loading") return { status: "loading" };
  if (repoStatus.status === "error") return { status: "error", error: repoStatus.error, data };
  return { status: "ready", data };
}

export function useFiches(): Fiche[] {
  const { fiches } = useRepositories();
  return useSyncExternalStore(
    useCallback((onStoreChange) => fiches.subscribe(onStoreChange), [fiches]),
    () => fiches.list(),
  );
}

export function useFiche(id: string): EntityLoadState<Fiche> {
  const { fiches } = useRepositories();
  const data = useSyncExternalStore(
    useCallback((onStoreChange) => fiches.subscribe(onStoreChange), [fiches]),
    () => fiches.get(id),
  );
  const repoStatus = useSyncExternalStore(
    useCallback((onStoreChange) => fiches.subscribe(onStoreChange), [fiches]),
    () => fiches.getStatus?.() ?? READY_STATUS,
  );
  if (repoStatus.status === "loading") return { status: "loading" };
  if (repoStatus.status === "error") return { status: "error", error: repoStatus.error, data };
  return { status: "ready", data };
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
