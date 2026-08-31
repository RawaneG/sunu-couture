import { useStore } from "../../lib/store";
import type { MediaRepository } from "../MediaRepository";
import { dataUrlSchema, parseOrThrow } from "../schemas";
import { subscribeToSlice } from "./subscribeToSlice";

export class LocalStorageMediaRepository implements MediaRepository {
  listFichePhotos(ficheId: string) {
    return useStore.getState().fiches.find((f) => f.id === ficheId)?.tissuPhotos ?? [];
  }
  addFichePhoto(ficheId: string, dataUrl: string): void {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addFichePhoto");
    useStore.getState().addFicheTissuPhoto(ficheId, parsed);
  }
  removeFichePhoto(ficheId: string, photoId: string): void {
    useStore.getState().removeFicheTissuPhoto(ficheId, photoId);
  }

  listModelePhotos(modeleId: string) {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.photos ?? [];
  }
  addModelePhoto(modeleId: string, dataUrl: string): void {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addModelePhoto");
    useStore.getState().addModelePhoto(modeleId, parsed);
  }
  removeModelePhoto(modeleId: string, photoId: string): void {
    useStore.getState().removeModelePhoto(modeleId, photoId);
  }

  listModelePatronPhotos(modeleId: string) {
    return useStore.getState().modeles.find((m) => m.id === modeleId)?.patronPhotos ?? [];
  }
  addModelePatronPhoto(modeleId: string, dataUrl: string): void {
    const parsed = parseOrThrow(dataUrlSchema, dataUrl, "MediaRepository.addModelePatronPhoto");
    useStore.getState().addModelePatronPhoto(modeleId, parsed);
  }
  removeModelePatronPhoto(modeleId: string, photoId: string): void {
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
