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

  it("lève une BackendConfigurationError claire pour 'supabase' — jamais un faux Repository silencieux", () => {
    expect(() => resolveBackend("supabase")).toThrow(BackendConfigurationError);
  });

  it("le message reste factuellement à jour (revue post-7A, §12) : infrastructure 7A disponible, activation interdite avant le gate", () => {
    try {
      resolveBackend("supabase");
      expect.unreachable("resolveBackend('supabase') aurait dû lever");
    } catch (error) {
      expect(error).toBeInstanceOf(BackendConfigurationError);
      const message = (error as Error).message;
      // Ne doit plus prétendre qu'aucune implémentation n'existe (faux depuis
      // la Phase 7A) — doit au contraire nommer le gate réel restant.
      expect(message).not.toMatch(/pas encore implémenté/);
      expect(message).toMatch(/infrastructure cloud Phase 7A/);
      expect(message).toMatch(/interdite avant le/);
      expect(message).toMatch(/7B \+ 8A \+ 8B \+ 11A/);
    }
  });

  it("lève une BackendConfigurationError pour toute valeur non reconnue", () => {
    expect(() => resolveBackend("mongodb")).toThrow(BackendConfigurationError);
  });
});
