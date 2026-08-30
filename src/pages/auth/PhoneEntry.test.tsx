import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhoneEntry from "./PhoneEntry";

const { mockSendPhoneOtp } = vi.hoisted(() => ({ mockSendPhoneOtp: vi.fn() }));
vi.mock("../../lib/auth/SupabasePhoneOtpAuthRepository", () => ({
  SupabasePhoneOtpAuthRepository: vi.fn().mockImplementation(function mockRepoCtor(this: { sendPhoneOtp: typeof mockSendPhoneOtp }) {
    this.sendPhoneOtp = mockSendPhoneOtp;
  }),
}));

function renderPhoneEntry() {
  return render(
    <MemoryRouter initialEntries={["/connexion"]}>
      <Routes>
        <Route path="/connexion" element={<PhoneEntry />} />
        <Route path="/connexion/code" element={<div>ÉCRAN CODE OTP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhoneEntry — saisie téléphone", () => {
  it("affiche l'indicatif +221 et un champ inputMode='tel'", () => {
    renderPhoneEntry();
    expect(screen.getByText("+221")).toBeInTheDocument();
    const input = screen.getByLabelText("Numéro de téléphone");
    expect(input).toHaveAttribute("inputMode", "tel");
  });

  it("désactive le bouton principal tant que le numéro est invalide", async () => {
    const user = userEvent.setup();
    renderPhoneEntry();
    const button = screen.getByRole("button", { name: /recevoir mon code/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Numéro de téléphone"), "770");
    expect(button).toBeDisabled();
  });

  it("active le bouton et normalise le numéro une fois valide", async () => {
    const user = userEvent.setup();
    renderPhoneEntry();
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    expect(screen.getByRole("button", { name: /recevoir mon code/i })).toBeEnabled();
  });

  it("appelle sendPhoneOtp avec le numéro E.164 et navigue vers l'écran OTP", async () => {
    mockSendPhoneOtp.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPhoneEntry();

    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: /recevoir mon code/i }));

    await waitFor(() => expect(mockSendPhoneOtp).toHaveBeenCalledWith("+221770000001"));
    await waitFor(() => expect(screen.getByText("ÉCRAN CODE OTP")).toBeInTheDocument());
  });

  it("affiche une erreur accessible (role=alert) si l'envoi échoue", async () => {
    mockSendPhoneOtp.mockResolvedValue({ error: { code: "otp_send_failed", message: "Impossible d'envoyer le code. Vérifie le numéro et réessaie." } });
    const user = userEvent.setup();
    renderPhoneEntry();

    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: /recevoir mon code/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible d'envoyer le code");
  });

  it("n'affiche jamais une icône seule sans texte sur le bouton principal", () => {
    renderPhoneEntry();
    expect(screen.getByRole("button", { name: /recevoir mon code/i }).textContent?.trim().length).toBeGreaterThan(0);
  });
});
