import type { TissuPhoto } from "../lib/types";

/** Photos attachées à une fiche ou à un modèle — les seules collections de
 * médias qui existent réellement aujourd'hui (`Fiche.tissuPhotos`,
 * `Modele.photos`, `Modele.patronPhotos`). `voiceNote`/`signature` restent de
 * simples champs de la fiche, gérés par `FicheRepository.setInfo()` — ce ne
 * sont pas des collections, les déplacer ici serait artificiel.
 *
 * Lectures synchrones, mutations asynchrones (corr. R, Phase 7A) — voir
 * `ClientRepository`. Aucune implémentation cloud n'existe avant la Phase 8A
 * (médias fiche) / 8B (médias modèle) ; seule la signature change ici. */
export interface MediaRepository {
  listFichePhotos(ficheId: string): TissuPhoto[];
  addFichePhoto(ficheId: string, dataUrl: string): Promise<void>;
  removeFichePhoto(ficheId: string, photoId: string): Promise<void>;

  listModelePhotos(modeleId: string): TissuPhoto[];
  addModelePhoto(modeleId: string, dataUrl: string): Promise<void>;
  removeModelePhoto(modeleId: string, photoId: string): Promise<void>;

  listModelePatronPhotos(modeleId: string): TissuPhoto[];
  addModelePatronPhoto(modeleId: string, dataUrl: string): Promise<void>;
  removeModelePatronPhoto(modeleId: string, photoId: string): Promise<void>;

  subscribe(listener: () => void): () => void;
}
