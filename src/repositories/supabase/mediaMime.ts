// Normalisation MIME pour le bucket Storage `media` (Phase 8A, corr. R §27).
// Un navigateur peut fournir un MIME AVEC paramètres (ex.
// `audio/webm;codecs=opus`) — le bucket restreint ses MIME autorisés à la
// forme SANS paramètres (`audio/webm`), le codec étant conservé séparément
// dans `metadata.codec` (jamais perdu, jamais fusionné dans la colonne
// `mime_type`).
export const ALLOWED_MEDIA_BUCKET_MIME_TYPES = ["image/jpeg", "image/png", "audio/webm", "audio/mp4", "audio/ogg"] as const;
export type AllowedMediaBucketMimeType = (typeof ALLOWED_MEDIA_BUCKET_MIME_TYPES)[number];

export interface NormalizedMediaMime {
  bucketMime: string;
  codec: string | null;
}

export function normalizeMediaMime(rawMime: string): NormalizedMediaMime {
  const [base, ...params] = rawMime.split(";").map((s) => s.trim());
  const codecParam = params.find((p) => p.toLowerCase().startsWith("codecs="));
  const codec = codecParam ? codecParam.slice("codecs=".length).replace(/^["']|["']$/g, "") || null : null;
  return { bucketMime: base, codec };
}

export function isAllowedMediaBucketMime(bucketMime: string): bucketMime is AllowedMediaBucketMimeType {
  return (ALLOWED_MEDIA_BUCKET_MIME_TYPES as readonly string[]).includes(bucketMime);
}

// Phase 8B — un média MODÈLE n'accepte que des images, même si le bucket
// (partagé avec les médias FICHE) autorise aussi l'audio pour la voix (§38) :
// un vocal/patron audio n'a pas de sens pour une photo de modèle ou un
// patron de coupe. Restriction applicative, PAS une restriction du bucket
// lui-même (qui reste commun aux deux domaines).
export const ALLOWED_MODELE_MEDIA_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export type AllowedModeleMediaMimeType = (typeof ALLOWED_MODELE_MEDIA_MIME_TYPES)[number];

export function isAllowedModeleMediaMime(bucketMime: string): bucketMime is AllowedModeleMediaMimeType {
  return (ALLOWED_MODELE_MEDIA_MIME_TYPES as readonly string[]).includes(bucketMime);
}
