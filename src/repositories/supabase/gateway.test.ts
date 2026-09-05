// Phase 7B — teste `createSupabaseGateway().createFicheFromDraft()` : le
// SEUL point de ce module qui touche `@supabase/supabase-js` (voir tête de
// fichier de `gateway.ts`). Un `SupabaseClient` minimal est simulé — seule
// `client.functions.invoke` est nécessaire pour cette opération.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseGateway } from "./gateway";
import type { Database } from "../../lib/supabase/database.types";
import type { CreateFicheDraftPayload } from "../../lib/ficheDraft";

function fakeClient(invoke: ReturnType<typeof vi.fn>): SupabaseClient<Database> {
  return { functions: { invoke } } as unknown as SupabaseClient<Database>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const payload: CreateFicheDraftPayload = {
  garment: "Boubou",
  description: null,
  measurements: {},
  metadata: { legacy_identity: { nom: "", prenom: "", telephone: "" } },
};

describe("createSupabaseGateway().createFicheFromDraft — body exact", () => {
  it("invoque create-fiche-from-draft avec exactement { workshopId, clientId, fiche }", async () => {
    const invoke = vi.fn(async () => ({ data: { fiche: { id: "f1", workshop_id: "w1" } }, error: null }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    await gateway.createFicheFromDraft("w1", "c1", payload);

    expect(invoke).toHaveBeenCalledWith("create-fiche-from-draft", {
      body: { workshopId: "w1", clientId: "c1", fiche: payload },
    });
    const [, options] = invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    const serialized = JSON.stringify(options.body);
    for (const forbidden of ["ownerId", "userId", "role", "numero", "carnetNumero", "carnet_id", "page_number", "slot_number"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("clientId null est transmis tel quel, jamais omis ni transformé", async () => {
    const invoke = vi.fn(async () => ({ data: { fiche: { id: "f1", workshop_id: "w1" } }, error: null }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    await gateway.createFicheFromDraft("w1", null, payload);

    expect(invoke).toHaveBeenCalledWith("create-fiche-from-draft", {
      body: { workshopId: "w1", clientId: null, fiche: payload },
    });
  });

  it("succès : renvoie { data, error: null } directement depuis la réponse Edge", async () => {
    const invoke = vi.fn(async () => ({ data: { fiche: { id: "f1", workshop_id: "w1" } }, error: null }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    const result = await gateway.createFicheFromDraft("w1", "c1", payload);

    expect(result).toEqual({ data: { fiche: { id: "f1", workshop_id: "w1" } }, error: null });
  });
});

describe("createSupabaseGateway().createFicheFromDraft — normalisation d'erreur (corr. R §11)", () => {
  it("extrait { code, message } du corps JSON structuré d'une réponse non-2xx", async () => {
    const response = jsonResponse(403, { error: "forbidden", message: "Accès refusé à cet atelier." });
    const invoke = vi.fn(async () => ({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code" },
      response,
    }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    const result = await gateway.createFicheFromDraft("w1", "c1", payload);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: "forbidden", message: "Accès refusé à cet atelier." });
  });

  it("422 empty_draft : code et message préservés", async () => {
    const response = jsonResponse(422, { error: "empty_draft", message: "Le brouillon est vide." });
    const invoke = vi.fn(async () => ({ data: null, error: { message: "non-2xx" }, response }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    const result = await gateway.createFicheFromDraft("w1", null, payload);

    expect(result.error).toEqual({ code: "empty_draft", message: "Le brouillon est vide." });
  });

  it("erreur réseau/relais sans réponse structurée : repli sur error.message brut, jamais un plantage", async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: "Failed to fetch" }, response: undefined }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    const result = await gateway.createFicheFromDraft("w1", "c1", payload);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: "Failed to fetch" });
  });

  it("corps non-JSON en erreur : repli sur error.message, jamais un plantage de la normalisation", async () => {
    const response = new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } });
    const invoke = vi.fn(async () => ({ data: null, error: { message: "Edge Function returned a non-2xx status code" }, response }));
    const gateway = createSupabaseGateway(fakeClient(invoke));

    const result = await gateway.createFicheFromDraft("w1", "c1", payload);

    expect(result.error).toEqual({ message: "Edge Function returned a non-2xx status code" });
  });
});
