import { describe, expect, it, vi } from "vitest";
import { SupabaseFicheRepository } from "./SupabaseFicheRepository";
import { SupabaseCarnetRepository } from "./SupabaseCarnetRepository";
import type { IndexedDbCollectionCache } from "./cache/IndexedDbCache";
import type { SupabaseGateway } from "./gateway";
import type { Fiche } from "../../lib/types";

function ficheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    workshop_id: "w1",
    carnet_id: "carnet-1",
    client_id: null,
    number: 5,
    page_number: 2,
    slot_number: 1,
    state: "active",
    status: "received",
    measurements: { E: { valeur: "46", historique: [] } },
    garment: "Boubou",
    description: null,
    fabric_notes: null,
    quantity: 1,
    due_date: null,
    total_price: 25000,
    settled_at: null,
    version: 1,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    is_late: false,
    ...overrides,
  };
}

function emptyCache(): IndexedDbCollectionCache<Fiche> {
  return {
    readAll: vi.fn(async () => []),
    writeAll: vi.fn(async () => undefined),
  } as unknown as IndexedDbCollectionCache<Fiche>;
}

function fakeGateway(overrides: Partial<SupabaseGateway> = {}): SupabaseGateway {
  return {
    listActiveClients: vi.fn(async () => ({ data: [], error: null })),
    insertClient: vi.fn(async () => ({ data: null, error: null })),
    softDeleteClients: vi.fn(async () => ({ data: null, error: null })),
    listCarnets: vi.fn(async () => ({
      data: [{ id: "carnet-1", workshop_id: "w1", number: 3, status: "active", next_number: 6 }],
      error: null,
    })),
    listActiveFiches: vi.fn(async () => ({ data: [ficheRow()], error: null })),
    getFicheById: vi.fn(async () => ({ data: ficheRow(), error: null })),
    updateFiche: vi.fn(async () => ({ data: ficheRow(), error: null })),
    softDeleteFiches: vi.fn(async () => ({ data: null, error: null })),
    createFicheFromDraft: vi.fn(async () => ({
      data: { fiche: createdFicheRow() },
      error: null,
    })),
    listActiveMediaAssets: vi.fn(async () => ({ data: [], error: null })),
    insertMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    softDeleteMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    restoreMediaAsset: vi.fn(async () => ({ data: null, error: null })),
    uploadMediaObject: vi.fn(async () => ({ data: null, error: null })),
    createSignedMediaUrl: vi.fn(async () => ({ data: "https://example.test/signed", error: null })),
    ...overrides,
  };
}

/** Ligne BRUTE `public.fiches` telle que renvoyée par l'Edge Function
 * `create-fiche-from-draft` — délibérément DIFFÉRENTE de `ficheRow()`
 * (`fiches_view`, avec `is_late`) : ce n'est jamais cette forme qui est
 * mappée en `Fiche` domaine (corr. R §12), seuls `id`/`workshop_id` en sont
 * lus avant relecture via `getFicheById`. */
function createdFicheRow(overrides: Record<string, unknown> = {}) {
  return { id: "f-new", workshop_id: "w1", carnet_id: "carnet-1", number: 6, ...overrides };
}

async function setupRepo(gateway: SupabaseGateway) {
  const carnets = new SupabaseCarnetRepository({ gateway, workshopId: "w1" });
  const fiches = new SupabaseFicheRepository({ gateway, workshopId: "w1", carnets, cache: emptyCache() });
  await fiches.bootstrapped;
  return { carnets, fiches };
}

describe("SupabaseFicheRepository — construction", () => {
  it("refuse un workshopId vide", () => {
    const gateway = fakeGateway();
    const carnets = new SupabaseCarnetRepository({ gateway, workshopId: "w1" });
    expect(() => new SupabaseFicheRepository({ gateway, workshopId: "", carnets, cache: emptyCache() })).toThrow(
      /workshopId requis/,
    );
  });
});

