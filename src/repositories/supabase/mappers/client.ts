// DB row ↔ domaine `Client` — respecte D2/D3 (03-DECISIONS.md).
import type { Client } from "../../../lib/types";
import { colorSeedFor } from "../../../lib/store";
import type { NewClientInput } from "../../ClientRepository";
import { normalizePhoneSenegal } from "../../../lib/phone";
import type { ClientRow } from "../schemas";
import type { Database } from "../../../lib/supabase/database.types";

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];

/** DB row → domaine. `Client.photo` n'est JAMAIS lu depuis `clients` — la
 * photo client legacy est explicitement hors modèle SQL cible (D2). Absence
 * de `metadata.color_seed` → fallback déterministe calculé ICI, jamais
 * réécrit en base silencieusement (pas de fausse donnée persistée). */
export function mapClientRowToDomain(row: ClientRow): Client {
  const metadataColorSeed = row.metadata?.color_seed;
  const colorSeed = typeof metadataColorSeed === "string" && metadataColorSeed.length > 0
    ? metadataColorSeed
    : colorSeedFor(row.display_name || row.id);
  return {
    id: row.id,
    name: row.display_name,
    // D3 : affichage = phone_display si présent, sinon la forme E.164 canonique.
    phone: row.phone_display ?? row.phone_e164 ?? "",
    photo: null,
    colorSeed,
  };
}

/** `NewClientInput` (saisie brute, verbatim, D2) → payload d'insertion.
 * Ne découpe JAMAIS `name` en prénom/nom (D2 — aucune heuristique
 * irréversible). Téléphone normalisé selon D3 : un numéro sénégalais local
 * valide est préfixé `+221` ; un numéro déjà conforme E.164 est conservé tel
 * quel ; un numéro non reconnaissable ou absent → `phone_e164 = null`, la
 * saisie brute reste dans `phone_display` (jamais de valeur inventée). */
export function mapNewClientInputToInsert(input: NewClientInput, workshopId: string): ClientInsert {
  const trimmedPhone = input.phone.trim();
  const phoneE164 = trimmedPhone ? normalizePhoneSenegal(trimmedPhone) : null;
  return {
    workshop_id: workshopId,
    display_name: input.name, // verbatim — D2, jamais retraité
    phone_e164: phoneE164,
    phone_display: trimmedPhone ? trimmedPhone : null,
    metadata: {},
  };
}
