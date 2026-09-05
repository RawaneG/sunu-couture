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