describe("SupabaseFicheRepository — sécurité : aucun INSERT direct (corr. R §26/§38, Phase 7B)", () => {
  it("aucune méthode du SupabaseGateway ne permet un INSERT sur fiches — vérifié par la forme du contrat", () => {
    // Preuve structurelle : SupabaseGateway n'expose que list/get/update/softDelete
    // + createFicheFromDraft (Edge Function) pour les fiches, jamais un
    // "insertFiche" qui ferait un `.from("fiches").insert(...)`. Ce test échoue
    // à la compilation (pas à l'exécution) si une telle méthode était ajoutée
    // sans revue — il documente explicitement l'invariant attendu.
    const methods: (keyof SupabaseGateway)[] = [
      "listActiveFiches",
      "getFicheById",
      "updateFiche",
      "softDeleteFiches",
      "createFicheFromDraft",
    ];
    for (const m of methods) expect(typeof fakeGateway()[m]).toBe("function");
    expect((fakeGateway() as unknown as Record<string, unknown>).insertFiche).toBeUndefined();
  });
});

describe("SupabaseFicheRepository — création (Phase 7B, brouillon vide)", () => {
  it("un brouillon non significatif est rejeté AVANT tout appel réseau", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.add({})).rejects.toThrow(/brouillon vide/);
    expect(gateway.createFicheFromDraft).not.toHaveBeenCalled();
  });

  it("add() sans argument (équivalent historique) est aussi rejeté AVANT tout appel réseau", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.add()).rejects.toThrow(/brouillon vide/);
    expect(gateway.createFicheFromDraft).not.toHaveBeenCalled();
  });

  it("des chaînes blanches uniquement restent non significatives", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.add({ nom: "   ", telephone: "\t" })).rejects.toThrow(/brouillon vide/);
    expect(gateway.createFicheFromDraft).not.toHaveBeenCalled();
  });
});

