import { describe, expect, it, vi, beforeEach } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { SupabasePinAuthRepository } from "./SupabasePinAuthRepository";

const { mockInvoke, mockSetSession, mockGetSession, mockOnAuthStateChange, mockSignOut } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockSetSession: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  mockSignOut: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    auth: {
      setSession: mockSetSession,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
  },
}));

function fakeSession(overrides: Record<string, unknown> = {}) {
  return { user: { id: "u1", phone: "221770000001" }, expires_at: 9999999999, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("SupabasePinAuthRepository — register()", () => {
  it("succès -> setSession() appelé avec les tokens reçus, session réelle renvoyée", async () => {
    mockInvoke.mockResolvedValue({ data: { access_token: "at-1", refresh_token: "rt-1" }, error: null });
    mockSetSession.mockResolvedValue({ data: { session: fakeSession() }, error: null });

    const repo = new SupabasePinAuthRepository();
    const { session, error } = await repo.register("+221770000001", "1234");

    expect(mockInvoke).toHaveBeenCalledWith("tayoo-pin-auth", { body: { action: "register", phone: "+221770000001", pin: "1234" } });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });
    expect(error).toBeNull();
    expect(session?.userId).toBe("u1");
  });

  it("phone_in_use -> AuthError code phone_in_use, message dédié", async () => {
    const httpError = new FunctionsHttpError({ json: async () => ({ error: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." }) } as unknown as Response);
    mockInvoke.mockResolvedValue({ data: null, error: httpError });

    const repo = new SupabasePinAuthRepository();
    const { session, error } = await repo.register("+221770000001", "1234");

    expect(session).toBeNull();
    expect(error?.code).toBe("phone_in_use");
    expect(error?.message).toBe("Ce numéro est déjà utilisé. Choisis « J'ai déjà un code ».");
  });

  it("jamais de jargon technique dans le message d'erreur générique", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("boom") });
    const repo = new SupabasePinAuthRepository();
    const { error } = await repo.register("+221770000001", "1234");
    expect(error?.message).not.toMatch(/PostgREST|JWT|Supabase|Edge Function|500/i);
  });

  // Corr. Gate Auth handoff §7/§11/§12/§36 — bug observé pendant le Gate : le
  // serveur RÉUSSIT réellement (compte + atelier + session créés, tokens
  // reçus) mais l'ACTIVATION locale de la session échoue (`setSession()`).
  // Ce cas doit être distingué par un code dédié, jamais confondu avec un
  // échec serveur générique (qui laisserait croire à l'appelant que rien n'a
  // été créé, menant à un second `register()` -> 409 phone_in_use, l'impasse
  // observée pendant le Gate).
  it("register() réussit côté serveur (tokens reçus) mais setSession() échoue -> code 'session_activation_failed', jamais 'unknown'/générique", async () => {
    mockInvoke.mockResolvedValue({ data: { access_token: "at-1", refresh_token: "rt-1" }, error: null });
    mockSetSession.mockResolvedValue({ data: { session: null }, error: { name: "AuthApiError", status: 401, message: "invalid claim: missing sub claim" } });

    const repo = new SupabasePinAuthRepository();
    const { session, error } = await repo.register("+221770000001", "1234");

    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });
    expect(session).toBeNull();
    expect(error?.code).toBe("session_activation_failed");
    expect(error?.message).not.toMatch(/PostgREST|JWT|Supabase|Edge Function|AuthApiError|401|missing sub claim/i);
  });
});

describe("SupabasePinAuthRepository — login()", () => {
  it("succès -> session réelle établie via setSession()", async () => {
    mockInvoke.mockResolvedValue({ data: { access_token: "at-2", refresh_token: "rt-2" }, error: null });
    mockSetSession.mockResolvedValue({ data: { session: fakeSession({ user: { id: "u2", phone: "221770000002" } }) }, error: null });

    const repo = new SupabasePinAuthRepository();
    const { session, error } = await repo.login("+221770000002", "5678");

    expect(mockInvoke).toHaveBeenCalledWith("tayoo-pin-auth", { body: { action: "login", phone: "+221770000002", pin: "5678" } });
    expect(error).toBeNull();
    expect(session?.userId).toBe("u2");
  });

  it("invalid_credentials -> message générique 'Numéro ou code incorrect.'", async () => {
    const httpError = new FunctionsHttpError({ json: async () => ({ error: "invalid_credentials", message: "Numéro ou code incorrect." }) } as unknown as Response);
    mockInvoke.mockResolvedValue({ data: null, error: httpError });

    const repo = new SupabasePinAuthRepository();
    const { error } = await repo.login("+221770000009", "0000");
    expect(error?.code).toBe("invalid_credentials");
    expect(error?.message).toBe("Numéro ou code incorrect.");
  });

  it("locked -> message générique de verrouillage", async () => {
    const httpError = new FunctionsHttpError({ json: async () => ({ error: "locked", message: "Trop d'essais. Réessaie dans quelques minutes." }) } as unknown as Response);
    mockInvoke.mockResolvedValue({ data: null, error: httpError });

    const repo = new SupabasePinAuthRepository();
    const { error } = await repo.login("+221770000001", "0000");
    expect(error?.code).toBe("locked");
  });

  it("réponse serveur sans tokens -> erreur générique, jamais de session forgée", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    const repo = new SupabasePinAuthRepository();
    const { session, error } = await repo.login("+221770000001", "1234");
    expect(session).toBeNull();
    expect(error).not.toBeNull();
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});

describe("SupabasePinAuthRepository — session helpers (inchangés)", () => {
  it("getSession() délègue à supabase.auth.getSession()", async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession() } });
    const repo = new SupabasePinAuthRepository();
    const session = await repo.getSession();
    expect(session?.userId).toBe("u1");
  });

  it("signOut() -> scope local, signOutAllDevices() -> scope global", async () => {
    const repo = new SupabasePinAuthRepository();
    await repo.signOut();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    await repo.signOutAllDevices();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
