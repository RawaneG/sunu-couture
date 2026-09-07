// Abstraction d'authentification — les écrans ne parlent jamais directement à
// Supabase Auth. Pivot Gate Auth : téléphone + PIN à 4 chiffres (Edge
// Function `tayoo-pin-auth`), plus de SMS OTP (`external.phone` reste
// désactivé — voir `SupabasePhoneOtpAuthRepository`, retiré du parcours actif).

export interface AuthSession {
  /** Identité `auth.users.id` — jamais une donnée que le front doit fabriquer. */
  userId: string;
  phoneE164: string | null;
  /** Timestamp d'expiration de l'access token, epoch secondes. */
  expiresAt: number | null;
}

/** Erreur orientée UI : `code` pour la logique, `message` déjà en français
 * simple — jamais de jargon technique (PostgREST/JWT/Supabase/Edge Function/
 * code HTTP/stack trace), corr. Gate Auth §18. */
export interface AuthError {
  code: "invalid_phone" | "invalid_pin" | "phone_in_use" | "invalid_credentials" | "locked" | "offline" | "service_unreachable" | "unknown";
  message: string;
}

export interface AuthRepository {
  /** Inscription : numéro + PIN choisi -> compte + atelier créés côté
   * serveur, session réelle ouverte. `phoneE164` doit déjà être normalisé
   * (voir `src/lib/phone.ts`). */
  register(phoneE164: string, pin: string): Promise<{ session: AuthSession | null; error: AuthError | null }>;

  /** Connexion : numéro + PIN existants -> session réelle si valides. */
  login(phoneE164: string, pin: string): Promise<{ session: AuthSession | null; error: AuthError | null }>;

  /** Session actuelle si elle existe (relecture au démarrage de l'app). */
  getSession(): Promise<AuthSession | null>;

  /** S'abonne aux changements de session ; renvoie une fonction de désabonnement. */
  subscribeToAuthChanges(callback: (session: AuthSession | null) => void): () => void;

  /** Déconnecte uniquement cet appareil. */
  signOut(): Promise<void>;

  /** Révoque les refresh tokens sur tous les appareils — le jeton d'accès
   * courant d'un autre appareil peut rester valide jusqu'à son expiration. */
  signOutAllDevices(): Promise<void>;
}
