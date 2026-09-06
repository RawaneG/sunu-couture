import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Client, Fiche, Modele, TissuPhoto, VoiceNote } from "../lib/types";
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

// ── Catalogue combiné (Phase 8B) ────────────────────────────────────────
// `ModeleRepository` (métadonnées : nom, dates) et `MediaRepository`
// (photos/patrons autoritatifs dès qu'un backend cloud existe, voir
// `mappers/modele.ts`) sont deux Repository DISTINCTS — l'UI catalogue a
// besoin des deux combinés en un seul `Modele[]` enrichi, sans jamais
// confondre "pas encore chargé" (loading) et "chargé et vide" (ready, 0
// modèle) — même exigence que `useFicheMedia` pour une fiche.
export type CatalogueModelesState =
  | { status: "loading" }
  | { status: "ready"; data: Modele[] }
  | { status: "error"; error: Error; data: Modele[] };

/** Combine `ModeleRepository.list()` (métadonnées) avec
 * `MediaRepository.listModelePhotos`/`listModelePatronPhotos` (médias
 * autoritatifs) en un seul tableau `Modele[]` enrichi — SANS jamais
 * reconstruire une référence différente si rien n'a changé (§63, même bug
 * de boucle de rendu infinie déjà corrigé en Phase 8A pour `useFicheMedia`) :
 * tant que la liste de base ET les collections média de CHAQUE modèle
 * gardent leur référence, le tableau composite renvoyé reste le même. */
export function useCatalogueModeles(): CatalogueModelesState {
  const { modeles: modeleRepository, media: mediaRepository } = useRepositories();
  const cacheRef = useRef<{ baseModeles: Modele[]; snapshot: Modele[] } | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubModeles = modeleRepository.subscribe(onStoreChange);
      const unsubMedia = mediaRepository.subscribe(onStoreChange);
      return () => {
        unsubModeles();
        unsubMedia();
      };
    },
    [modeleRepository, mediaRepository],
  );

  const getSnapshot = useCallback((): Modele[] => {
    const baseModeles = modeleRepository.list();
    const cached = cacheRef.current;
    if (cached && cached.baseModeles === baseModeles && cached.snapshot.length === baseModeles.length) {
      let changed = false;
      for (let i = 0; i < baseModeles.length; i++) {
        const base = baseModeles[i];
        const prev = cached.snapshot[i];
        const photos = mediaRepository.listModelePhotos(base.id);
        const patronPhotos = mediaRepository.listModelePatronPhotos(base.id);
        if (prev.id !== base.id || prev.nom !== base.nom || prev.photos !== photos || prev.patronPhotos !== patronPhotos) {
          changed = true;
          break;
        }
      }
      if (!changed) return cached.snapshot;
    }
    const snapshot = baseModeles.map((m) => ({
      ...m,
      photos: mediaRepository.listModelePhotos(m.id),
      patronPhotos: mediaRepository.listModelePatronPhotos(m.id),
    }));
    cacheRef.current = { baseModeles, snapshot };
    return snapshot;
  }, [modeleRepository, mediaRepository]);

  const data = useSyncExternalStore(subscribe, getSnapshot);
  const modeleStatus = useSyncExternalStore(subscribe, () => modeleRepository.getStatus?.() ?? READY_STATUS);
  const mediaStatus = useSyncExternalStore(subscribe, () => mediaRepository.getStatus?.() ?? READY_STATUS);

  if (modeleStatus.status === "loading" || mediaStatus.status === "loading") return { status: "loading" };
  if (modeleStatus.status === "error") return { status: "error", error: modeleStatus.error, data };
  if (mediaStatus.status === "error") return { status: "error", error: mediaStatus.error, data };
  return { status: "ready", data };
}

/** Un seul modèle enrichi, dérivé de `useCatalogueModeles()` — évite de
 * dupliquer la logique de composition/stabilité ci-dessus. `loading` ne
 * doit jamais être confondu avec "introuvable" (voir `ModeleDetail.tsx`). */
