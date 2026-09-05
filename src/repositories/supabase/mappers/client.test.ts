import { describe, expect, it } from "vitest";
import { colorSeedFor } from "../../../lib/store";
import { mapClientRowToDomain, mapNewClientInputToInsert } from "./client";
import type { ClientRow } from "../schemas";

function row(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "c1",
    workshop_id: "w1",
    display_name: "Awa Diouf",
    first_name: null,
    last_name: null,
    nickname: null,
    phone_e164: "+221775124408",
    phone_display: "77 512 44 08",
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("mapClientRowToDomain", () => {
  it("mappe une row nominale vers le domaine", () => {
    const client = mapClientRowToDomain(row());
    expect(client).toEqual({
      id: "c1",
      name: "Awa Diouf",
      phone: "77 512 44 08",
      photo: null,
      colorSeed: colorSeedFor("Awa Diouf"), // pas de metadata.color_seed → fallback déterministe
    });
  });

  it("utilise metadata.color_seed quand présent, sans jamais recalculer", () => {
    const client = mapClientRowToDomain(row({ metadata: { color_seed: "terracotta" } }));
    expect(client.colorSeed).toBe("terracotta");
  });

  it("phone_display absent → replie sur phone_e164 plutôt que sur une chaîne vide", () => {
    const client = mapClientRowToDomain(row({ phone_display: null, phone_e164: "+221775124408" }));
    expect(client.phone).toBe("+221775124408");
  });

  it("aucun téléphone du tout → chaîne vide, jamais une valeur inventée", () => {
    const client = mapClientRowToDomain(row({ phone_display: null, phone_e164: null }));
    expect(client.phone).toBe("");
  });

  it("Client.photo n'est JAMAIS lu depuis la row — toujours null (D2 : photo hors modèle SQL cible)", () => {
    const client = mapClientRowToDomain(row());
    expect(client.photo).toBeNull();
  });
});

describe("mapNewClientInputToInsert", () => {
  it("recopie display_name verbatim — aucune heuristique de découpage nom/prénom (D2)", () => {
    const insert = mapNewClientInputToInsert({ name: "Awa Diouf Sow", phone: "", photo: null }, "w1");
    expect(insert.display_name).toBe("Awa Diouf Sow");
  });

  it("normalise un numéro sénégalais local valide en E.164", () => {
    const insert = mapNewClientInputToInsert({ name: "Awa", phone: "77 512 44 08", photo: null }, "w1");
    expect(insert.phone_e164).toBe("+221775124408");
    expect(insert.phone_display).toBe("77 512 44 08");
  });

  it("un numéro non reconnaissable → phone_e164 null, la saisie brute reste dans phone_display", () => {
    const insert = mapNewClientInputToInsert({ name: "Awa", phone: "abc", photo: null }, "w1");
    expect(insert.phone_e164).toBeNull();
    expect(insert.phone_display).toBe("abc");
  });

  it("téléphone absent → phone_e164 et phone_display tous deux null (jamais une valeur inventée)", () => {
    const insert = mapNewClientInputToInsert({ name: "Awa", phone: "  ", photo: null }, "w1");
    expect(insert.phone_e164).toBeNull();
    expect(insert.phone_display).toBeNull();
  });

  it("porte le workshop_id fourni explicitement — jamais un atelier arbitraire", () => {
    const insert = mapNewClientInputToInsert({ name: "Awa", phone: "", photo: null }, "workshop-xyz");
    expect(insert.workshop_id).toBe("workshop-xyz");
  });
});
