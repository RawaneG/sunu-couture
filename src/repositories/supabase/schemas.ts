// Schémas Zod à la frontière RÉSEAU Supabase (Phase 7A, corr. R) — distincts
// de `src/repositories/schemas.ts` (frontière des ENTRÉES du Repository côté
// UI). Une row qui échoue ici est REJETÉE explicitement (voir
// `RemoteRowValidationError`) : elle ne remplace jamais un cache valide
// existant et ne devient jamais une valeur métier inventée.
import { z } from "zod";

export class RemoteRowValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];
  constructor(context: string, issues: z.core.$ZodIssue[]) {
    super(`${context} : ligne distante invalide`);
    this.name = "RemoteRowValidationError";
    this.issues = issues;
  }
}

export function parseRowOrThrow<T>(schema: z.ZodType<T>, row: unknown, context: string): T {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new RemoteRowValidationError(context, result.error.issues);
  }
  return result.data;
}

// ── clients ──────────────────────────────────────────────────────────────
export const clientRowSchema = z.object({
  id: z.string(),
  workshop_id: z.string(),
  display_name: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  nickname: z.string().nullable(),
  phone_e164: z.string().nullable(),
  phone_display: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type ClientRow = z.infer<typeof clientRowSchema>;

// ── carnets (lecture seule, Phase 7A) ───────────────────────────────────
export const carnetRowSchema = z.object({
  id: z.string(),
  workshop_id: z.string(),
  number: z.number().int(),
  status: z.enum(["active", "full", "archived"]),
  next_number: z.number().int(),
});
export type CarnetRow = z.infer<typeof carnetRowSchema>;

// ── fiches_view (lecture — inclut `is_late` dérivé) ─────────────────────
// Toutes les colonnes sont générées "nullable" par Supabase pour une VUE,
// même si elles ne le sont jamais en pratique pour une ligne réelle — d'où
// la revalidation stricte ici (id/workshop_id/carnet_id/number non nuls).
export const ficheViewRowSchema = z.object({
  id: z.string(),
  workshop_id: z.string(),
  carnet_id: z.string(),
  client_id: z.string().nullable(),
  number: z.number().int(),
  page_number: z.number().int(),
  slot_number: z.number().int(),
  state: z.enum(["active", "cancelled", "archived"]),
  status: z.enum(["received", "sewing", "ready", "delivered"]),
  measurements: z.unknown(),
  garment: z.string(),
  description: z.string().nullable(),
  fabric_notes: z.string().nullable(),
  quantity: z.number().int(),
  due_date: z.string().nullable(),
  total_price: z.number(),
  settled_at: z.string().nullable(),
  version: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  is_late: z.boolean(),
});
export type FicheViewRow = z.infer<typeof ficheViewRowSchema>;

// ── réponse `create-fiche-from-draft` (Phase 7B/9A) ─────────────────────
// La ligne renvoyée par l'Edge Function est une ligne BRUTE `public.fiches`
// (celle que `create_fiche_from_draft_api` retourne), PAS une ligne
// `fiches_view` — elle n'a donc pas `is_late` et ne doit JAMAIS être passée
// à `mapFicheRowToDomain` directement (corr. R §12, Phase 7B). On ne valide
// ici que le strict nécessaire pour extraire `id`/`workshop_id` (défense :
// vérifier que la fiche créée appartient bien à l'atelier attendu) — la
// fiche complète est ensuite relue via `getFicheById` (`fiches_view`),
// seule source pour construire un `Fiche` domaine (§13).
export const createFicheFromDraftResponseSchema = z.object({
  fiche: z.object({ id: z.string(), workshop_id: z.string() }).loose(),
});

// ── media_assets (Phase 8A — médias FICHE uniquement) ───────────────────
// `type` EXCLUT délibérément `'model_photo'` : `media_assets` ne porte que
// des médias de fiche (`fabric_photo`/`voice_note`/`signature`, corr. R) —
// les médias de modèle vivent dans `modele_medias` (Phase 8B), jamais ici.
// Une ligne `type='model_photo'` (ne devrait jamais exister ici) échoue donc
// cette validation et fait échouer tout le lot (atomique, corr. R §14/§15) —
// jamais mappée silencieusement.
export const ficheMediaTypeSchema = z.enum(["fabric_photo", "voice_note", "signature"]);
export type FicheMediaType = z.infer<typeof ficheMediaTypeSchema>;

export const mediaAssetRowSchema = z.object({
  id: z.string(),
  workshop_id: z.string(),
  fiche_id: z.string(),
  type: ficheMediaTypeSchema,
  storage_path: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type MediaAssetRow = z.infer<typeof mediaAssetRowSchema>;
