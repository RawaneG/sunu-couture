import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createRepositoryContainer, type RepositoryContainer } from "./RepositoryContainer";
// Import depuis `AuthContext.ts` (PAS `AuthProvider.tsx`) : ce dernier
// importe `SupabasePhoneOtpAuthRepository` → le client Supabase réel, qui
// lève au chargement du module sans `VITE_SUPABASE_*` — une chaîne que ce
// fichier, monté par de nombreux tests sans `<AuthProvider>` ni mock
// Supabase, ne doit jamais tirer (corr. R, Phase 7A §12).
import { useOptionalAuth } from "../lib/auth/AuthContext";

const RepositoryContext = createContext<RepositoryContainer | null>(null);

interface RepositoryProviderProps {
  children: ReactNode;
  /** Point d'injection pour les tests (et les phases futures) : fournir un
   * conteneur — au besoin avec de faux repositories — remplace entièrement
   * l'implémentation par défaut sans toucher aux pages ni aux hooks. */
  repositories?: RepositoryContainer;
}

/** Doit être monté SOUS `<AuthProvider>` (corr. R, Phase 7A §12 — inversion
 * de l'ordre précédent) : le conteneur a besoin de connaître l'atelier
 * authentifié courant pour scoper un futur Repository cloud, sans jamais
 * choisir un "premier atelier disponible" ni un id arbitraire (§13).
 * `useOptionalAuth()` (jamais `useAuth()`) permet à ce Provider de rester
 * fonctionnel dans les tests qui le montent seul, sans `<AuthProvider>` —
 * le backend `local` (seul atteignable en Phase 7A) n'a de toute façon
 * jamais besoin de `workshopId`. */
export function RepositoryProvider({ children, repositories }: RepositoryProviderProps) {
  const workshopId = useOptionalAuth()?.workshop?.id;
  const container = useMemo(
    () => repositories ?? createRepositoryContainer({ workshopId }),
    [repositories, workshopId],
  );
  return <RepositoryContext.Provider value={container}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): RepositoryContainer {
  const container = useContext(RepositoryContext);
  if (!container) {
    throw new Error("useRepositories() doit être appelé sous <RepositoryProvider>.");
  }
  return container;
}
