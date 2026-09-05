import { useStore } from "../../lib/store";
import type { VoiceNote } from "../../lib/types";
import type { MediaRepository } from "../MediaRepository";
import { dataUrlSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

export class LocalStorageMediaRepository implements MediaRepository {
  // Aucune hydratation réseau — `getStatus()` volontairement absente
  // (contrat `ObservableRepositoryStatus` : absence ⇒ "ready" immédiat,
  // voir `useFicheMedia`/`hooks.ts`).

  listFichePhotos(ficheId: string) {
    return useStore.getState().fiches.find((f) => f.id === ficheId)?.tissuPhotos ?? [];
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

  listModelePhotos(modeleId: string) {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.photos ?? [];
  }
  async addModelePhoto(modeleId: string, dataUrl: string): Promise<void> {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addModelePhoto");
    useStore.getState().addModelePhoto(modeleId, parsed);
  }
  async removeModelePhoto(modeleId: string, photoId: string): Promise<void> {
    useStore.getState().removeModelePhoto(modeleId, photoId);
  }

  listModelePatronPhotos(modeleId: string) {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.patronPhotos ?? [];
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
