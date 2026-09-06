// DB row (`modeles`) ↔ domaine `Modele` — Phase 8B.
import type { Modele } from "../../../lib/types";
import type { Database } from "../../../lib/supabase/database.types";
import type { NewModeleInput } from "../../ModeleRepository";
import type { ModeleRow } from "../schemas";

type ModeleInsert = Database["public"]["Tables"]["modeles"]["Insert"];

/** DB row → domaine. `photos`/`patronPhotos` restent dans `Modele` pour
 * compatibilité locale/legacy, mais sont NON AUTORITATIFS côté cloud dès
 * qu'un Repository média cloud existe : `SupabaseModeleRepository` est
 * l'autorité pour les métadonnées du modèle (nom, dates), `MediaRepository`/
 * `modele_medias` est l'autorité pour ses photos/patrons — exactement la
 * même bascule que celle déjà faite pour `Fiche.tissuPhotos`/`voiceNote`/
 * `signature` en Phase 8A (voir `mappers/fiche.ts`, `MediaRepository.ts`).
 * Ne JOINDRE aucune URL signée ici — ce mapper ne connaît pas Storage. */
export function mapModeleRowToDomain(row: ModeleRow): Modele {
  return {
    id: row.id,
    nom: row.nom,
    photos: [],
    patronPhotos: [],
    createdAt: row.created_at,
  };
}

export function mapNewModeleInputToInsert(input: NewModeleInput, workshopId: string): ModeleInsert {
  return {
    workshop_id: workshopId,
    nom: input.nom,
  };
}
