import { describe, expect, it } from "vitest";
import { BackendConfigurationError, resolveBackend } from "./backend";

describe("resolveBackend — sélection du backend au build", () => {
  it("choisit 'local' quand la variable est absente", () => {
    expect(resolveBackend(undefined)).toBe("local");
  });

  it("choisit 'local' quand la variable est une chaîne vide", () => {
    expect(resolveBackend("")).toBe("local");
  });

  it("choisit 'local' quand la variable vaut explicitement 'local'", () => {
    expect(resolveBackend("local")).toBe("local");
  });

  it("choisit 'supabase' quand la variable vaut explicitement 'supabase' (gate atteint)", () => {
    expect(resolveBackend("supabase")).toBe("supabase");
  });

  it("lève une BackendConfigurationError claire pour toute valeur non reconnue", () => {
    expect(() => resolveBackend("mongodb")).toThrow(BackendConfigurationError);
  });

  it("le message d'erreur nomme les valeurs reconnues ('local' et 'supabase')", () => {
    try {
      resolveBackend("mongodb");
      expect.unreachable("resolveBackend('mongodb') aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(BackendConfigurationError);
      const message = (error as Error).message;
      expect(message).toMatch(/"local"/);
      expect(message).toMatch(/"supabase"/);
    }
  });
});
