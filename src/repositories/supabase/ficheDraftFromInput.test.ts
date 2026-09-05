import { describe, expect, it } from "vitest";
import { newFicheInputToDraft } from "./ficheDraftFromInput";
import { mapFicheDraftToCloudPayload } from "../../lib/ficheDraft";

describe("newFicheInputToDraft", () => {
  it("undefined -> brouillon vide (jamais un crash, jamais un champ inventé)", () => {
    const draft = newFicheInputToDraft(undefined);
    expect(draft.clientId).toBeNull();
    expect(draft.nom).toBe("");
    expect(draft.garment).toBe("");
  });

  it("reporte clientId/nom/prenom/telephone/garment/description tels quels", () => {
    const draft = newFicheInputToDraft({
      clientId: "c1",
      nom: "Diouf",
      prenom: "Awa",
      telephone: "77 512 44 08",
      garment: "Boubou",
      description: "Manches longues",
    });
    expect(draft).toMatchObject({
      clientId: "c1",
      nom: "Diouf",
      prenom: "Awa",
      telephone: "77 512 44 08",
      garment: "Boubou",
      description: "Manches longues",
    });
  });

  it("clientId absent -> null (jamais undefined dans le brouillon)", () => {
    const draft = newFicheInputToDraft({ nom: "Diouf" });
    expect(draft.clientId).toBeNull();
  });

  it("prefillChamps devient champs[key] = { valeur, historique: [] }", () => {
    const draft = newFicheInputToDraft({ prefillChamps: { Cou: "42", E: "50" } });
    expect(draft.champs.Cou).toEqual({ valeur: "42", historique: [] });
    expect(draft.champs.E).toEqual({ valeur: "50", historique: [] });
    // Les autres clés restent vides — pas de fabrication.
    expect(draft.champs.P).toEqual({ valeur: "", historique: [] });
  });

  it("le résultat reste directement compatible avec mapFicheDraftToCloudPayload (pas de second mapping)", () => {
    const draft = newFicheInputToDraft({ nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08", garment: "Boubou", prefillChamps: { Cou: "42" } });
    const payload = mapFicheDraftToCloudPayload(draft);
    expect(payload).toEqual({
      garment: "Boubou",
      description: null,
      measurements: expect.objectContaining({ Cou: { valeur: "42", historique: [] } }),
      metadata: { legacy_identity: { nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08" } },
    });
  });
});
