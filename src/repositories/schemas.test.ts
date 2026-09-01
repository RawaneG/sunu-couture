import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  RepositoryValidationError,
  parseOrThrow,
  newClientInputSchema,
  storedClientSchema,
  warnIfInvalid,
} from "./schemas";

describe("parseOrThrow — validation aux frontières du Repository", () => {
  it("renvoie la valeur telle quelle quand elle est valide", () => {
    const input = { name: "Awa Diouf", phone: "77 512 44 08", photo: null };
    expect(parseOrThrow(newClientInputSchema, input, "test")).toEqual(input);
  });

  it("lève une RepositoryValidationError structurée quand l'entrée est invalide", () => {
    const invalid = { name: 42, phone: "77 512 44 08", photo: null };
    let caught: unknown;
    try {
      parseOrThrow(newClientInputSchema, invalid, "ClientRepository.add");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RepositoryValidationError);
    const error = caught as RepositoryValidationError;
    expect(error.message).toContain("ClientRepository.add");
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it("ne modifie jamais silencieusement une entrée invalide — elle est rejetée, jamais corrigée", () => {
    const invalid = { name: "", phone: 123, photo: null };
    expect(() => parseOrThrow(newClientInputSchema, invalid, "test")).toThrow(RepositoryValidationError);
  });
});

describe("warnIfInvalid — données déjà persistées (lecture)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("ne journalise rien quand tous les éléments sont valides", () => {
    const items = [{ id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" }];
    warnIfInvalid(storedClientSchema, items, "test");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("journalise un avertissement sans jamais modifier ni supprimer les éléments invalides", () => {
    const items = [
      { id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" },
      { id: "c2", name: 42, phone: "77" }, // forme invalide (name non-string, colorSeed manquant)
    ];
    const before = JSON.stringify(items);
    warnIfInvalid(storedClientSchema, items, "ClientRepository.list");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("1 élément");
    // La fonction ne reçoit qu'un tableau en lecture seule et ne le retourne
    // pas — la garantie réelle de non-suppression vient de list()/get() qui
    // renvoient toujours la collection brute, vérifiée ici indirectement en
    // s'assurant qu'aucune mutation n'a eu lieu sur les objets fournis.
    expect(JSON.stringify(items)).toBe(before);
  });
});
