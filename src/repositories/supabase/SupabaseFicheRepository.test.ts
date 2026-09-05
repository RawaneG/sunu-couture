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
    ...overrides,
  };
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

describe("SupabaseFicheRepository — sécurité : aucune création cloud (corr. R §26/§38)", () => {
  it("add() n'est pas implémentée : rejette systématiquement, sans jamais appeler le gateway", async () => {
    const gateway = fakeGateway();
    const { fiches } = await setupRepo(gateway);
    await expect(fiches.add()).rejects.toThrow(/create-fiche-from-draft/);
    // Aucune des méthodes du gateway pouvant créer une ligne n'a été appelée
    // par add() lui-même (seul le bootstrap a pu appeler listActiveFiches).
    expect(gateway.insertClient).not.toHaveBeenCalled();
    expect(gateway.updateFiche).not.toHaveBeenCalled();
  });

  it("aucune méthode du SupabaseGateway ne permet un INSERT sur fiches — vérifié par la forme du contrat", () => {
    // Preuve structurelle : SupabaseGateway n'expose que list/get/update/softDelete
    // pour les fiches, jamais un "insertFiche". Ce test échoue à la compilation
    // (pas à l'exécution) si une telle méthode était ajoutée sans revue — il
    // documente explicitement l'invariant attendu.
    const methods: (keyof SupabaseGateway)[] = [
      "listActiveFiches",
      "getFicheById",
      "updateFiche",
      "softDeleteFiches",
    ];
    for (const m of methods) expect(typeof fakeGateway()[m]).toBe("function");
    expect((fakeGateway() as unknown as Record<string, unknown>).insertFiche).toBeUndefined();
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
