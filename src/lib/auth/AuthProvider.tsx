// Contexte de session frontend — expose l'état d'auth + l'atelier courant à
// toute l'app. NE bloque PAS encore l'accès aux routes existantes par une
// redirection obligatoire (ce branchement global est explicitement reporté à
// la Phase 4, une fois les politiques RLS en place) : ce provider ne fait
// qu'exposer l'état, `RequireAuth` (composant séparé, non branché ici) porte
// la logique de garde pour qui voudra protéger une route dès maintenant.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SupabasePhoneOtpAuthRepository } from "./SupabasePhoneOtpAuthRepository";
import type { AuthSession } from "./AuthRepository";
import { callProvisionWorkshop, type ProvisionWorkshopResult, type Workshop } from "../workshop/provisionWorkshop";

const authRepository = new SupabasePhoneOtpAuthRepository();

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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  // Évite de résoudre l'atelier deux fois pour la même restauration initiale
  // (getSession() au montage + premier événement onAuthStateChange).
  const resolvedForUserId = useRef<string | null>(null);

  const provisionWorkshop = useCallback(async (name: string | null): Promise<ProvisionWorkshopResult> => {
    const result = await callProvisionWorkshop(name);
    if (result.kind === "workshop") setWorkshop(result.workshop);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initialSession = await authRepository.getSession();
      if (cancelled) return;
      setSession(initialSession);
      if (initialSession) {
        resolvedForUserId.current = initialSession.userId;
        // Résout l'atelier EXISTANT uniquement (sonde) — ne crée jamais rien
        // au chargement. `name_required`/`error` laissent `workshop` à null ;
        // ne relance rien automatiquement (D5 : pas d'onboarding forcé ici).
        await provisionWorkshop(null);
      }
      if (!cancelled) setInitializing(false);
    })();

    const unsubscribe = authRepository.subscribeToAuthChanges((newSession) => {
      setSession(newSession);
      if (!newSession) {
        setWorkshop(null);
        resolvedForUserId.current = null;
        return;
      }
      if (resolvedForUserId.current !== newSession.userId) {
        resolvedForUserId.current = newSession.userId;
        void provisionWorkshop(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Monté une seule fois : `authRepository` est un singleton de module et
    // `provisionWorkshop` est stable (useCallback, deps []).
  }, [provisionWorkshop]);

  const value: AuthContextValue = {
    initializing,
    session,
    user: session ? { id: session.userId, phoneE164: session.phoneE164 } : null,
    workshop,
    provisionWorkshop,
    signOut: async () => {
      await authRepository.signOut();
      setWorkshop(null);
    },
    signOutAllDevices: async () => {
      await authRepository.signOutAllDevices();
      setWorkshop(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() doit être utilisé à l'intérieur de <AuthProvider>.");
  return ctx;
}
