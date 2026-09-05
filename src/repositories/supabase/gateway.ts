// Port étroit vers Supabase — exactement les requêtes dont la Phase 7A a
// besoin, sous forme de fonctions async simples (pas un chaînage fluide à
// mocker dans les tests). `createSupabaseGateway()` est le SEUL endroit qui
// touche le client `supabase-js` réel ; les Repository ne dépendent que de
// `SupabaseGateway`, injectable et testable sans `any` (corr. R §14).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateFicheDraftPayload } from "../../lib/ficheDraft";

export interface GatewayError {
  message: string;
  /** Code métier structuré (`"unauthorized"`, `"forbidden"`, `"invalid_client"`,
   * `"empty_draft"`, ...) extrait du corps JSON `{error, message}` renvoyé par
   * une Edge Function (Phase 9A) — absent pour une erreur PostgREST classique
   * (`.from(...)`), qui n'a pas ce contrat. Permet au Repository appelant de
   * distinguer les cas sans coupler tout le code à `FunctionsHttpError`
   * (interne à `@supabase/supabase-js`, Phase 7B §11). */
  code?: string;
}

export interface GatewayResult<T> {
  data: T | null;
  error: GatewayError | null;
}

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type FicheUpdate = Database["public"]["Tables"]["fiches"]["Update"];

export interface SupabaseGateway {
  listActiveClients(workshopId: string): Promise<GatewayResult<unknown[]>>;
  insertClient(payload: ClientInsert): Promise<GatewayResult<unknown>>;
  softDeleteClients(workshopId: string, ids: string[]): Promise<GatewayResult<null>>;

  listCarnets(workshopId: string): Promise<GatewayResult<unknown[]>>;

  listActiveFiches(workshopId: string): Promise<GatewayResult<unknown[]>>;
  getFicheById(workshopId: string, id: string): Promise<GatewayResult<unknown>>;
  /** `patch` ne doit contenir QUE des colonnes accordées par la Phase 4 —
   * voir `SUPABASE_FICHE_UPDATABLE_COLUMNS` dans `SupabaseFicheRepository.ts`.
   * Ce gateway ne valide pas la liste lui-même : c'est la responsabilité du
   * Repository, qui seul connaît la sémantique métier de chaque champ. */
  updateFiche(workshopId: string, id: string, patch: FicheUpdate): Promise<GatewayResult<unknown>>;
  softDeleteFiches(workshopId: string, ids: string[]): Promise<GatewayResult<null>>;

  /** SEULE porte de création de fiche cloud (Phase 7B/9A) — appelle l'Edge
   * Function `create-fiche-from-draft`, jamais un `.from("fiches").insert(...)`
   * (Phase 4 n'accorde aucun GRANT INSERT au navigateur). `workshopId`/
   * `clientId`/`fiche` sont les SEULS champs envoyés — jamais `ownerId`/
   * `userId`/`role`/un JWT explicite : le SDK Supabase joint la session
   * courante lui-même, l'identité reste dérivée côté serveur du JWT vérifié
   * (voir `supabase/functions/create-fiche-from-draft/index.ts`). */
  createFicheFromDraft(workshopId: string, clientId: string | null, fiche: CreateFicheDraftPayload): Promise<GatewayResult<unknown>>;
}

function toGatewayError(error: { message: string } | null): GatewayError | null {
  return error ? { message: error.message } : null;
}

/** Les Edge Functions Phase 9A renvoient un corps JSON structuré
 * `{error: string, message: string}` sur toute réponse non-2xx — mais
 * `supabase-js` ne l'extrait pas lui-même (`error.message` reste un message
 * générique de type "Edge Function returned a non-2xx status code"). Ce
 * helper relit le `Response` brut (exposé par `functions.invoke()` via son
 * 3ᵉ champ `response`, y compris en cas d'erreur — pas besoin de `instanceof
 * FunctionsHttpError`) pour préserver le message métier réel. Une erreur
 * réseau/relais (pas de `response`, ou corps non-JSON) retombe sur
 * `error.message` brut, jamais un plantage de cette normalisation elle-même. */
async function toFunctionGatewayError(error: { message: string }, response?: Response): Promise<GatewayError> {
  if (response) {
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        const code = typeof record.error === "string" ? record.error : undefined;
        const message = typeof record.message === "string" ? record.message : undefined;
        if (code || message) return { code, message: message ?? error.message };
      }
    } catch {
      // Corps non-JSON, vide, ou déjà consommé — repli sur error.message.
    }
  }
  return { message: error.message };
}

/** Seule fonction de ce module qui touche `@supabase/supabase-js` — un
 * client injecté (jamais le singleton importé en dur), pour rester
 * testable et pour permettre un futur multi-instance si nécessaire. */
export function createSupabaseGateway(client: SupabaseClient<Database>): SupabaseGateway {
  return {
    async listActiveClients(workshopId) {
      const { data, error } = await client
        .from("clients")
        .select("*")
        .eq("workshop_id", workshopId)
        .is("deleted_at", null);
      return { data, error: toGatewayError(error) };
    },

    async insertClient(payload) {
      const { data, error } = await client.from("clients").insert(payload).select().single();
      return { data, error: toGatewayError(error) };
    },

    async softDeleteClients(workshopId, ids) {
      if (ids.length === 0) return { data: null, error: null };
      const { error } = await client
        .from("clients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("workshop_id", workshopId)
        .in("id", ids);
      return { data: null, error: toGatewayError(error) };
    },

    async listCarnets(workshopId) {
      const { data, error } = await client
        .from("carnets")
        .select("id, workshop_id, number, status, next_number")
        .eq("workshop_id", workshopId);
      return { data, error: toGatewayError(error) };
    },

    async listActiveFiches(workshopId) {
      const { data, error } = await client
        .from("fiches_view")
        .select("*")
        .eq("workshop_id", workshopId)
        .is("deleted_at", null);
      return { data, error: toGatewayError(error) };
    },

    async getFicheById(workshopId, id) {
      const { data, error } = await client
        .from("fiches_view")
        .select("*")
        .eq("workshop_id", workshopId)
        .eq("id", id)
        .single();
      return { data, error: toGatewayError(error) };
    },

    async updateFiche(workshopId, id, patch) {
      const { error } = await client.from("fiches").update(patch).eq("workshop_id", workshopId).eq("id", id);
      if (error) return { data: null, error: toGatewayError(error) };
      return this.getFicheById(workshopId, id);
    },

    async softDeleteFiches(workshopId, ids) {
      if (ids.length === 0) return { data: null, error: null };
      const { error } = await client
        .from("fiches")
        .update({ deleted_at: new Date().toISOString() })
        .eq("workshop_id", workshopId)
        .in("id", ids);
      return { data: null, error: toGatewayError(error) };
    },

    async createFicheFromDraft(workshopId, clientId, fiche) {
      const { data, error, response } = await client.functions.invoke("create-fiche-from-draft", {
        body: { workshopId, clientId, fiche },
      });
      if (error) return { data: null, error: await toFunctionGatewayError(error, response) };
      return { data, error: null };
    },
  };
}