export function useCatalogueModele(id: string): EntityLoadState<Modele> {
  const catalogueState = useCatalogueModeles();
  if (catalogueState.status === "loading") return { status: "loading" };
  const data = catalogueState.data.find((m) => m.id === id);
  if (catalogueState.status === "error") return { status: "error", error: catalogueState.error, data };
  return { status: "ready", data };
}

// ── Médias fiche (Phase 8A) — photos/vocal/signature deviennent NON
// autoritatifs sur `Fiche` dès qu'un Repository média existe ; cette
// combinaison devient la seule source de vérité UI (voir `MediaRepository.ts`
// et `FicheDetail.tsx`). ───────────────────────────────────────────────────
export interface FicheMediaSnapshot {
  photos: TissuPhoto[];
  voiceNote: VoiceNote | null;
  signature: string | null;
}

/** Contrairement à `EntityLoadState<T>`, `data` n'est jamais `undefined` à
 * l'état `ready` : `getFicheVoiceNote`/`getFicheSignature`/`listFichePhotos`
 * renvoient toujours une valeur (éventuellement vide/null), jamais
 * `undefined` — il n'existe pas de distinction "pas encore hydraté" au
 * niveau d'UNE fiche ici (elle vient de `getStatus()`, global au
 * Repository). */
export type FicheMediaState =
  | { status: "loading" }
  | { status: "ready"; data: FicheMediaSnapshot }
  | { status: "error"; error: Error; data: FicheMediaSnapshot };

/** Combine 3 lectures indépendantes (`listFichePhotos`/`getFicheVoiceNote`/
 * `getFicheSignature`) en UN SEUL snapshot `useSyncExternalStore` — sans
 * jamais renvoyer une référence fraîche à chaque appel de `getSnapshot()` si
 * rien n'a changé (contrat de stabilité, voir `CloudCollectionStore.list()`
 * pour la même exigence). Chaque Repository garantit déjà que
 * `listFichePhotos`/`getFicheVoiceNote`/`getFicheSignature` renvoient une
 * référence STABLE pour une fiche donnée tant que ses médias n'ont pas
 * changé (local : Zustand préserve les sous-objets non touchés par un
 * `set()` immutable ; cloud : voir `SupabaseMediaRepository`) — ce hook se
 * contente de mémoïser la COMBINAISON des trois, via une comparaison par
 * référence sur chacune, pour ne produire un nouvel objet composite que si
 * l'une des trois a réellement changé. */
export function useFicheMedia(ficheId: string): FicheMediaState {
  const { media } = useRepositories();
  const cacheRef = useRef<{ photos: TissuPhoto[]; voiceNote: VoiceNote | null; signature: string | null; snapshot: FicheMediaSnapshot } | null>(null);

  const getSnapshot = useCallback((): FicheMediaSnapshot => {
    const photos = media.listFichePhotos(ficheId);
    const voiceNote = media.getFicheVoiceNote(ficheId);
    const signature = media.getFicheSignature(ficheId);
    const cached = cacheRef.current;
    if (cached && cached.photos === photos && cached.voiceNote === voiceNote && cached.signature === signature) {
      return cached.snapshot;
    }
    const snapshot: FicheMediaSnapshot = { photos, voiceNote, signature };
    cacheRef.current = { photos, voiceNote, signature, snapshot };
    return snapshot;
  }, [media, ficheId]);

  const data = useSyncExternalStore(
    useCallback((onStoreChange) => media.subscribe(onStoreChange), [media]),
    getSnapshot,
  );
  const repoStatus = useSyncExternalStore(
    useCallback((onStoreChange) => media.subscribe(onStoreChange), [media]),
    () => media.getStatus?.() ?? READY_STATUS,
  );
  if (repoStatus.status === "loading") return { status: "loading" };
  if (repoStatus.status === "error") return { status: "error", error: repoStatus.error, data };
  return { status: "ready", data };
}