describe("SupabaseFicheRepository — création (Phase 7B, succès simple)", () => {
  it("brouillon significatif : createFicheFromDraft appelé 1 fois, carnet rafraîchi, fiche relue et mise en cache, id retourné", async () => {
    const gateway = fakeGateway({
      getFicheById: vi.fn(async () => ({ data: ficheRow({ id: "f-new", garment: "Boubou" }), error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const id = await fiches.add({ clientId: "c1", nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", garment: "Boubou" });

    expect(id).toBe("f-new");
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.getFicheById).toHaveBeenCalledWith("w1", "f-new");
    expect(fiches.get("f-new")?.garment).toBe("Boubou");
  });

  it("le body exact envoyé à createFicheFromDraft ne contient aucun champ structurel serveur", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.add({ clientId: "c1", nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", garment: "Boubou", description: "Manches longues" });

    expect(gateway.createFicheFromDraft).toHaveBeenCalledWith(
      "w1",
      "c1",
      expect.objectContaining({
        garment: "Boubou",
        description: "Manches longues",
        measurements: expect.any(Object),
        metadata: { legacy_identity: { nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08" } },
      }),
    );
    const [, , payload] = (gateway.createFicheFromDraft as ReturnType<typeof vi.fn>).mock.calls[0];
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["numero", "carnetNumero", "carnet_id", "page_number", "slot_number", "workshop_id", "ownerId", "userId", "role"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("prefillChamps devient measurements[key] = { valeur, historique: [] }", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.add({ clientId: "c1", prefillChamps: { Cou: "42" } });

    expect(gateway.createFicheFromDraft).toHaveBeenCalledWith(
      "w1",
      "c1",
      expect.objectContaining({ measurements: expect.objectContaining({ Cou: { valeur: "42", historique: [] } }) }),
    );
  });

  it("un subscriber est notifié comme pour une mutation normale, et get(id) répond immédiatement après", async () => {
    const gateway = fakeGateway({
      getFicheById: vi.fn(async () => ({ data: ficheRow({ id: "f-new" }), error: null })),
    });
    const { fiches } = await setupRepo(gateway);
    const listener = vi.fn();
    fiches.subscribe(listener);

    const id = await fiches.add({ clientId: "c1", garment: "Boubou" });

    expect(listener).toHaveBeenCalled();
    expect(fiches.get(id)?.id).toBe(id);
  });
});

describe("SupabaseFicheRepository — création (Phase 7B, premier carnet / numérotation serveur)", () => {
  it("atelier sans carnet préalable : carnetNumero=1 résolu depuis la vraie ligne carnet après refresh, jamais un fallback", async () => {
    let carnetsCall = 0;
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({ data: [], error: null })),
      listCarnets: vi.fn(async () => {
        carnetsCall += 1;
        if (carnetsCall === 1) return { data: [], error: null }; // bootstrap : aucun carnet
        return { data: [{ id: "carnet-new", workshop_id: "w1", number: 1, status: "active", next_number: 2 }], error: null };
      }),
      createFicheFromDraft: vi.fn(async () => ({ data: { fiche: createdFicheRow({ id: "f-new", carnet_id: "carnet-new" }) }, error: null })),
      getFicheById: vi.fn(async () => ({ data: ficheRow({ id: "f-new", carnet_id: "carnet-new", number: 1 }), error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const id = await fiches.add({ garment: "Boubou" });

    expect(fiches.get(id)?.carnetNumero).toBe(1);
    expect(fiches.get(id)?.numero).toBe(1);
  });

  it("carnet #4 déjà actif, next_number=18 : le Repository apprend numero/carnetNumero de la relecture serveur, ne les calcule jamais", async () => {
    const gateway = fakeGateway({
      listCarnets: vi.fn(async () => ({
        data: [{ id: "carnet-4", workshop_id: "w1", number: 4, status: "active", next_number: 18 }],
        error: null,
      })),
      createFicheFromDraft: vi.fn(async () => ({ data: { fiche: createdFicheRow({ id: "f-new", carnet_id: "carnet-4" }) }, error: null })),
      getFicheById: vi.fn(async () => ({ data: ficheRow({ id: "f-new", carnet_id: "carnet-4", number: 18 }), error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const id = await fiches.add({ garment: "Boubou" });

    expect(fiches.get(id)?.numero).toBe(18);
    expect(fiches.get(id)?.carnetNumero).toBe(4);
  });
});

describe("SupabaseFicheRepository — création (Phase 7B, erreurs Edge structurées)", () => {
  it.each([
    ["empty_draft", 422],
    ["forbidden", 403],
    ["invalid_client", 400],
  ])("code=%s : aucune mutation cache, aucun getFicheById, aucun retry", async (code) => {
    const gateway = fakeGateway({
      createFicheFromDraft: vi.fn(async () => ({ data: null, error: { code, message: `erreur ${code}` } })),
    });
    const { fiches } = await setupRepo(gateway);

    await expect(fiches.add({ garment: "Boubou" })).rejects.toMatchObject({ code, message: `erreur ${code}` });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.getFicheById).not.toHaveBeenCalled();
    expect(fiches.list().some((f) => f.garment === "Boubou" && f.id !== "f1")).toBe(false);
  });

  it("préserve le message métier structuré (pas un message générique Supabase)", async () => {
    const gateway = fakeGateway({
      createFicheFromDraft: vi.fn(async () => ({ data: null, error: { code: "forbidden", message: "Accès refusé à cet atelier." } })),
    });
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.add({ garment: "Boubou" })).rejects.toThrow("Accès refusé à cet atelier.");
  });
});

describe("SupabaseFicheRepository — création réussie mais synchronisation locale incomplète (Phase 7B §18/§19)", () => {
  it("Edge SUCCESS + carnets.refresh() SUCCESS + getFicheById ERROR -> reject, id connu, aucun retry de création", async () => {
    const gateway = fakeGateway({
      getFicheById: vi.fn(async () => ({ data: null, error: { message: "réseau indisponible" } })),
    });
    const { fiches } = await setupRepo(gateway);

    const rejection = fiches.add({ garment: "Boubou" });
    await expect(rejection).rejects.toThrow(/relecture a échoué/);
    await rejection.catch((err: unknown) => {
      expect(err).toMatchObject({ ficheId: "f-new" });
    });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
  });

  it("Edge SUCCESS + carnets.refresh() ERROR -> reject explicite, aucun second create", async () => {
    let carnetsCall = 0;
    const gateway = fakeGateway({
      listCarnets: vi.fn(async () => {
        carnetsCall += 1;
        if (carnetsCall === 1) {
          return { data: [{ id: "carnet-1", workshop_id: "w1", number: 3, status: "active", next_number: 6 }], error: null };
        }
        return { data: null, error: { message: "réseau indisponible" } };
      }),
    });
    const { fiches } = await setupRepo(gateway);

    const rejection = fiches.add({ garment: "Boubou" });
    await expect(rejection).rejects.toThrow(/carnet n'a pas pu être synchronisé/);
    await rejection.catch((err: unknown) => {
      expect(err).toMatchObject({ ficheId: "f-new" });
    });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.getFicheById).not.toHaveBeenCalled();
  });

  it("la fiche créée pour un autre atelier que celui attendu est une création confirmée mal synchronisée, PAS une simple erreur générique", async () => {
    const gateway = fakeGateway({
      createFicheFromDraft: vi.fn(async () => ({ data: { fiche: createdFicheRow({ id: "f-new", workshop_id: "w-autre" }) }, error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const rejection = fiches.add({ garment: "Boubou" });
    await expect(rejection).rejects.toThrow(/atelier incohérent/);
    await rejection.catch((err: unknown) => {
      expect(err).toMatchObject({ name: "FicheCreatedButSyncIncompleteError", ficheId: "f-new" });
    });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.getFicheById).not.toHaveBeenCalled();
    expect(gateway.listCarnets).toHaveBeenCalledTimes(1); // uniquement le bootstrap — pas de refresh post-incohérence
  });

  it.each([
    ["objet vide", {}],
    ["fiche null", { fiche: null }],
    ["fiche sans id", { fiche: { workshop_id: "w1" } }],
    ["fiche sans workshop_id", { fiche: { id: "f-new" } }],
  ])("réponse Edge SUCCESS malformée (%s) : rejet post-création explicite, aucun retry, aucune étape suivante", async (_label, malformed) => {
    const gateway = fakeGateway({
      createFicheFromDraft: vi.fn(async () => ({ data: malformed, error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const rejection = fiches.add({ garment: "Boubou" });
    await expect(rejection).rejects.toThrow(/peut déjà exister/);
    await rejection.catch((err: unknown) => {
      expect(err).toMatchObject({ name: "FicheCreatedButResponseInvalidError" });
    });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.listCarnets).toHaveBeenCalledTimes(1); // uniquement le bootstrap
    expect(gateway.getFicheById).not.toHaveBeenCalled();
  });

  it("data === null (réponse Edge SUCCESS sans corps) : même traitement, aucun ficheId inventé", async () => {
    const gateway = fakeGateway({
      createFicheFromDraft: vi.fn(async () => ({ data: null, error: null })),
    });
    const { fiches } = await setupRepo(gateway);

    const rejection = fiches.add({ garment: "Boubou" });
    await expect(rejection).rejects.toThrow(/peut déjà exister/);
    await rejection.catch((err: unknown) => {
      expect(err).toMatchObject({ name: "FicheCreatedButResponseInvalidError" });
      expect((err as { ficheId?: unknown }).ficheId).toBeUndefined();
    });
    expect(gateway.createFicheFromDraft).toHaveBeenCalledTimes(1);
    expect(gateway.getFicheById).not.toHaveBeenCalled();
  });
});

describe("SupabaseFicheRepository — lecture (bootstrap, carnetNumero)", () => {
  it("attend l'hydratation des carnets avant de mapper les fiches — carnetNumero résolu, pas de fallback inventé", async () => {
    const { fiches } = await setupRepo(fakeGateway());
    const f = fiches.get("f1");
    expect(f?.carnetNumero).toBe(3); // vient réellement du carnet, pas un 1 par défaut
  });

  it("listByClient() filtre par clientId sur les fiches déjà chargées", async () => {
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({
        data: [ficheRow({ id: "f1", client_id: "c1" }), ficheRow({ id: "f2", client_id: "c2" })],
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    expect(fiches.listByClient("c1").map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("SupabaseFicheRepository — setInfo, colonnes autorisées (Phase 4)", () => {
  it("garment/description/price/dueDate/soldeLe déclenchent un UPDATE direct sur les bonnes colonnes", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.setInfo("f1", { garment: "Robe", description: "Longue", price: 30000, dueDate: "2026-04-01", soldeLe: "2026-03-20" });
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({
        garment: "Robe",
        description: "Longue",
        total_price: 30000,
        due_date: "2026-04-01",
        settled_at: "2026-03-20",
      }),
    );
  });

  it("le résultat de l'UPDATE remplace la fiche en cache (round-trip validé, pas un write optimiste)", async () => {
    const gateway = fakeGateway({
      updateFiche: vi.fn(async () => ({ data: ficheRow({ garment: "Robe (serveur)" }), error: null })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.setInfo("f1", { garment: "Robe" });
    expect(fiches.get("f1")?.garment).toBe("Robe (serveur)");
  });
});

describe("SupabaseFicheRepository — setInfo, champs interdits (corr. R §26/§27/§31)", () => {
  it("clientId : refuse explicitement (Phase 4 n'accorde aucun GRANT UPDATE dessus)", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.setInfo("f1", { clientId: "c2" })).rejects.toThrow(/clientId/);
    expect(gateway.updateFiche).not.toHaveBeenCalled();
  });

  it("voiceNote : refuse explicitement (Phase 8A, pas de faux succès)", async () => {
    const { fiches } = await setupRepo(fakeGateway());
    await expect(fiches.setInfo("f1", { voiceNote: null })).rejects.toThrow(/voiceNote/);
  });

  it("signature : refuse explicitement (Phase 8A, pas de faux succès)", async () => {
    const { fiches } = await setupRepo(fakeGateway());
    await expect(fiches.setInfo("f1", { signature: "data:..." })).rejects.toThrow(/signature/);
  });

  it("avance : refuse explicitement (Phase 11A, pas de faux succès)", async () => {
    const { fiches } = await setupRepo(fakeGateway());
    await expect(fiches.setInfo("f1", { avance: 5000 })).rejects.toThrow(/avance/);
  });
});

describe("SupabaseFicheRepository — setInfo, identité (metadata.legacy_identity)", () => {
  it("nom/prenom/telephone fusionnent dans metadata SANS écraser les autres clés existantes", async () => {
    const gateway = fakeGateway({
      getFicheById: vi.fn(async () => ({
        data: ficheRow({ metadata: { fabric_color: "#ff0000", legacy_identity: { nom: "Ancien" } } }),
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.setInfo("f1", { nom: "Diouf", prenom: "Awa" });
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          fabric_color: "#ff0000", // conservé, pas écrasé
          legacy_identity: { nom: "Diouf", prenom: "Awa" },
        }),
      }),
    );
  });

  it("fabricColor fusionne metadata.fabric_color sans toucher à legacy_identity", async () => {
    const gateway = fakeGateway({
      getFicheById: vi.fn(async () => ({
        data: ficheRow({ metadata: { legacy_identity: { nom: "Diouf" } } }),
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.setInfo("f1", { fabricColor: "#00ff00" });
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({
        metadata: expect.objectContaining({ fabric_color: "#00ff00", legacy_identity: { nom: "Diouf" } }),
      }),
    );
  });
});

describe("SupabaseFicheRepository — measurements (setChamp/strikeChamp/restoreChamp)", () => {
  it("setChamp() pousse l'ancienne valeur dans l'historique avant de remplacer", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway); // f1.champs.E = { valeur: "46", historique: [] }
    await fiches.setChamp("f1", "E", "48");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({ measurements: expect.objectContaining({ E: { valeur: "48", historique: ["46"] } }) }),
    );
  });

  it("setChamp('tissusDeposes', …) met À JOUR fabric_notes DANS LA MÊME mutation (corr. R §9)", async () => {
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({
        data: [ficheRow({ fabric_notes: null, measurements: { tissusDeposes: { valeur: "", historique: [] } } })],
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.setChamp("f1", "tissusDeposes", "Wax bleu");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({
        measurements: expect.objectContaining({ tissusDeposes: { valeur: "Wax bleu", historique: [] } }),
        fabric_notes: "Wax bleu",
      }),
    );
  });

  it("strikeChamp('tissusDeposes') vide aussi fabric_notes (null, pas une chaîne vide)", async () => {
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({
        data: [ficheRow({ fabric_notes: "Wax bleu", measurements: { tissusDeposes: { valeur: "Wax bleu", historique: [] } } })],
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.strikeChamp("f1", "tissusDeposes");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({ fabric_notes: null }),
    );
  });

  it("setChamp() sur une AUTRE clé que 'tissusDeposes' ne touche jamais fabric_notes", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.setChamp("f1", "E", "48");
    const call = (gateway.updateFiche as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(call).not.toHaveProperty("fabric_notes");
  });

  it("setChamp() avec la même valeur ne modifie pas l'historique", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.setChamp("f1", "E", "46");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({ measurements: expect.objectContaining({ E: { valeur: "46", historique: [] } }) }),
    );
  });

  it("strikeChamp() vide la valeur en conservant l'historique", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.strikeChamp("f1", "E");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({ measurements: expect.objectContaining({ E: { valeur: "", historique: ["46"] } }) }),
    );
  });

  it("restoreChamp() revient à la dernière valeur de l'historique", async () => {
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({
        data: [ficheRow({ measurements: { E: { valeur: "48", historique: ["46"] } } })],
        error: null,
      })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.restoreChamp("f1", "E");
    expect(gateway.updateFiche).toHaveBeenCalledWith(
      "w1",
      "f1",
      expect.objectContaining({ measurements: expect.objectContaining({ E: { valeur: "46", historique: [] } }) }),
    );
  });

  it("throws de façon contrôlée si la fiche n'est pas dans le cache (jamais un merge à l'aveugle)", async () => {
    const { fiches } = await setupRepo(fakeGateway());
    await expect(fiches.setChamp("f-inconnue", "E", "48")).rejects.toThrow(/absente du cache/);
  });
});

describe("SupabaseFicheRepository — setStatus / advance", () => {
  it("setStatus() mappe le statut domaine vers le statut cloud", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.setStatus("f1", "couture");
    expect(gateway.updateFiche).toHaveBeenCalledWith("w1", "f1", { status: "sewing" });
  });

  it("advance() fait progresser d'une étape (recu → couture)", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway); // status initial: received → recu
    await fiches.advance("f1");
    expect(gateway.updateFiche).toHaveBeenCalledWith("w1", "f1", { status: "sewing" });
  });

  it("advance() reste sur 'livre' au-delà de la dernière étape", async () => {
    const gateway = fakeGateway({
      listActiveFiches: vi.fn(async () => ({ data: [ficheRow({ status: "delivered" })], error: null })),
    });
    const { fiches } = await setupRepo(gateway);
    await fiches.advance("f1");
    expect(gateway.updateFiche).toHaveBeenCalledWith("w1", "f1", { status: "delivered" });
  });
});

describe("SupabaseFicheRepository — suppression (soft delete)", () => {
  it("remove() appelle softDeleteFiches puis retire la fiche du cache local", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await fiches.remove("f1");
    expect(gateway.softDeleteFiches).toHaveBeenCalledWith("w1", ["f1"]);
    expect(fiches.get("f1")).toBeUndefined();
  });

  it("removeMany() propage une erreur serveur sans supprimer localement", async () => {
    const gateway = fakeGateway({ softDeleteFiches: vi.fn(async () => ({ data: null, error: { message: "refus" } })) });
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.removeMany(["f1"])).rejects.toThrow("refus");
    expect(fiches.get("f1")).toBeDefined();
  });
});
