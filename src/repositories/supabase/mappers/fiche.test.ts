import { describe, expect, it } from "vitest";
import { FICHE_MESURE_KEYS, FICHE_INFO_KEYS } from "../../../lib/types";
import { mapFicheRowToDomain, mapCloudStatusToDomain, CLOUD_STATUS_TO_DOMAIN, DOMAIN_STATUS_TO_CLOUD } from "./fiche";
import type { FicheViewRow } from "../schemas";

function row(overrides: Partial<FicheViewRow> = {}): FicheViewRow {
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
    measurements: {},
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

// carnet_id "carnet-1" → numéro 2 (délibérément PAS 1, pour empêcher un
// fallback accidentel — voir corr. R §37).
const resolveCarnet = (carnetId: string) => (carnetId === "carnet-1" ? 2 : undefined);

describe("mapCloudStatusToDomain / tables de statut", () => {
  it("mappe les 4 statuts cloud → domaine", () => {
    expect(CLOUD_STATUS_TO_DOMAIN.received).toBe("recu");
    expect(CLOUD_STATUS_TO_DOMAIN.sewing).toBe("couture");
    expect(CLOUD_STATUS_TO_DOMAIN.ready).toBe("pret");
    expect(CLOUD_STATUS_TO_DOMAIN.delivered).toBe("livre");
  });

  it("mappe les 4 statuts domaine → cloud (sens inverse exhaustif)", () => {
    expect(DOMAIN_STATUS_TO_CLOUD.recu).toBe("received");
    expect(DOMAIN_STATUS_TO_CLOUD.couture).toBe("sewing");
    expect(DOMAIN_STATUS_TO_CLOUD.pret).toBe("ready");
    expect(DOMAIN_STATUS_TO_CLOUD.livre).toBe("delivered");
  });

  it("une valeur de statut inconnue est REJETÉE, jamais coercée silencieusement", () => {
    expect(() => mapCloudStatusToDomain("inconnu")).toThrow(/inconnu/);
  });
});

describe("mapFicheRowToDomain — champs directs", () => {
  it("mappe number/garment/description/fabric_notes/due_date/total_price/settled_at/created_at/client_id/deleted_at", () => {
    const fiche = mapFicheRowToDomain(
      row({
        number: 7,
        garment: "Boubou brodé",
        description: "Manches longues",
        due_date: "2026-03-01",
        total_price: 40000,
        settled_at: "2026-02-15T10:00:00.000Z",
        client_id: "client-1",
        created_at: "2026-01-05T00:00:00.000Z",
      }),
      resolveCarnet,
    );
    expect(fiche.numero).toBe(7);
    expect(fiche.garment).toBe("Boubou brodé");
    expect(fiche.description).toBe("Manches longues");
    expect(fiche.dueDate).toBe("2026-03-01");
    expect(fiche.price).toBe(40000);
    expect(fiche.soldeLe).toBe("2026-02-15T10:00:00.000Z");
    expect(fiche.clientId).toBe("client-1");
    expect(fiche.createdAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("is_late est repris TEL QUEL depuis fiches_view — jamais recalculé côté client (D8)", () => {
    expect(mapFicheRowToDomain(row({ is_late: true }), resolveCarnet).late).toBe(true);
    expect(mapFicheRowToDomain(row({ is_late: false }), resolveCarnet).late).toBe(false);
  });
});

describe("mapFicheRowToDomain — carnetNumero (corr. R §30/§37)", () => {
  it("résout carnetNumero via le résolveur fourni — un carnet numéro 2, pas 1", () => {
    const fiche = mapFicheRowToDomain(row({ carnet_id: "carnet-1" }), resolveCarnet);
    expect(fiche.carnetNumero).toBe(2);
  });

  it("carnet introuvable dans le cache → erreur contrôlée, JAMAIS un fallback carnetNumero:1 inventé", () => {
    expect(() => mapFicheRowToDomain(row({ carnet_id: "carnet-inconnu" }), resolveCarnet)).toThrow(
      /carnet-inconnu/,
    );
  });
});

describe("mapFicheRowToDomain — metadata réelle (legacy_identity, fabric_color)", () => {
  it("lit nom/prenom/telephone depuis metadata.legacy_identity", () => {
    const fiche = mapFicheRowToDomain(
      row({ metadata: { legacy_identity: { nom: "Diouf", prenom: "Awa", telephone: "77 512 44 08" } } }),
      resolveCarnet,
    );
    expect(fiche.nom).toBe("Diouf");
    expect(fiche.prenom).toBe("Awa");
    expect(fiche.telephone).toBe("77 512 44 08");
  });

  it("legacy_identity absente → champs vides, jamais une valeur inventée", () => {
    const fiche = mapFicheRowToDomain(row({ metadata: {} }), resolveCarnet);
    expect(fiche.nom).toBe("");
    expect(fiche.prenom).toBe("");
    expect(fiche.telephone).toBe("");
  });

  it("lit fabricColor depuis metadata.fabric_color", () => {
    const fiche = mapFicheRowToDomain(row({ metadata: { fabric_color: "#3355ff" } }), resolveCarnet);
    expect(fiche.fabricColor).toBe("#3355ff");
  });
});

describe("mapFicheRowToDomain — champs non autoritatifs avant 8A/11A (corr. R §31)", () => {
  it("voiceNote/signature/tissuPhotos restent neutres — pas de fausse donnée avant la Phase 8A", () => {
    const fiche = mapFicheRowToDomain(row(), resolveCarnet);
    expect(fiche.voiceNote).toBeNull();
    expect(fiche.signature).toBeNull();
    expect(fiche.tissuPhotos).toEqual([]);
  });

  it("avance reste à 0 — pas de fausse donnée avant la Phase 11A", () => {
    expect(mapFicheRowToDomain(row(), resolveCarnet).avance).toBe(0);
  });
});

describe("mapFicheRowToDomain — measurements (champs)", () => {
  it("construit TOUTES les clés (mesures + info) même si measurements={} — jamais un objet partiel", () => {
    const fiche = mapFicheRowToDomain(row({ measurements: {} }), resolveCarnet);
    for (const key of [...FICHE_MESURE_KEYS, ...FICHE_INFO_KEYS]) {
      expect(fiche.champs[key]).toEqual({ valeur: "", historique: [] });
    }
  });

  it("reprend valeur/historique réels pour les clés présentes", () => {
    const fiche = mapFicheRowToDomain(
      row({ measurements: { E: { valeur: "48", historique: ["46", "44"] } } }),
      resolveCarnet,
    );
    expect(fiche.champs.E).toEqual({ valeur: "48", historique: ["46", "44"] });
    expect(fiche.champs.Cou).toEqual({ valeur: "", historique: [] });
  });

  it("une clé métier CONNUE simplement ABSENTE reste acceptée — champ domaine vide (comportement conservé)", () => {
    const fiche = mapFicheRowToDomain(row({ measurements: { E: { valeur: "48", historique: [] } } }), resolveCarnet);
    expect(fiche.champs.Cou).toEqual({ valeur: "", historique: [] });
  });

  it("une clé inconnue est tolérée sans validation, sans affecter les clés connues (compat future)", () => {
    const fiche = mapFicheRowToDomain(
      row({ measurements: { E: { valeur: "48", historique: [] }, cleFuture: { quoiQueCeSoit: true } } }),
      resolveCarnet,
    );
    expect(fiche.champs.E).toEqual({ valeur: "48", historique: [] });
  });

  it("une entrée de measurements malformée pour une clé CONNUE (pas un objet) est REJETÉE — plus de coercition silencieuse (revue post-7A, §8)", () => {
    expect(() => mapFicheRowToDomain(row({ measurements: { E: "48" } }), resolveCarnet)).toThrow(/measurements\.E invalide/);
  });

  it("une entrée de measurements malformée pour une clé CONNUE (valeur non string) est REJETÉE", () => {
    expect(() =>
      mapFicheRowToDomain(row({ measurements: { E: { valeur: 48, historique: [] } } }), resolveCarnet),
    ).toThrow(/measurements\.E\.valeur invalide/);
  });

  it("une entrée de measurements malformée pour une clé CONNUE (historique non tableau de strings) est REJETÉE", () => {
    expect(() =>
      mapFicheRowToDomain(row({ measurements: { E: { valeur: "48", historique: "pas un tableau" } } }), resolveCarnet),
    ).toThrow(/measurements\.E\.historique invalide/);
  });

  it("measurements lui-même n'est pas un objet (JSON malformé) → REJETÉ, plus de coercition silencieuse (revue post-7A, §8)", () => {
    expect(() =>
      mapFicheRowToDomain(row({ measurements: "invalide" as unknown as Record<string, unknown> }), resolveCarnet),
    ).toThrow(/measurements : racine non-objet rejetée/);
  });

  it("measurements = null est REJETÉ (racine non-objet)", () => {
    expect(() =>
      mapFicheRowToDomain(row({ measurements: null as unknown as Record<string, unknown> }), resolveCarnet),
    ).toThrow(/measurements : racine non-objet rejetée/);
  });

  it("measurements = tableau est REJETÉ (racine non-objet)", () => {
    expect(() =>
      mapFicheRowToDomain(row({ measurements: [] as unknown as Record<string, unknown> }), resolveCarnet),
    ).toThrow(/measurements : racine non-objet rejetée/);
  });
});

describe("mapFicheRowToDomain — fabric_notes ↔ tissusDeposes (revue post-7A, §9)", () => {
  it("fabric_notes fait foi pour la VALEUR courante, l'historique vient de measurements", () => {
    const fiche = mapFicheRowToDomain(
      row({ fabric_notes: "Wax bleu", measurements: { tissusDeposes: { valeur: "Wax bleu", historique: ["Bazin"] } } }),
      resolveCarnet,
    );
    expect(fiche.champs.tissusDeposes).toEqual({ valeur: "Wax bleu", historique: ["Bazin"] });
  });

  it("fabric_notes absent → retombe sur measurements.tissusDeposes.valeur", () => {
    const fiche = mapFicheRowToDomain(
      row({ fabric_notes: null, measurements: { tissusDeposes: { valeur: "Bazin riche", historique: [] } } }),
      resolveCarnet,
    );
    expect(fiche.champs.tissusDeposes.valeur).toBe("Bazin riche");
  });

  it("measurements.tissusDeposes absent → retombe sur fabric_notes, historique vide", () => {
    const fiche = mapFicheRowToDomain(row({ fabric_notes: "Wax bleu", measurements: {} }), resolveCarnet);
    expect(fiche.champs.tissusDeposes).toEqual({ valeur: "Wax bleu", historique: [] });
  });

  it("les deux absents → champ vide, pas d'exception", () => {
    const fiche = mapFicheRowToDomain(row({ fabric_notes: null, measurements: {} }), resolveCarnet);
    expect(fiche.champs.tissusDeposes).toEqual({ valeur: "", historique: [] });
  });

  it("fabric_notes et measurements.tissusDeposes.valeur NON VIDES et DIFFÉRENTS → erreur contrôlée, pas de choix silencieux", () => {
    expect(() =>
      mapFicheRowToDomain(
        row({ fabric_notes: "Wax bleu", measurements: { tissusDeposes: { valeur: "Bazin riche", historique: [] } } }),
        resolveCarnet,
      ),
    ).toThrow(/divergent/);
  });
});
