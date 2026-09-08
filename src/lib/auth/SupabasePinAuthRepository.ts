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
/** Distinct de `FALLBACK_ERROR` (corr. Gate Auth handoff §7/§11/§12) : l'Edge
 * Function a RÉELLEMENT réussi (compte/session créés serveur, ou identifiants
 * vérifiés) — seule l'activation LOCALE de la session a échoué
 * (`setSession()`). Le message reste générique ici (traduit par écran dans
 * `PinAuthResult.code`) ; jamais reproposer `register()` sur ce numéro (qui
 * échouerait en `phone_in_use`, corr. §12 — impasse observée pendant le Gate). */
const SESSION_ACTIVATION_FAILED: AuthError = { code: "session_activation_failed", message: "Connexion impossible. Réessaie." };

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
      // Ne JAMAIS afficher `body.message` tel quel (corr. Gate Auth §18) : une
      // erreur HTTP peut venir d'une couche intermédiaire (passerelle/Kong,
      // ex. panne du conteneur Edge Function -> "name resolution failed")
      // plutôt que de `tayoo-pin-auth` lui-même — un `code` reconnu ci-dessus
      // est le SEUL cas où le texte affiché est garanti vérifié/français.
      return FALLBACK_ERROR;
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
  // Le serveur a RÉELLEMENT réussi (tokens reçus ci-dessus) — un échec ICI est
  // une panne d'ACTIVATION locale de la session, jamais un échec d'inscription/
  // connexion côté serveur (corr. Gate Auth handoff §7/§11/§12 : bug observé
  // pendant le Gate, cause exacte non prouvée à distance — voir rapport de
  // diagnostic — mais ce cas DOIT être distingué quel qu'en soit la cause).
  if (setError || !setData.session) return { session: null, error: SESSION_ACTIVATION_FAILED };
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
