import { useStore } from "../../lib/store";
import type { TissuPhoto, VoiceNote } from "../../lib/types";
import type { MediaRepository } from "../MediaRepository";
import { dataUrlSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

/** Référence STABLE (jamais un `[]` littéral recréé à chaque appel) —
 * `useFicheMedia()` (Phase 8A, `hooks.ts`) compare les résultats de
 * `listFichePhotos()` PAR RÉFÉRENCE pour décider si le snapshot
 * `useSyncExternalStore` a changé. Une fiche/un modèle introuvable (ex.
 * juste supprimé) doit renvoyer TOUJOURS la même référence vide, sinon
 * chaque appel de `getSnapshot()` verrait une collection "différente" et
 * déclencherait une boucle de rendu infinie (React : "Maximum update depth
 * exceeded") — observé réellement en supprimant une fiche depuis
 * `FicheDetail` avant ce correctif. */
const EMPTY_PHOTOS: TissuPhoto[] = [];

export class LocalStorageMediaRepository implements MediaRepository {
  // Aucune hydratation réseau — `getStatus()` volontairement absente
  // (contrat `ObservableRepositoryStatus` : absence ⇒ "ready" immédiat,
  // voir `useFicheMedia`/`hooks.ts`).

  listFichePhotos(ficheId: string): TissuPhoto[] {
    return useStore.getState().fiches.find((f) => f.id === ficheId)?.tissuPhotos ?? EMPTY_PHOTOS;
  }
  // Mutations asynchrones (corr. R, Phase 7A) — voir LocalStorageClientRepository.
  async addFichePhoto(ficheId: string, dataUrl: string): Promise<void> {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addFichePhoto");
    useStore.getState().addFicheTissuPhoto(ficheId, parsed);
  }
  async removeFichePhoto(ficheId: string, photoId: string): Promise<void> {
    useStore.getState().removeFicheTissuPhoto(ficheId, photoId);
  }

  // Phase 8A — déplacés depuis `FicheDetail`/`FicheRepository.setInfo()` :
  // même stockage local (`fiches[].voiceNote`/`signature`), aucun changement
  // de format `localStorage`, aucune migration legacy (§7).
  getFicheVoiceNote(ficheId: string): VoiceNote | null {
    return useStore.getState().fiches.find((f) => f.id === ficheId)?.voiceNote ?? null;
  }
  async setFicheVoiceNote(ficheId: string, value: VoiceNote | null): Promise<void> {
    useStore.getState().setFicheInfo(ficheId, { voiceNote: value });
  }

  getFicheSignature(ficheId: string): string | null {
    return useStore.getState().fiches.find((f) => f.id === ficheId)?.signature ?? null;
  }
  async setFicheSignature(ficheId: string, dataUrl: string | null): Promise<void> {
    useStore.getState().setFicheInfo(ficheId, { signature: dataUrl });
  }

  listModelePhotos(modeleId: string): TissuPhoto[] {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.photos ?? EMPTY_PHOTOS;
  }
  async addModelePhoto(modeleId: string, dataUrl: string): Promise<void> {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addModelePhoto");
    useStore.getState().addModelePhoto(modeleId, parsed);
  }
  async removeModelePhoto(modeleId: string, photoId: string): Promise<void> {
    useStore.getState().removeModelePhoto(modeleId, photoId);
  }

  listModelePatronPhotos(modeleId: string): TissuPhoto[] {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.patronPhotos ?? EMPTY_PHOTOS;
  }
  async addModelePatronPhoto(modeleId: string, dataUrl: string): Promise<void> {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addModelePatronPhoto");
    useStore.getState().addModelePatronPhoto(modeleId, parsed);
  }
  async removeModelePatronPhoto(modeleId: string, photoId: string): Promise<void> {
    useStore.getState().removeModelePatronPhoto(modeleId, photoId);
  }

  subscribe(listener: () => void): () => void {
    const unsubFiches = subscribeToSlice("fiches", listener);
    const unsubModeles = subscribeToSlice("modeles", listener);
    return () => {
      unsubFiches();
      unsubModeles();
    };
  }
}
