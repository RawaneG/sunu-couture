import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OtpVerify from "./OtpVerify";

const { mockVerifyPhoneOtp, mockSendPhoneOtp, mockProvisionWorkshop } = vi.hoisted(() => ({
  mockVerifyPhoneOtp: vi.fn(),
  mockSendPhoneOtp: vi.fn(),
  mockProvisionWorkshop: vi.fn(),
}));

vi.mock("../../lib/auth/SupabasePhoneOtpAuthRepository", () => ({
  SupabasePhoneOtpAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(
    this: { verifyPhoneOtp: typeof mockVerifyPhoneOtp; sendPhoneOtp: typeof mockSendPhoneOtp },
  ) {
    this.verifyPhoneOtp = mockVerifyPhoneOtp;
    this.sendPhoneOtp = mockSendPhoneOtp;
  }),
}));

vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ provisionWorkshop: mockProvisionWorkshop }),
}));

function renderOtpVerify(initialState: { phoneE164?: string } | null = { phoneE164: "+221770000001" }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connexion/code", state: initialState }]}>
      <Routes>
        <Route path="/connexion" element={<div>ÉCRAN TÉLÉPHONE</div>} />
        <Route path="/connexion/code" element={<OtpVerify />} />
        <Route path="/connexion/atelier" element={<div>ÉCRAN NOM ATELIER</div>} />
        <Route path="/" element={<div>ACCUEIL APP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OtpVerify — validation du code", () => {
  it("redirige vers /connexion si aucun numéro n'est connu (accès direct)", async () => {
    renderOtpVerify(null);
    await waitFor(() => expect(screen.getByText("ÉCRAN TÉLÉPHONE")).toBeInTheDocument());
  });

  it("affiche le numéro formaté et un champ inputMode='numeric'", () => {
    renderOtpVerify();
    expect(screen.getByText(/\+221 77 00 00 00 1/)).toBeInTheDocument();
    const input = screen.getByLabelText(/code à 6 chiffres/i);
    expect(input).toHaveAttribute("inputMode", "numeric");
    expect(input).toHaveAttribute("autoComplete", "one-time-code");
  });

  it("désactive « Vérifier le code » tant que les 6 chiffres ne sont pas saisis", async () => {
    const user = userEvent.setup();
    renderOtpVerify();
    const button = screen.getByRole("button", { name: /vérifier le code/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "123");
    expect(button).toBeDisabled();
  });

  it("affiche une erreur accessible si le code est incorrect, sans jargon technique", async () => {
    mockVerifyPhoneOtp.mockResolvedValue({ session: null, error: { code: "otp_invalid", message: "Le code est incorrect. Vérifie et réessaie." } });
    const user = userEvent.setup();
    renderOtpVerify();

    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "000000");
    await user.click(screen.getByRole("button", { name: /vérifier le code/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Le code est incorrect");
    expect(mockProvisionWorkshop).not.toHaveBeenCalled();
  });

  it("code valide + atelier déjà existant → connexion terminée directement (pas d'écran nom d'atelier)", async () => {
    mockVerifyPhoneOtp.mockResolvedValue({ session: { userId: "u1", phoneE164: "+221770000001", expiresAt: 1 }, error: null });
    mockProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Atelier X" } });
    const user = userEvent.setup();
    renderOtpVerify();

    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "123456");
    await user.click(screen.getByRole("button", { name: /vérifier le code/i }));

    await waitFor(() => expect(screen.getByText("ACCUEIL APP")).toBeInTheDocument());
    expect(screen.queryByText("ÉCRAN NOM ATELIER")).not.toBeInTheDocument();
  });

  it("code valide + AUCUN atelier existant (nouvel utilisateur) → écran nom d'atelier", async () => {
    mockVerifyPhoneOtp.mockResolvedValue({ session: { userId: "u2", phoneE164: "+221770000001", expiresAt: 1 }, error: null });
    mockProvisionWorkshop.mockResolvedValue({ kind: "name_required" });
    const user = userEvent.setup();
    renderOtpVerify();

    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "123456");
    await user.click(screen.getByRole("button", { name: /vérifier le code/i }));

    await waitFor(() => expect(screen.getByText("ÉCRAN NOM ATELIER")).toBeInTheDocument());
  });

  it("code valide mais résolution d'atelier hors ligne → message hors ligne affiché, pas de navigation", async () => {
    mockVerifyPhoneOtp.mockResolvedValue({ session: { userId: "u3", phoneE164: "+221770000001", expiresAt: 1 }, error: null });
    mockProvisionWorkshop.mockResolvedValue({ kind: "error", message: "Pas de connexion Internet. Vérifie ta connexion et réessaie." });
    const user = userEvent.setup();
    renderOtpVerify();

    await user.type(screen.getByLabelText(/code à 6 chiffres/i), "123456");
    await user.click(screen.getByRole("button", { name: /vérifier le code/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Pas de connexion Internet");
    expect(screen.queryByText("ACCUEIL APP")).not.toBeInTheDocument();
    expect(screen.queryByText("ÉCRAN NOM ATELIER")).not.toBeInTheDocument();
  });

  it("minuterie de renvoi : bouton désactivé au départ, se réactive après le délai", async () => {
    vi.useFakeTimers();
    mockSendPhoneOtp.mockResolvedValue({ error: null });
    renderOtpVerify();

    const resend = screen.getByRole("button", { name: /renvoyer le code/i });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent(/\(60s\)/);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(screen.getByRole("button", { name: /renvoyer le code/i })).toBeEnabled();

    vi.useRealTimers();
  });

  it("permet de modifier le numéro (retour à l'écran 1)", async () => {
    const user = userEvent.setup();
    vi.useRealTimers();
    renderOtpVerify();
    await user.click(screen.getByRole("button", { name: /modifier le numéro/i }));
    await waitFor(() => expect(screen.getByText("ÉCRAN TÉLÉPHONE")).toBeInTheDocument());
  });
});
