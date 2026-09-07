// Contexte de session frontend — expose l'état d'auth + l'atelier courant à
// toute l'app. Pivot Gate Auth (téléphone + PIN 4 chiffres, atelier
// invisible) : `register()`/`login()` remplacent l'ancien flux OTP
// (`sendPhoneOtp`/`verifyPhoneOtp` + écran "nom de l'atelier") — l'Edge
// Function `tayoo-pin-auth` crée déjà l'atelier automatiquement, ce
// Provider n'a donc plus qu'à le RÉSOUDRE (sonde `callProvisionWorkshop(null)`,
// infrastructure Phase 3A conservée pour compatibilité, corr. Gate Auth §37)
// après l'établissement de la session.
//
// Le contexte lui-même (type + `useAuth`/`useOptionalAuth`) vit dans
// `AuthContext.ts`, séparé de ce fichier : cette implémentation CONCRÈTE
// importe `SupabasePinAuthRepository`, qui importe le client Supabase
// réel — un module qui LÈVE au chargement si les variables `VITE_SUPABASE_*`
// sont absentes. `RepositoryProvider` (et ses nombreux tests, montés sans
// `<AuthProvider>` ni mock Supabase) n'importent donc jamais ce fichier,
// seulement `AuthContext.ts` (voir corr. R, Phase 7A §12).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SupabasePinAuthRepository } from "./SupabasePinAuthRepository";
import type { AuthSession } from "./AuthRepository";
import { callProvisionWorkshop, type Workshop } from "../workshop/provisionWorkshop";
import { AuthContext, type AuthContextValue, type AuthStatus, type PinAuthResult } from "./AuthContext";

const authRepository = new SupabasePinAuthRepository();

// Ré-exportés pour compatibilité : le reste de l'app importe déjà `useAuth`
// depuis `./AuthProvider` (ex. `RequireAuth.tsx`) — inchangé après ce split.
export type { AuthContextValue };
export { useAuth, useOptionalAuth } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Évite de résoudre l'atelier deux fois pour la même restauration initiale
  // (getSession() au montage + premier événement onAuthStateChange).
  const resolvedForUserId = useRef<string | null>(null);

  /** Sonde l'atelier existant (jamais de création manuelle ici — l'Edge
   * Function `tayoo-pin-auth` l'a déjà créé au register/login, corr. Gate
   * Auth §36) : ne devrait donc plus jamais renvoyer `name_required` dans le
   * nouveau parcours — un filet de sécurité explicite si c'est quand même le
   * cas, jamais un blocage silencieux. */
  const resolveWorkshop = useCallback(async () => {
    setStatus("provisioning");
    const result = await callProvisionWorkshop(null);
    if (result.kind === "workshop") {
      setWorkshop(result.workshop);
      setError(null);
      setStatus("ready");
    } else if (result.kind === "name_required") {
      setStatus("error");
      setError("Ton atelier n'a pas pu être préparé. Réessaie de te connecter.");
    } else {
      setStatus("error");
      setError(result.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initialSession = await authRepository.getSession();
      if (cancelled) return;
      setSession(initialSession);
      if (initialSession) {
        resolvedForUserId.current = initialSession.userId;
        await resolveWorkshop();
      } else {
        setStatus("signed_out");
      }
    })();

    const unsubscribe = authRepository.subscribeToAuthChanges((newSession) => {
      setSession(newSession);
      if (!newSession) {
        setWorkshop(null);
        setError(null);
        resolvedForUserId.current = null;
        setStatus("signed_out");
        return;
      }
      if (resolvedForUserId.current !== newSession.userId) {
        resolvedForUserId.current = newSession.userId;
        void resolveWorkshop();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Monté une seule fois : `authRepository` est un singleton de module et
    // `resolveWorkshop` est stable (useCallback, deps []).
  }, [resolveWorkshop]);

  const register = useCallback(async (phoneE164: string, pin: string): Promise<PinAuthResult> => {
    const { error: authError } = await authRepository.register(phoneE164, pin);
    if (authError) return { ok: false, message: authError.message };
    return { ok: true };
  }, []);

  const login = useCallback(async (phoneE164: string, pin: string): Promise<PinAuthResult> => {
    const { error: authError } = await authRepository.login(phoneE164, pin);
    if (authError) return { ok: false, message: authError.message };
    return { ok: true };
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    user: session ? { id: session.userId, phoneE164: session.phoneE164 } : null,
    workshop,
    error,
    register,
    login,
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
