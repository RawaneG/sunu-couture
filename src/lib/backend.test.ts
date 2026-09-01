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
    expect(() => resolveBackend("supabase")).toThrow(/pas encore implémenté/);
  });

  it("lève une BackendConfigurationError pour toute valeur non reconnue", () => {
    expect(() => resolveBackend("mongodb")).toThrow(BackendConfigurationError);
  });
});
