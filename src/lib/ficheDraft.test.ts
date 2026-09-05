import { describe, expect, it } from "vitest";
import { FICHE_MESURE_KEYS } from "./types";
import { emptyFicheDraft, isMeaningfulFicheDraft, mapFicheDraftToCloudPayload } from "./ficheDraft";

describe("isMeaningfulFicheDraft", () => {
  it("un brouillon vide n'est pas significatif", () => {
    expect(isMeaningfulFicheDraft(emptyFicheDraft())).toBe(false);
  });

  it("des chaînes blanches (espace, tabulation, saut de ligne) restent non significatives", () => {
    const draft = emptyFicheDraft();
    draft.nom = "   ";
    draft.prenom = "\t";
    draft.telephone = "\n";
    draft.garment = " \t\n ";
    draft.description = "  ";
    draft.champs[FICHE_MESURE_KEYS[0]] = { valeur: "   ", historique: [] };
    expect(isMeaningfulFicheDraft(draft)).toBe(false);
  });

  it("clientId non nul rend le brouillon significatif", () => {
    const draft = emptyFicheDraft();
    draft.clientId = "c1";
    expect(isMeaningfulFicheDraft(draft)).toBe(true);
  });

  it("garment non blanc rend le brouillon significatif", () => {
    const draft = emptyFicheDraft();
    draft.garment = "Boubou";
    expect(isMeaningfulFicheDraft(draft)).toBe(true);
  });

  it("description non blanche rend le brouillon significatif", () => {
    const draft = emptyFicheDraft();
    draft.description = "Manches longues";
    expect(isMeaningfulFicheDraft(draft)).toBe(true);
  });

  it("une mesure non blanche rend le brouillon significatif", () => {
    const draft = emptyFicheDraft();
    draft.champs[FICHE_MESURE_KEYS[0]] = { valeur: "42", historique: [] };
    expect(isMeaningfulFicheDraft(draft)).toBe(true);
  });

  it("nom / prénom / téléphone non blancs rendent le brouillon significatif", () => {
    expect(isMeaningfulFicheDraft({ ...emptyFicheDraft(), nom: "Diouf" })).toBe(true);
    expect(isMeaningfulFicheDraft({ ...emptyFicheDraft(), prenom: "Awa" })).toBe(true);
    expect(isMeaningfulFicheDraft({ ...emptyFicheDraft(), telephone: "77 512 44 08" })).toBe(true);
  });
});

describe("mapFicheDraftToCloudPayload", () => {
  it("produit le contrat exact attendu côté cloud, sans aucun champ structurel", () => {
    const draft = emptyFicheDraft();
    draft.nom = "Diouf";
    draft.prenom = "Awa";
    draft.telephone = "77 512 44 08";
    draft.garment = "Boubou";
    draft.description = "Manches longues";
    draft.champs[FICHE_MESURE_KEYS[0]] = { valeur: "42", historique: ["40"] };

    const payload = mapFicheDraftToCloudPayload(draft);

    expect(payload).toEqual({
      garment: "Boubou",
      description: "Manches longues",
      measurements: expect.objectContaining({
        [FICHE_MESURE_KEYS[0]]: { valeur: "42", historique: ["40"] },
      }),
      metadata: {
        legacy_identity: { nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08" },
      },
    });

    const serialized = JSON.stringify(payload);
    for (const forbidden of ["numero", "carnetNumero", "carnet_id", "page_number", "slot_number", "workshop_id"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("une description blanche devient null (jamais une chaîne vide fantôme)", () => {
    const draft = emptyFicheDraft();
    draft.description = "   ";
    expect(mapFicheDraftToCloudPayload(draft).description).toBeNull();
  });
});
