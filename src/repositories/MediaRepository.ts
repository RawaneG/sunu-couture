import type { TissuPhoto, VoiceNote } from "../lib/types";
import type { ObservableRepositoryStatus } from "./RepositoryStatus";

/** Photos/vocal/signature attachés à une fiche, et photos attachées à un
 * modèle. Phase 8A déplace `voiceNote`/`signature` de fiche ici — ce ne sont
 * plus de simples champs écrits via `FicheRepository.setInfo()` (voir
 * `FicheDetail.tsx`) : côté cloud, ils vivent dans `public.media_assets`
 * (`type='voice_note'`/`type='signature'`), au même titre que les photos
 * tissu (`type='fabric_photo'`), jamais dans `fiches.metadata`. `Fiche.
 * voiceNote`/`Fiche.tissuPhotos`/`Fiche.signature` restent dans le modèle
 * domaine pour compatibilité locale/legacy, mais deviennent NON AUTORITATIFS
 * pour l'UI média dès qu'un Repository média cloud existe (voir le
 * commentaire de tête de `mappers/fiche.ts`) — l'écran lit ce Repository,
 * jamais `Fiche.tissuPhotos`/`voiceNote`/`signature` directement.
 *
 * Médias MODÈLE (`listModelePhotos`/`listModelePatronPhotos`/...) restent
 * inchangés ici pour la Phase 8B — Phase 8A ne les implémente PAS
 * réellement côté cloud (voir `SupabaseMediaRepository`).
 *
 * Lectures synchrones, mutations asynchrones (corr. R, Phase 7A). Backend
 * local : `getStatus()` absent → toujours "ready" immédiatement (aucune
 * hydratation réseau). Backend cloud (Phase 8A) : `loading` puis
 * `ready`/`error`, comme les autres Repository Phase 7A/7B. */
export interface MediaRepository extends ObservableRepositoryStatus {
  listFichePhotos(ficheId: string): TissuPhoto[];
  addFichePhoto(ficheId: string, dataUrl: string): Promise<void>;
  removeFichePhoto(ficheId: string, photoId: string): Promise<void>;

  getFicheVoiceNote(ficheId: string): VoiceNote | null;
  setFicheVoiceNote(ficheId: string, value: VoiceNote | null): Promise<void>;

  getFicheSignature(ficheId: string): string | null;
  setFicheSignature(ficheId: string, dataUrl: string | null): Promise<void>;

  listModelePhotos(modeleId: string): TissuPhoto[];
  addModelePhoto(modeleId: string, dataUrl: string): Promise<void>;
  removeModelePhoto(modeleId: string, photoId: string): Promise<void>;

  listModelePatronPhotos(modeleId: string): TissuPhoto[];
  addModelePatronPhoto(modeleId: string, dataUrl: string): Promise<void>;
  removeModelePatronPhoto(modeleId: string, photoId: string): Promise<void>;

  subscribe(listener: () => void): () => void;
}
