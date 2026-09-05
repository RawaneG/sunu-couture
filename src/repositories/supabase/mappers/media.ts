// DB row (`media_assets`) ↔ domaine (`TissuPhoto`/`VoiceNote`/signature) —
// Phase 8A. Contrairement aux autres mappers 7A, celui-ci prend l'URL
// SIGNÉE en paramètre séparé (jamais persistée, voir `SupabaseMediaRepository`
// et corr. R §13) plutôt que de la lire depuis la ligne elle-même.
import type { TissuPhoto, VoiceNote } from "../../../lib/types";
import type { MediaAssetRow } from "../schemas";

/** `TissuPhoto.dataUrl` garde son nom historique pour éviter un refactor
 * produit — mais sa VALEUR change de nature selon le backend : une data URL
 * locale (`data:image/jpeg;base64,...`) en backend local, une URL HTTPS
 * signée éphémère (`https://.../object/sign/...`) en backend cloud. Les deux
 * sont directement utilisables comme `src` d'un `<img>`, ce qui est la seule
 * garantie que l'UI (`FabricPhotos.tsx`) exploite réellement. */
export function mapFabricPhotoRowToDomain(row: MediaAssetRow, signedUrl: string): TissuPhoto {
  return { id: row.id, dataUrl: signedUrl };
}

/** Une `voice_note` SANS durée fiable est une donnée incohérente — rejetée
 * (corr. R §16), jamais silencieusement ramenée à `0`. `recorded_at` retombe
 * sur `media_assets.created_at` uniquement s'il est absent de `metadata`
 * (jamais l'inverse : `metadata.recorded_at`, quand présent, fait foi — il
 * peut différer du moment de l'upload, ex. rejoué après une coupure réseau). */
export function mapVoiceNoteRowToDomain(row: MediaAssetRow, signedUrl: string): VoiceNote {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const duration = metadata.duration_seconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    throw new Error(
      `mapVoiceNoteRowToDomain: metadata.duration_seconds manquant ou invalide pour le média ${row.id} — ` +
        "une durée fiable est requise, jamais inventée (0 ou approximée).",
    );
  }
  const recordedAt = typeof metadata.recorded_at === "string" ? metadata.recorded_at : row.created_at;
  return { url: signedUrl, duration, recordedAt };
}

export function mapSignatureRowToDomain(_row: MediaAssetRow, signedUrl: string): string {
  return signedUrl;
}
