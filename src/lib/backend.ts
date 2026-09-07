// Sélection du backend au BUILD (décision D, docs/refonte/03-DECISIONS.md) —
// `VITE_BACKEND` est injecté par Vite au moment du build, ce n'est jamais un
// interrupteur runtime que l'utilisateur active. Le gate cloud (7B + 8A + 8B
// + 11A) est désormais atteint : `supabase` est une valeur pleinement
// résolue, au même titre que `local`. Le défaut (variable absente/vide) reste
// `"local"` — le cloud n'est jamais choisi implicitement, uniquement par un
// `VITE_BACKEND=supabase` explicite au build (voir `RepositoryContainer.ts`
// pour l'activation réelle, qui exige en plus `workshopId`/`supabaseGateway`).

export type Backend = "local" | "supabase";

export class BackendConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendConfigurationError";
  }
}

/**
 * Lit `VITE_BACKEND` et valide la valeur. Absente ou vide → `"local"` (valeur
 * par défaut, jamais changée par cette fonction — le cloud n'est choisi que
 * par une valeur explicite). Toute valeur totalement inconnue lève une
 * erreur de configuration CLAIRE au moment de la construction du conteneur
 * de repositories — jamais une requête réseau partant silencieusement avec
 * le mauvais backend.
 */
export function resolveBackend(raw: string | undefined): Backend {
  const value = (raw ?? "").trim();
  if (value === "" || value === "local") return "local";
  if (value === "supabase") return "supabase";
  throw new BackendConfigurationError(
    `VITE_BACKEND="${value}" n'est pas une valeur reconnue. Valeurs acceptées : "local" (ou absent), "supabase".`,
  );
}

export function currentBackend(): Backend {
  return resolveBackend(import.meta.env.VITE_BACKEND);
}
