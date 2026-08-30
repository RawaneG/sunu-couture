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

/** Mappe une erreur Supabase Auth (ou une erreur réseau) vers un message FR simple. */
function toAuthError(raw: unknown, fallbackCode: AuthError["code"]): AuthError {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { code: "offline", message: "Pas de connexion Internet. Vérifie ta connexion et réessaie." };
  }

  // `navigator.onLine` ne détecte que l'absence totale de connexion réseau de
  // l'appareil — il reste `true` quand Internet fonctionne mais que le
  // service (Supabase local arrêté, service distant injoignable, timeout,
  // erreur 5xx) ne répond pas. supabase-js distingue ce cas précisément :
  // `AuthRetryableFetchError` est levée quand le `fetch` lui-même échoue
  // (ex. ERR_CONNECTION_REFUSED, DNS, CORS) ou que le serveur répond en 5xx —
  // jamais pour un refus applicatif (numéro invalide, code faux, etc.).
  const name = (raw as { name?: string } | null)?.name;
  if (name === "AuthRetryableFetchError") {
    return {
      code: "service_unreachable",
      message: "Impossible de joindre le service. Vérifie ta connexion puis réessaie.",
    };
  }

  const status = (raw as { status?: number } | null)?.status;
  const code = (raw as { code?: string } | null)?.code;

  if (status === 429 || code === "over_sms_send_rate_limit" || code === "over_request_rate_limit") {
    return {
      code: "rate_limited",
      message: "Trop de tentatives. Attends un moment avant de recevoir un nouveau code.",
    };
  }
  if (code === "otp_expired") {
    return { code: "otp_expired", message: "Ce code a expiré. Demande un nouveau code." };
  }
  // Rejet serveur du format du numéro lui-même (défense en profondeur : le
  // format est déjà validé côté client par `normalizePhoneSenegal` avant
  // l'appel, mais le serveur reste la source de vérité).
  if (code === "validation_failed" && fallbackCode === "otp_send_failed") {
    return {
      code: "invalid_phone",
      message: "Numéro invalide. Vérifie le numéro et réessaie.",
    };
  }
  if (fallbackCode === "otp_invalid") {
    return { code: "otp_invalid", message: "Le code est incorrect. Vérifie et réessaie." };
  }
  if (fallbackCode === "otp_send_failed") {
    // Le numéro a un format valide mais l'envoi du SMS a échoué pour une
    // autre raison (ex. fournisseur SMS en échec, `sms_send_failed`) — ne
    // jamais réutiliser ici le message "vérifie le numéro", trompeur quand
    // le numéro n'est pour rien dans l'échec.
    return {
      code: "otp_send_failed",
      message: "Impossible d'envoyer le code pour le moment. Réessaie dans un instant.",
    };
  }
  return { code: "unknown", message: "Une erreur est survenue. Réessaie dans un instant." };
}

export class SupabasePhoneOtpAuthRepository implements AuthRepository {
  async sendPhoneOtp(phoneE164: string): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
    if (error) return { error: toAuthError(error, "otp_send_failed") };
    return { error: null };
  }

  async verifyPhoneOtp(
    phoneE164: string,
    code: string,
  ): Promise<{ session: AuthSession | null; error: AuthError | null }> {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: code,
      type: "sms",
    });
    if (error) return { session: null, error: toAuthError(error, "otp_invalid") };
    return { session: toAuthSession(data.session), error: null };
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

  // SÉMANTIQUE (vérifiée empiriquement en local, GoTrue) : `scope: 'global'`
  // révoque IMMÉDIATEMENT les refresh tokens de tous les appareils — un appel
  // `refreshSession()` ultérieur échoue aussitôt ("Invalid Refresh Token").
  // MAIS un access token DÉJÀ ÉMIS reste cryptographiquement valide (accepté
  // par `getClaims()`/`getUser()`) jusqu'à sa propre expiration naturelle —
  // Supabase ne tient pas de liste de révocation des JWT déjà signés. Ne
  // jamais présenter cette action dans l'UI comme une coupure réseau
  // instantanée de tous les appareils : c'est une révocation du renouvellement
  // de session, pas une invalidation immédiate du jeton en cours.
  async signOutAllDevices(): Promise<void> {
    await supabase.auth.signOut({ scope: "global" });
  }
}
