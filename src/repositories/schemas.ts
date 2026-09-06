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
import { PAYMENT_METHODS } from "./PaymentRepository";

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
    // Phase 9A — sans ces deux lignes, `garment`/`description` étaient
    // silencieusement perdus par ce schéma avant d'atteindre `store.addFiche()`,
    // qui pourtant sait déjà les appliquer (`input?.garment`/`input?.description`).
    garment: z.string().optional(),
    description: z.string().optional(),
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

// Phase 11A — un NOUVEAU versement (ledger `client_payments`) exige un
// entier strictement positif : `amountSchema` (0 accepté) reste réservé aux
// champs historiques (`price`/`avance` en tant que TOTAUX, qui peuvent
// légitimement être 0 avant toute saisie). `0`/négatif/décimal/`NaN`/
// `Infinity` sont tous rejetés (z.number().int() rejette déjà NaN/Infinity).
export const paymentAmountSchema = z.number().int().positive();

export const addPaymentInputSchema = z.object({
  ficheId: z.string(),
  amount: paymentAmountSchema,
  paidAt: z.string().nullable().optional(),
  method: z.enum(PAYMENT_METHODS).nullable().optional(),
  note: z.string().nullable().optional(),
});
export type AddPaymentInputParsed = z.infer<typeof addPaymentInputSchema>;

// Aligné sur la contrainte SQL réelle (Phase 8B, `public.modeles` :
// `length(btrim(nom)) BETWEEN 1 AND 200`) — la valeur elle-même n'est PAS
// trimmée ici (le schéma valide la longueur du nom TRIMMÉ, comme SQL, mais
// ne réécrit jamais la saisie du tailleur). `""`/`"   "`/>200 caractères
// (trimmés) sont invalides ; aucun fallback inventé ("Nouveau modèle",
// "Sans nom", "Modèle 1") ne doit jamais remplacer un rejet.
export const modeleNomSchema = z.string().refine((v) => {
  const trimmed = v.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
}, "nom de modèle invalide (1 à 200 caractères après suppression des espaces)");

export const newModeleInputSchema = z.object({
  nom: modeleNomSchema,
});
export type NewModeleInputParsed = z.infer<typeof newModeleInputSchema>;

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

// Phase 11A — cache IndexedDB du ledger `client_payments` côté cloud (voir
// `SupabasePaymentRepository`). Ne stocke jamais `FicheBalance` (vue
// autoritative, gardée en mémoire uniquement, jamais persistée).
export const storedPaymentSchema = z.object({
  id: z.string(),
  ficheId: z.string(),
  amount: z.number(),
  paidAt: z.string().nullable(),
  method: z.enum(PAYMENT_METHODS).nullable(),
  note: z.string().nullable(),
  recordedAt: z.string(),
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
