// Sélection du backend au BUILD (décision D, docs/refonte/03-DECISIONS.md) —
// `VITE_BACKEND` est injecté par Vite au moment du build, ce n'est jamais un
// interrupteur runtime que l'utilisateur active. En Phase 5, seul le backend
// `local` a une implémentation réelle ; `supabase` est un choix de
// configuration reconnu mais délibérément non implémenté ici (Phase 7+).

export type Backend = "local" | "supabase";

export class BackendConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendConfigurationError";
  }
}

/**
 * Lit `VITE_BACKEND` et valide la valeur. Absente ou vide → `"local"` (valeur
 * par défaut). Toute valeur reconnue mais pas encore implémentée (`supabase`)
 * ou totalement inconnue lève une erreur de configuration CLAIRE au moment de
 * la construction du conteneur de repositories — jamais une requête réseau
 * partant silencieusement avec le mauvais backend.
 */
export function resolveBackend(raw: string | undefined): Backend {
  const value = (raw ?? "").trim();
  if (value === "" || value === "local") return "local";
  if (value === "supabase") {
    throw new BackendConfigurationError(
      "VITE_BACKEND=supabase demandé, mais le Repository Supabase n'est pas encore implémenté (Phase 7+). " +
        "Utilise VITE_BACKEND=local (ou omets la variable) tant que cette implémentation n'existe pas.",
    );
  }
  throw new BackendConfigurationError(
    `VITE_BACKEND="${value}" n'est pas une valeur reconnue. Valeurs acceptées : "local" (ou absent).`,
  );
}

export function currentBackend(): Backend {
  return resolveBackend(import.meta.env.VITE_BACKEND);
}
