import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock du client centralisé AVANT l'import du repository (hoisted par vitest) :
// aucun test ici ne doit toucher un vrai réseau ou une vraie instance Supabase.
const mockAuth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("../supabase/client", () => ({
  supabase: { auth: mockAuth },
}));

const { SupabasePhoneOtpAuthRepository } = await import("./SupabasePhoneOtpAuthRepository");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SupabasePhoneOtpAuthRepository", () => {
  it("sendPhoneOtp appelle signInWithOtp avec le téléphone E.164", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { error } = await repo.sendPhoneOtp("+221770000001");

    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ phone: "+221770000001" });
    expect(mockAuth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(error).toBeNull();
  });

  it("sendPhoneOtp mappe une erreur réseau (service injoignable, ex. connexion refusée) en code service_unreachable", async () => {
    // Reproduit ce que supabase-js lève réellement quand le `fetch` échoue
    // (ERR_CONNECTION_REFUSED, DNS, timeout…) : `AuthRetryableFetchError`,
    // distincte d'un refus applicatif (numéro invalide, SMS non envoyé...).
    // `navigator.onLine` reste `true` dans ce scénario (l'appareil a bien
    // Internet, c'est le service Supabase local qui est arrêté) — le test
    // vérifie donc que le code ne s'appuie pas sur `navigator.onLine` ici.
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
    });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { error } = await repo.sendPhoneOtp("+221770000001");

    expect(error?.code).toBe("service_unreachable");
    expect(error?.message).toBe("Impossible de joindre le service. Vérifie ta connexion puis réessaie.");
  });

  it("sendPhoneOtp mappe un rejet serveur du format du numéro (validation_failed) en code invalid_phone", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { name: "AuthApiError", code: "validation_failed", status: 400, message: "Invalid phone number format" },
    });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { error } = await repo.sendPhoneOtp("+221770000001");

    expect(error?.code).toBe("invalid_phone");
    expect(error?.message).not.toMatch(/joindre le service/);
  });

  it("sendPhoneOtp mappe un échec d'envoi SMS (sms_send_failed) en message générique distinct du réseau et du numéro", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({
      error: { name: "AuthApiError", code: "sms_send_failed", status: 422, message: "Error sending confirmation OTP to provider" },
    });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { error } = await repo.sendPhoneOtp("+221770000001");

    expect(error?.code).toBe("otp_send_failed");
    expect(error?.message).not.toMatch(/joindre le service/);
    expect(error?.message).not.toMatch(/numéro/);
  });

  it("verifyPhoneOtp appelle verifyOtp avec type:'sms' et renvoie une session mappée", async () => {
    mockAuth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-1", phone: "221770000001" },
          expires_at: 1234567890,
        },
      },
      error: null,
    });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { session, error } = await repo.verifyPhoneOtp("+221770000001", "123456");

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      phone: "+221770000001",
      token: "123456",
      type: "sms",
    });
    expect(error).toBeNull();
    expect(session).toEqual({ userId: "user-1", phoneE164: "+221770000001", expiresAt: 1234567890 });
  });

  it("verifyPhoneOtp mappe une erreur en AuthError avec code otp_invalid", async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Token has expired or is invalid" } });
    const repo = new SupabasePhoneOtpAuthRepository();

    const { session, error } = await repo.verifyPhoneOtp("+221770000001", "000000");

    expect(session).toBeNull();
    expect(error?.code).toBe("otp_invalid");
  });

  it("getSession lit supabase.auth.getSession() et mappe le résultat", async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-2", phone: null }, expires_at: 999 } },
    });
    const repo = new SupabasePhoneOtpAuthRepository();

    const session = await repo.getSession();

    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
    expect(session).toEqual({ userId: "user-2", phoneE164: null, expiresAt: 999 });
  });

  it("getSession renvoie null si aucune session", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    const repo = new SupabasePhoneOtpAuthRepository();

    expect(await repo.getSession()).toBeNull();
  });

  it("subscribeToAuthChanges s'abonne à onAuthStateChange et renvoie un désabonnement", () => {
    const unsubscribe = vi.fn();
    mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    const repo = new SupabasePhoneOtpAuthRepository();
    const callback = vi.fn();

    const unsub = repo.subscribeToAuthChanges(callback);
    expect(mockAuth.onAuthStateChange).toHaveBeenCalledTimes(1);

    // Simule un événement émis par Supabase : le callback doit recevoir une
    // session déjà mappée au format AuthSession.
    const handler = mockAuth.onAuthStateChange.mock.calls[0][0];
    handler("SIGNED_IN", { user: { id: "user-3", phone: "221770000009" }, expires_at: 42 });
    expect(callback).toHaveBeenCalledWith({ userId: "user-3", phoneE164: "+221770000009", expiresAt: 42 });

    unsub();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("signOut (déconnexion locale) appelle signOut avec scope:'local'", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    const repo = new SupabasePhoneOtpAuthRepository();

    await repo.signOut();

    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it("signOutAllDevices (déconnexion globale) appelle signOut avec scope:'global'", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    const repo = new SupabasePhoneOtpAuthRepository();

    await repo.signOutAllDevices();

    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });
});
