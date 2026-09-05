// Port étroit vers Supabase — exactement les requêtes dont la Phase 7A a
// besoin, sous forme de fonctions async simples (pas un chaînage fluide à
// mocker dans les tests). `createSupabaseGateway()` est le SEUL endroit qui
// touche le client `supabase-js` réel ; les Repository ne dépendent que de
// `SupabaseGateway`, injectable et testable sans `any` (corr. R §14).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";

export interface GatewayError {
  message: string;
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
}

function toGatewayError(error: { message: string } | null): GatewayError | null {
  return error ? { message: error.message } : null;
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
  };
}
