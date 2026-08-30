// Abstraction d'authentification — les écrans ne parlent jamais directement à
// Supabase Auth. Aujourd'hui : SupabasePhoneOtpAuthRepository (téléphone +
// OTP, décision D5). Une implémentation Magic Link reste possible plus tard
// SANS changer cette interface ni les écrans (un seul parcours UI existe pour
// l'instant : téléphone + OTP).

export interface AuthSession {
  /** Identité `auth.users.id` — jamais une donnée que le front doit fabriquer. */
  userId: string;
  phoneE164: string | null;
  /** Timestamp d'expiration de l'access token, epoch secondes. */
  expiresAt: number | null;
}

/** Erreur orientée UI : `code` pour la logique, `message` déjà en français simple. */
export interface AuthError {
  code:
    | "invalid_phone"
    | "otp_send_failed"
    | "otp_invalid"
    | "otp_expired"
    | "rate_limited"
    | "offline"
    | "service_unreachable"
    | "unknown";
  message: string;
}

export interface AuthRepository {
  /** Envoie un code par SMS au numéro E.164 donné. */
  sendPhoneOtp(phoneE164: string): Promise<{ error: AuthError | null }>;

  /** Vérifie le code reçu ; ouvre une session si valide. */
  verifyPhoneOtp(
    phoneE164: string,
    code: string,
  ): Promise<{ session: AuthSession | null; error: AuthError | null }>;

  /** Session actuelle si elle existe (relecture au démarrage de l'app). */
  getSession(): Promise<AuthSession | null>;

  /** S'abonne aux changements de session ; renvoie une fonction de désabonnement. */
  subscribeToAuthChanges(callback: (session: AuthSession | null) => void): () => void;

  /** Déconnecte uniquement cet appareil. */
  signOut(): Promise<void>;

  /** Révoque les refresh tokens sur tous les appareils (D5) — le jeton d'accès
   * courant d'un autre appareil peut rester valide jusqu'à son expiration. */
  signOutAllDevices(): Promise<void>;
}
