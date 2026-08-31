// Schémas de validation Zod — appliqués aux FRONTIÈRES du Repository (entrées
// des méthodes d'écriture), jamais comme un remplacement des modèles métier
// existants (`src/lib/types.ts` reste la source de vérité des formes). En cas
// d'échec de validation d'une ENTRÉE, la méthode lève une
// `RepositoryValidationError` structurée et testable — jamais une correction
// silencieuse de la valeur fournie.
//
// Pour les données déjà PERSISTÉES (lecture), voir `assertNoSilentDrop()` :
// une donnée locale invalide n'est jamais supprimée ni corrigée en silence —
// elle est renvoyée telle quelle par `list()`/`get()`, avec un simple
// avertissement console pour la visibilité (voir chaque Local*Repository).
import { z } from "zod";
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "../lib/types";

export class RepositoryValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];
  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "RepositoryValidationError";
    this.issues = issues;
  }
}

/** Valide `input` avec `schema` ; lève `RepositoryValidationError` (jamais une
 * correction silencieuse) si `input` ne correspond pas à la forme attendue. */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, context: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RepositoryValidationError(`${context} : entrée invalide`, result.error.issues);
  }
  return result.data;
}

const ficheChampKeySchema = z.enum([...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]);

export const newClientInputSchema = z.object({
  name: z.string(),
  phone: z.string(),
  photo: z.string().nullable(),
});
export type NewClientInputParsed = z.infer<typeof newClientInputSchema>;

export const newFicheInputSchema = z
  .object({
    clientId: z.string().nullable().optional(),
    nom: z.string().optional(),
    prenom: z.string().optional(),
    telephone: z.string().optional(),
    prefillChamps: z.partialRecord(ficheChampKeySchema, z.string()).optional(),
  })
  .optional();
export type NewFicheInputParsed = z.infer<typeof newFicheInputSchema>;

export const ficheInfoPatchSchema = z
  .object({
    nom: z.string(),
    prenom: z.string(),
    telephone: z.string(),
    clientId: z.string().nullable(),
    garment: z.string(),
    description: z.string().nullable(),
    fabricColor: z.string(),
    voiceNote: z
      .object({ url: z.string(), duration: z.number(), recordedAt: z.string() })
      .nullable(),
    dueDate: z.string().nullable(),
    price: z.number(),
    avance: z.number(),
    signature: z.string().nullable(),
    soldeLe: z.string().nullable(),
  })
  .partial();
export type FicheInfoPatchParsed = z.infer<typeof ficheInfoPatchSchema>;

export const ficheChampKeySchemaExport = ficheChampKeySchema;
export const champValeurSchema = z.string();

export const amountSchema = z.number().int().min(0);

export const modeleNomSchema = z.string();

export const dataUrlSchema = z.string().min(1);

// ── Schémas de LECTURE (données déjà persistées) ────────────────────────────
// Utilisés uniquement pour DÉTECTER une forme inattendue et la SIGNALER
// (console.warn) — jamais pour supprimer ou corriger silencieusement une
// donnée locale invalide. `list()`/`get()` renvoient toujours la donnée brute
// telle que stockée, que la validation passe ou non.
const tissuPhotoSchema = z.object({ id: z.string(), dataUrl: z.string() });

export const storedClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  photo: z.string().nullable(),
  colorSeed: z.string(),
});

const ficheChampSchema = z.object({ valeur: z.string(), historique: z.array(z.string()) });

export const storedFicheSchema = z.object({
  id: z.string(),
  carnetNumero: z.number(),
  numero: z.number(),
  nom: z.string(),
  prenom: z.string(),
  telephone: z.string(),
  clientId: z.string().nullable(),
  champs: z.record(ficheChampKeySchema, ficheChampSchema),
  voiceNote: z.object({ url: z.string(), duration: z.number(), recordedAt: z.string() }).nullable(),
  tissuPhotos: z.array(tissuPhotoSchema),
  dueDate: z.string().nullable(),
  soldeLe: z.string().nullable(),
  signature: z.string().nullable(),
  price: z.number(),
  avance: z.number(),
  garment: z.string(),
  description: z.string().nullable(),
  fabricColor: z.string(),
  status: z.enum(["recu", "couture", "pret", "livre"]),
  late: z.boolean(),
  createdAt: z.string(),
});

export const storedModeleSchema = z.object({
  id: z.string(),
  nom: z.string(),
  photos: z.array(tissuPhotoSchema),
  patronPhotos: z.array(tissuPhotoSchema),
  createdAt: z.string(),
});

/** Vérifie chaque élément de `items` contre `schema` et journalise (une seule
 * fois par appel, pas par élément) un avertissement s'il en trouve — ne
 * modifie ni ne filtre jamais `items`. */
export function warnIfInvalid<T>(schema: z.ZodType<T>, items: readonly unknown[], context: string): void {
  const invalidCount = items.reduce<number>((count, item) => count + (schema.safeParse(item).success ? 0 : 1), 0);
  if (invalidCount > 0) {
    console.warn(`[Repository] ${context} : ${invalidCount} élément(s) local(aux) ne correspondent pas au schéma attendu — conservés tels quels, rien n'est supprimé.`);
  }
}
