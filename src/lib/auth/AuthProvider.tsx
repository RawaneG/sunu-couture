// Contexte de session frontend — expose l'état d'auth + l'atelier courant à
// toute l'app. NE bloque PAS encore l'accès aux routes existantes par une
// redirection obligatoire (ce branchement global est explicitement reporté à
// la Phase 4, une fois les politiques RLS en place) : ce provider ne fait
// qu'exposer l'état, `RequireAuth` (composant séparé, non branché ici) porte
// la logique de garde pour qui voudra protéger une route dès maintenant.
//
// Le contexte lui-même (type + `useAuth`/`useOptionalAuth`) vit dans
// `AuthContext.ts`, séparé de ce fichier : cette implémentation CONCRÈTE
// importe `SupabasePhoneOtpAuthRepository`, qui importe le client Supabase
// réel — un module qui LÈVE au chargement si les variables `VITE_SUPABASE_*`
// sont absentes. `RepositoryProvider` (et ses nombreux tests, montés sans
// `<AuthProvider>` ni mock Supabase) n'importent donc jamais ce fichier,
// seulement `AuthContext.ts` (voir corr. R, Phase 7A §12).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SupabasePhoneOtpAuthRepository } from "./SupabasePhoneOtpAuthRepository";
import type { AuthSession } from "./AuthRepository";
import { callProvisionWorkshop, type ProvisionWorkshopResult, type Workshop } from "../workshop/provisionWorkshop";
import { AuthContext, type AuthContextValue } from "./AuthContext";

const authRepository = new SupabasePhoneOtpAuthRepository();

// Ré-exportés pour compatibilité : le reste de l'app importe déjà `useAuth`
// depuis `./AuthProvider` (ex. `RequireAuth.tsx`) — inchangé après ce split.
export type { AuthContextValue };
export { useAuth, useOptionalAuth } from "./AuthContext";

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
