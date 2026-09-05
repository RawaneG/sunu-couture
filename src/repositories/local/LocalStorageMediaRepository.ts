import { useStore } from "../../lib/store";
import type { MediaRepository } from "../MediaRepository";
import { dataUrlSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

export class LocalStorageMediaRepository implements MediaRepository {
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
