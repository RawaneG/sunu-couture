import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider";

const { mockGetSession, mockSubscribe, mockCallProvisionWorkshop } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSubscribe: vi.fn(() => () => {}),
  mockCallProvisionWorkshop: vi.fn(),
}));

vi.mock("./SupabasePhoneOtpAuthRepository", () => ({
  SupabasePhoneOtpAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(this: {
    getSession: typeof mockGetSession;
    subscribeToAuthChanges: typeof mockSubscribe;
    signOut: () => Promise<void>;
    signOutAllDevices: () => Promise<void>;
  }) {
    this.getSession = mockGetSession;
    this.subscribeToAuthChanges = mockSubscribe;
    this.signOut = vi.fn();
    this.signOutAllDevices = vi.fn();
  }),
}));

vi.mock("../workshop/provisionWorkshop", () => ({
  callProvisionWorkshop: (...args: unknown[]) => mockCallProvisionWorkshop(...args),
}));

function Probe() {
  const { initializing, session, workshop } = useAuth();
  return (
    <div>
      <span data-testid="initializing">{String(initializing)}</span>
      <span data-testid="session">{session ? session.userId : "none"}</span>
      <span data-testid="workshop">{workshop ? workshop.name : "none"}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribe.mockReturnValue(() => {});
});

describe("AuthProvider — restauration de session", () => {
  it("restaure une session existante ET résout l'atelier existant, sans en recréer un", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", phoneE164: "+221770000001", expiresAt: 1 });
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Atelier Existant" } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("initializing")).toHaveTextContent("true");

    await waitFor(() => expect(screen.getByTestId("initializing")).toHaveTextContent("false"));
    expect(screen.getByTestId("session")).toHaveTextContent("u1");
    expect(screen.getByTestId("workshop")).toHaveTextContent("Atelier Existant");

    // Sonde uniquement (name: null) — jamais un nom fourni au chargement.
    expect(mockCallProvisionWorkshop).toHaveBeenCalledWith(null);
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
  });

  it("sans session, ne tente aucune résolution d'atelier", async () => {
    mockGetSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("initializing")).toHaveTextContent("false"));
    expect(screen.getByTestId("session")).toHaveTextContent("none");
    expect(screen.getByTestId("workshop")).toHaveTextContent("none");
    expect(mockCallProvisionWorkshop).not.toHaveBeenCalled();
  });

  it("session sans atelier (nouvel utilisateur) : workshop reste null, aucune création automatique", async () => {
    mockGetSession.mockResolvedValue({ userId: "u2", phoneE164: "+221770000002", expiresAt: 1 });
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "name_required" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("initializing")).toHaveTextContent("false"));
    expect(screen.getByTestId("workshop")).toHaveTextContent("none");
    // Un seul appel de sonde — jamais de nom inventé/rejoué automatiquement.
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
  });
});
