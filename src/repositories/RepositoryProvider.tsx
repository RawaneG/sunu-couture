import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createRepositoryContainer, type RepositoryContainer } from "./RepositoryContainer";
// Import depuis `AuthContext.ts` (PAS `AuthProvider.tsx`) : ce dernier
// importe `SupabasePhoneOtpAuthRepository` → le client Supabase réel, qui
// lève au chargement du module sans `VITE_SUPABASE_*` — une chaîne que ce
// fichier, monté par de nombreux tests sans `<AuthProvider>` ni mock
// Supabase, ne doit jamais tirer (corr. R, Phase 7A §12).
import { useOptionalAuth } from "../lib/auth/AuthContext";
// Import TYPE UNIQUEMENT — voir `RepositoryContainer.ts` : `supabaseGateway`
// est un objet déjà construit fourni par l'appelant réel (aujourd'hui
// `ProtectedRepositoryProvider` dans `App.tsx`, seul endroit qui importe
// `createSupabaseGateway()`/le singleton `src/lib/supabase/client.ts`, corr.
// Gate §6/§9) — jamais importé ni construit ici.
import type { SupabaseGateway } from "./supabase/gateway";

const RepositoryContext = createContext<RepositoryContainer | null>(null);

interface RepositoryProviderProps {
  children: ReactNode;
  /** Point d'injection pour les tests (et les phases futures) : fournir un
   * conteneur — au besoin avec de faux repositories — remplace entièrement
   * l'implémentation par défaut sans toucher aux pages ni aux hooks. Un
   * conteneur injecté n'est JAMAIS disposé par ce Provider (corr. Gate §14) —
   * son cycle de vie appartient à l'appelant (généralement un test), qui l'a
   * construit lui-même. */
  repositories?: RepositoryContainer;
  /** Gateway Supabase déjà construit (voir `createSupabaseGateway()`) —
   * ignoré si `repositories` est injecté, et ignoré par le backend `local`.
   * Obligatoire pour que le backend `supabase` construise quoi que ce soit
   * (corr. Gate §6/§20) — jamais construit PAR ce fichier lui-même. */
  supabaseGateway?: SupabaseGateway;
}

/** Doit être monté SOUS `<AuthProvider>` — et, pour le backend `supabase`,
 * sous `<RequireAuth>` (corr. Gate §10/§11) : au démarrage, avant restauration
 * de session, `workshop` est `null` et un conteneur cloud ne doit jamais être
 * tenté avec un atelier absent. `useOptionalAuth()` (jamais `useAuth()`)
 * permet à ce Provider de rester fonctionnel dans les tests qui le montent
 * seul, sans `<AuthProvider>` — le backend `local` n'a de toute façon jamais
 * besoin de `workshopId`. */
export function RepositoryProvider({ children, repositories, supabaseGateway }: RepositoryProviderProps) {
  const workshopId = useOptionalAuth()?.workshop?.id;
  const container = useMemo(
    () => repositories ?? createRepositoryContainer({ workshopId, supabaseGateway }),
    [repositories, workshopId, supabaseGateway],
  );

  useEffect(() => {
    // Ne dispose QUE le conteneur que CE Provider a lui-même créé — jamais un
    // conteneur injecté par un test/parent (corr. Gate §14). Le cleanup
    // s'exécute avant chaque recréation (changement d'atelier -> nouveau
    // conteneur, corr. Gate §25) ET au démontage — jamais les deux lots en
    // vie simultanément.
    if (repositories) return;
    return () => {
      container.dispose?.();
    };
  }, [container, repositories]);

  return <RepositoryContext.Provider value={container}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContainer {
  const container = useContext(RepositoryContext);
  if (!container) {
    throw new Error("useRepositories() doit être appelé sous <RepositoryProvider>.");
  }
  return container;
}
