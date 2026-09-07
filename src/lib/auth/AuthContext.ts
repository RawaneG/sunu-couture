// Contexte d'auth isolé de son implémentation concrète — voir AuthProvider.tsx.
//
// Séparé délibérément (corr. R, Phase 7A) : `AuthProvider.tsx` importe
// `SupabasePinAuthRepository`, qui importe `src/lib/supabase/client.ts`,
// qui LÈVE au chargement du module si `VITE_SUPABASE_URL`/
// `VITE_SUPABASE_PUBLISHABLE_KEY` sont absentes (cas normal en test sans
// mock). `RepositoryProvider` a besoin de lire `workshop?.id` (§12/§13) sans
// jamais forcer cette chaîne d'imports sur les nombreux tests qui montent
// `<RepositoryProvider>` seul, sans `<AuthProvider>` ni mock Supabase — d'où
// ce module séparé, qui ne dépend d'aucun repository Auth concret.
import { createContext, useContext } from "react";
import type { AuthSession } from "./AuthRepository";
import type { Workshop } from "../workshop/provisionWorkshop";

/** États du cycle de vie Auth (corr. Gate Auth §38) :
 *   - "initializing"  : restauration de session au démarrage, pas encore résolue.
 *   - "signed_out"    : aucune session — écrans /connexion.
 *   - "provisioning"  : session connue, atelier en cours de résolution
 *                       (toujours bref — l'atelier est déjà créé côté serveur
 *                       au register/login, corr. Gate Auth §7/§36).
 *   - "ready"         : session ET atelier résolus — routes métier accessibles.
 *   - "error"         : session valide mais atelier non résolu (hors ligne,
 *                       erreur serveur) — jamais un blocage silencieux. */
export type AuthStatus = "initializing" | "signed_out" | "provisioning" | "ready" | "error";

export type PinAuthResult = { ok: true } | { ok: false; message: string };

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  user: { id: string; phoneE164: string | null } | null;
  /** null tant qu'aucun atelier n'a été résolu (statut "initializing"/
   * "provisioning"/"signed_out"/"error"). */
  workshop: Workshop | null;
  /** Message d'erreur simple si `status === "error"` — jamais de jargon
   * technique (corr. Gate Auth §18). */
  error: string | null;
  /** Inscription : numéro + PIN choisi. L'atelier est créé AUTOMATIQUEMENT
   * côté serveur — jamais un nom demandé ici (corr. Gate Auth §7/§8). */
  register: (phoneE164: string, pin: string) => Promise<PinAuthResult>;
  /** Connexion : numéro + PIN existants. */
  login: (phoneE164: string, pin: string) => Promise<PinAuthResult>;
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
