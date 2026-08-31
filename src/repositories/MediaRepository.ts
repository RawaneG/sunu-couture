import type { TissuPhoto } from "../lib/types";

/** Photos attachées à une fiche ou à un modèle — les seules collections de
 * médias qui existent réellement aujourd'hui (`Fiche.tissuPhotos`,
 * `Modele.photos`, `Modele.patronPhotos`). `voiceNote`/`signature` restent de
 * simples champs de la fiche, gérés par `FicheRepository.setInfo()` — ce ne
 * sont pas des collections, les déplacer ici serait artificiel. */
export interface MediaRepository {
  listFichePhotos(ficheId: string): TissuPhoto[];
  addFichePhoto(ficheId: string, dataUrl: string): void;
  removeFichePhoto(ficheId: string, photoId: string): void;

  listModelePhotos(modeleId: string): TissuPhoto[];
  addModelePhoto(modeleId: string, dataUrl: string): void;
  removeModelePhoto(modeleId: string, photoId: string): void;

  listModelePatronPhotos(modeleId: string): TissuPhoto[];
  addModelePatronPhoto(modeleId: string, dataUrl: string): void;
  removeModelePatronPhoto(modeleId: string, photoId: string): void;

  subscribe(listener: () => void): () => void;
}
