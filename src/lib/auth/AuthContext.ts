// Contexte d'auth isolé de son implémentation concrète — voir AuthProvider.tsx.
//
// Séparé délibérément (corr. R, Phase 7A) : `AuthProvider.tsx` importe
// `SupabasePhoneOtpAuthRepository`, qui importe `src/lib/supabase/client.ts`,
// qui LÈVE au chargement du module si `VITE_SUPABASE_URL`/
// `VITE_SUPABASE_PUBLISHABLE_KEY` sont absentes (cas normal en test sans
// mock). `RepositoryProvider` a besoin de lire `workshop?.id` (§12/§13) sans
// jamais forcer cette chaîne d'imports sur les nombreux tests qui montent
// `<RepositoryProvider>` seul, sans `<AuthProvider>` ni mock Supabase — d'où
// ce module séparé, qui ne dépend d'aucun repository Auth concret.
import { createContext, useContext } from "react";
import type { AuthSession } from "./AuthRepository";
import type { ProvisionWorkshopResult, Workshop } from "../workshop/provisionWorkshop";

export interface AuthContextValue {
  /** true tant que la session n'a pas fini d'être restaurée au démarrage. */
  initializing: boolean;
  session: AuthSession | null;
  user: { id: string; phoneE164: string | null } | null;
  /** null tant qu'aucun atelier n'a été résolu (nouvel utilisateur, ou pas encore chargé). */
  workshop: Workshop | null;
  /**
   * Sonde (`name: null`) ou crée (`name` non vide) l'atelier de l'utilisateur
   * courant, et met à jour `workshop` en cas de succès. Ne recrée JAMAIS un
   * atelier existant — voir `provision_workshop_api` (idempotent côté DB).
   */
  provisionWorkshop: (name: string | null) => Promise<ProvisionWorkshopResult>;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() doit être utilisé à l'intérieur de <AuthProvider>.");
  return ctx;
}

/** Comme `useAuth()`, mais ne lève JAMAIS hors `<AuthProvider>` — renvoie
 * `undefined` dans ce cas. Réservé aux consommateurs qui doivent rester
 * fonctionnels sans session (`RepositoryProvider` : le backend `local` n'a
 * jamais besoin d'atelier, corr. R Phase 7A §12) ou testables isolément sans
 * monter tout l'arbre applicatif (tests de Repository). */
export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}
