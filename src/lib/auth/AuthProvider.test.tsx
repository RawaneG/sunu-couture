import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider";

const { mockGetSession, mockSubscribe, mockRegister, mockLogin, mockCallProvisionWorkshop } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSubscribe: vi.fn(() => () => {}),
  mockRegister: vi.fn(),
  mockLogin: vi.fn(),
  mockCallProvisionWorkshop: vi.fn(),
}));

vi.mock("./SupabasePinAuthRepository", () => ({
  SupabasePinAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(this: {
    getSession: typeof mockGetSession;
    subscribeToAuthChanges: typeof mockSubscribe;
    register: typeof mockRegister;
    login: typeof mockLogin;
    signOut: () => Promise<void>;
    signOutAllDevices: () => Promise<void>;
  }) {
    this.getSession = mockGetSession;
    this.subscribeToAuthChanges = mockSubscribe;
    this.register = mockRegister;
    this.login = mockLogin;
    this.signOut = vi.fn();
    this.signOutAllDevices = vi.fn();
  }),
}));

vi.mock("../workshop/provisionWorkshop", () => ({
  callProvisionWorkshop: (...args: unknown[]) => mockCallProvisionWorkshop(...args),
}));

function Probe() {
  const { status, session, workshop, error } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="session">{session ? session.userId : "none"}</span>
      <span data-testid="workshop">{workshop ? workshop.name : "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribe.mockReturnValue(() => {});
});

describe("AuthProvider — restauration de session (corr. Gate Auth §38)", () => {
  it("restaure une session existante ET résout l'atelier existant, sans en recréer un", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", phoneE164: "+221770000001", expiresAt: 1 });
    mockCallProvisionWorkshop.mockResolvedValue({
      kind: "workshop",
      workshop: { id: "w1", name: "Espace u1", ownerId: "u1", isDemo: false, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("initializing");

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("session")).toHaveTextContent("u1");
    expect(screen.getByTestId("workshop")).toHaveTextContent("Espace u1");

    // Sonde uniquement (name: null) — jamais un nom fourni au chargement.
    expect(mockCallProvisionWorkshop).toHaveBeenCalledWith(null);
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
  });

  it("sans session -> status signed_out, aucune résolution d'atelier", async () => {
    mockGetSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
    expect(screen.getByTestId("session")).toHaveTextContent("none");
    expect(screen.getByTestId("workshop")).toHaveTextContent("none");
    expect(mockCallProvisionWorkshop).not.toHaveBeenCalled();
  });

  it("atelier introuvable après session (filet de sécurité, ne devrait plus arriver en pratique) -> status error, jamais un blocage silencieux", async () => {
    mockGetSession.mockResolvedValue({ userId: "u2", phoneE164: "+221770000002", expiresAt: 1 });
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "name_required" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
    expect(screen.getByTestId("workshop")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).not.toHaveTextContent("none");
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
  });
});

describe("AuthProvider — register()/login() (corr. Gate Auth §38)", () => {
  it("register() délègue au repository et renvoie { ok: true } au succès", async () => {
    mockGetSession.mockResolvedValue(null);
    mockRegister.mockResolvedValue({ session: { userId: "u3", phoneE164: "+221770000003", expiresAt: 1 }, error: null });

    let auth!: ReturnType<typeof useAuth>;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    const result = await auth.register("+221770000003", "1234");
    expect(mockRegister).toHaveBeenCalledWith("+221770000003", "1234");
    expect(result).toEqual({ ok: true });
  });

  it("login() renvoie { ok: false, code, message } sur échec — jamais de jargon technique exposé, code préservé pour la logique UI (corr. Gate Auth handoff §15)", async () => {
    mockGetSession.mockResolvedValue(null);
    mockLogin.mockResolvedValue({ session: null, error: { code: "invalid_credentials", message: "Numéro ou code incorrect." } });

    let auth!: ReturnType<typeof useAuth>;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    const result = await auth.login("+221770000009", "0000");
    expect(result).toEqual({ ok: false, code: "invalid_credentials", message: "Numéro ou code incorrect." });
  });

  it("register() renvoie { ok: false, code: 'session_activation_failed' } quand le serveur a réussi mais setSession() a échoué (corr. Gate Auth handoff §12/§36) — jamais confondu avec un échec serveur générique", async () => {
    mockGetSession.mockResolvedValue(null);
    mockRegister.mockResolvedValue({ session: null, error: { code: "session_activation_failed", message: "Connexion impossible. Réessaie." } });

    let auth!: ReturnType<typeof useAuth>;
    function Capture() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());

    const result = await auth.register("+221770000003", "1234");
    expect(result).toEqual({ ok: false, code: "session_activation_failed", message: "Connexion impossible. Réessaie." });
  });
});
