// Appel de l'Edge Function `provision-workshop`. Toujours utilisé en mode
// "sonde" (name: null) juste après connexion pour résoudre l'atelier
// existant SANS jamais en créer un nouveau ; rappelé avec un nom réel
// uniquement depuis l'écran `/connexion/atelier` (nouvel utilisateur).
//
// `supabase.functions.invoke()` attache automatiquement le JWT de la session
// courante dans l'en-tête `Authorization` — aucune manipulation manuelle ici.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import type { Database } from "../supabase/database.types";

type WorkshopRow = Database["public"]["Tables"]["workshops"]["Row"];

export interface Workshop {
  id: string;
  name: string;
  ownerId: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProvisionWorkshopResult =
  | { kind: "workshop"; workshop: Workshop }
  | { kind: "name_required" }
  | { kind: "error"; message: string };

function toWorkshop(row: WorkshopRow): Workshop {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const GENERIC_ERROR = "Une erreur est survenue. Réessaie plus tard.";

/**
 * `name = null` → mode sonde : retourne l'atelier existant, ou
 * `{kind:"name_required"}` si aucun n'existe (jamais de création).
 * `name = "..."` → tente de créer l'atelier avec ce nom (ignoré si un atelier
 * existe déjà pour cet utilisateur — idempotent côté serveur).
 */
export async function callProvisionWorkshop(name: string | null): Promise<ProvisionWorkshopResult> {
  const { data, error } = await supabase.functions.invoke<{ workshop: WorkshopRow }>("provision-workshop", {
    body: { name },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string; message?: string };
        if (body.error === "WORKSHOP_NAME_REQUIRED") {
          return { kind: "name_required" };
        }
        return { kind: "error", message: body.message ?? GENERIC_ERROR };
      } catch {
        return { kind: "error", message: GENERIC_ERROR };
      }
    }
    return { kind: "error", message: GENERIC_ERROR };
  }

  if (!data?.workshop) {
    return { kind: "error", message: GENERIC_ERROR };
  }
  return { kind: "workshop", workshop: toWorkshop(data.workshop) };
}
