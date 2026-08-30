// Tests d'intégration du branchement RequireAuth sur les routes métier.
// Utilise le VRAI AuthProvider (pas un mock de useAuth) — seules les E/S
// externes (repository Auth, appel provision-workshop) sont mockées — pour
// exercer la vraie mécanique de state/redirection de bout en bout.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

const { mockGetSession, mockVerifyPhoneOtp, mockSendPhoneOtp, mockSubscribe, mockCallProvisionWorkshop, authState } = vi.hoisted(() => {
  const state: { session: { userId: string; phoneE164: string | null; expiresAt: number } | null; listeners: Array<(s: unknown) => void> } = {
    session: null,
    listeners: [],
  };
  return {
    authState: state,
    mockGetSession: vi.fn(async () => state.session),
    mockSubscribe: vi.fn((cb: (s: unknown) => void) => {
      state.listeners.push(cb);
      return () => {
        state.listeners = state.listeners.filter((l) => l !== cb);
      };
    }),
    mockVerifyPhoneOtp: vi.fn(async (phone: string, code: string) => {
      if (code !== "123456") {
        return { session: null, error: { code: "otp_invalid", message: "Le code est incorrect. Vérifie et réessaie." } };
      }
      const session = { userId: "user-routing-1", phoneE164: phone, expiresAt: 9999999999 };
      state.session = session;
      state.listeners.forEach((cb) => cb(session));
      return { session, error: null };
    }),
    mockSendPhoneOtp: vi.fn(async () => ({ error: null })),
    mockCallProvisionWorkshop: vi.fn(),
  };
});

vi.mock("./lib/auth/SupabasePhoneOtpAuthRepository", () => ({
  SupabasePhoneOtpAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(this: {
    getSession: typeof mockGetSession;
    subscribeToAuthChanges: typeof mockSubscribe;
    verifyPhoneOtp: typeof mockVerifyPhoneOtp;
    sendPhoneOtp: typeof mockSendPhoneOtp;
    signOut: () => Promise<void>;
    signOutAllDevices: () => Promise<void>;
  }) {
    this.getSession = mockGetSession;
    this.subscribeToAuthChanges = mockSubscribe;
    this.verifyPhoneOtp = mockVerifyPhoneOtp;
    this.sendPhoneOtp = mockSendPhoneOtp;
    this.signOut = vi.fn();
    this.signOutAllDevices = vi.fn();
  }),
}));

vi.mock("./lib/workshop/provisionWorkshop", () => ({
  callProvisionWorkshop: (...args: unknown[]) => mockCallProvisionWorkshop(...args),
}));

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.session = null;
  authState.listeners = [];
});

describe("Protection des routes métier (RequireAuth branché)", () => {
  it("accès direct à une route métier SANS session -> redirection vers /connexion", async () => {
    renderAppAt("/clients/nouveau");
    await waitFor(() => expect(screen.getByText(/ton numéro de téléphone/i)).toBeInTheDocument());
    expect(screen.queryByText(/nouveau client/i)).not.toBeInTheDocument();
  });

  it("session existante SANS atelier -> redirection vers /connexion/atelier", async () => {
    authState.session = { userId: "u-no-ws", phoneE164: "+221770000001", expiresAt: 9999999999 };
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "name_required" });
    renderAppAt("/");
    await waitFor(() => expect(screen.getByText(/dernière étape/i)).toBeInTheDocument());
  });

  it("session existante AVEC atelier -> accès direct à la route métier demandée", async () => {
    authState.session = { userId: "u-with-ws", phoneE164: "+221770000002", expiresAt: 9999999999 };
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Atelier X" } });
    renderAppAt("/clients/nouveau");
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument());
    // Un seul appel de sonde (name: null) au chargement — jamais de re-création.
    expect(mockCallProvisionWorkshop).toHaveBeenCalledTimes(1);
    expect(mockCallProvisionWorkshop).toHaveBeenCalledWith(null);
  });

  it("parcours complet : route protégée -> connexion -> OTP -> retour à la route d'origine", async () => {
    mockCallProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w2", name: "Atelier Restauré" } });
    const user = userEvent.setup();
    renderAppAt("/clients/nouveau");

    // 1) redirigé vers /connexion (route d'origine mémorisée)
    await waitFor(() => expect(screen.getByLabelText(/numéro de téléphone/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/numéro de téléphone/i), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: /recevoir mon code/i }));

    // 2) écran OTP
    await waitFor(() => expect(screen.getByLabelText(/code à 6 chiffres/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "123456");
    await user.click(screen.getByRole("button", { name: /vérifier le code/i }));

    // 3) de retour sur /clients/nouveau (route initialement demandée), pas l'accueil
    await waitFor(() => expect(screen.getByPlaceholderText("Nom du client")).toBeInTheDocument());
  });

  it("aucune navigation métier (Sidebar/BottomNav) sur les 3 routes d'authentification", async () => {
    for (const path of ["/connexion", "/connexion/code", "/connexion/atelier"]) {
      const { unmount } = renderAppAt(path === "/connexion/code" ? "/connexion" : path);
      if (path === "/connexion/code") {
        const user = userEvent.setup();
        await user.type(screen.getByLabelText(/numéro de téléphone/i), "77 000 00 02");
        await user.click(screen.getByRole("button", { name: /recevoir mon code/i }));
        await waitFor(() => expect(screen.getByLabelText(/code à 6 chiffres/i)).toBeInTheDocument());
      }
      // Les libellés de nav métier ("Accueil", "Clients", "Catalogue", "Commandes")
      // ne doivent apparaître nulle part sur ces routes.
      for (const label of ["Accueil", "Commandes", "Catalogue"]) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it("aucun champ ni bouton masqué (aria-hidden) sur l'écran de connexion", async () => {
    renderAppAt("/connexion");
    const input = screen.getByLabelText(/numéro de téléphone/i);
    const button = screen.getByRole("button", { name: /recevoir mon code/i });
    expect(input).not.toHaveAttribute("aria-hidden");
    expect(button).not.toHaveAttribute("aria-hidden");
    expect(input).not.toHaveAttribute("hidden");
    expect(button).not.toHaveAttribute("hidden");
    // toBeVisible() attend la fin de l'animation d'entrée (framer-motion :
    // opacity 0 -> 1) avant de conclure — sinon faux négatif au premier tick.
    await waitFor(() => expect(input).toBeVisible());
    await waitFor(() => expect(button).toBeVisible());
  });
});
