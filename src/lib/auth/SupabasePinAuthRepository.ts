// Pivot Gate Auth — téléphone + PIN 4 chiffres via l'Edge Function
// `tayoo-pin-auth` (register/login). La fonction dérive elle-même une
// identité Supabase Auth technique (jamais vue ici) et renvoie
// `{access_token, refresh_token}` d'une VRAIE session Supabase — jamais un
// JWT fabriqué côté front (corr. Gate Auth §22). `setSession()` est ce qui
// rend cette session réellement active pour le reste de l'app (RLS,
// `auth.uid()`, repositories cloud), exactement comme une session OTP l'était.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import type { AuthError, AuthRepository, AuthSession } from "./AuthRepository";

function toAuthSession(session: { user: { id: string; phone?: string | null }; expires_at?: number } | null): AuthSession | null {
  if (!session) return null;
  return {
    userId: session.user.id,
    phoneE164: session.user.phone ? `+${session.user.phone}` : null,
    expiresAt: session.expires_at ?? null,
  };
}

const GENERIC_ERRORS: Record<string, AuthError> = {
  invalid_request: { code: "invalid_phone", message: "Vérifie le numéro." },
  phone_in_use: { code: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." },
  invalid_credentials: { code: "invalid_credentials", message: "Numéro ou code incorrect." },
  locked: { code: "locked", message: "Trop d'essais. Réessaie dans quelques minutes." },
};
const FALLBACK_ERROR: AuthError = { code: "unknown", message: "Connexion impossible. Réessaie." };

/** Traduit la réponse d'erreur de `tayoo-pin-auth` (voir son `index.ts` pour
 * le contrat exact `{error, message}`) vers un `AuthError` UI — jamais de
 * jargon technique exposé (corr. Gate Auth §18). */
async function toAuthError(raw: unknown): Promise<AuthError> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { code: "offline", message: "Pas de connexion Internet. Vérifie ta connexion et réessaie." };
  }
  if (raw instanceof FunctionsHttpError) {
    try {
      const body = (await raw.context.json()) as { error?: string; message?: string };
      if (body.error && body.error in GENERIC_ERRORS) return GENERIC_ERRORS[body.error];
      return { code: "unknown", message: body.message ?? FALLBACK_ERROR.message };
    } catch {
      return FALLBACK_ERROR;
    }
  }
  const name = (raw as { name?: string } | null)?.name;
  if (name === "FunctionsFetchError" || name === "AuthRetryableFetchError") {
    return { code: "service_unreachable", message: "Impossible de joindre le service. Vérifie ta connexion puis réessaie." };
  }
  return FALLBACK_ERROR;
}

async function callPinAuth(action: "register" | "login", phoneE164: string, pin: string): Promise<{ session: AuthSession | null; error: AuthError | null }> {
  const { data, error } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>("tayoo-pin-auth", {
    body: { action, phone: phoneE164, pin },
  });
  if (error) return { session: null, error: await toAuthError(error) };
  if (!data?.access_token || !data?.refresh_token) return { session: null, error: FALLBACK_ERROR };

  const { data: setData, error: setError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setError || !setData.session) return { session: null, error: FALLBACK_ERROR };
  return { session: toAuthSession(setData.session), error: null };
}

export class SupabasePinAuthRepository implements AuthRepository {
  async register(phoneE164: string, pin: string) {
    return callPinAuth("register", phoneE164, pin);
  }

  async login(phoneE164: string, pin: string) {
    return callPinAuth("login", phoneE164, pin);
  }

  async getSession(): Promise<AuthSession | null> {
    const { data } = await supabase.auth.getSession();
    return toAuthSession(data.session);
  }

  subscribeToAuthChanges(callback: (session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(toAuthSession(session));
    });
    return () => data.subscription.unsubscribe();
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut({ scope: "local" });
  }

  async signOutAllDevices(): Promise<void> {
    await supabase.auth.signOut({ scope: "global" });
  }
}
