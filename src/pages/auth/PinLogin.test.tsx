import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PinLogin from "./PinLogin";

const { mockLogin } = vi.hoisted(() => ({ mockLogin: vi.fn() }));
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">app métier — {JSON.stringify(location.pathname)}</div>;
}

function renderPinLogin(state?: { phoneE164?: string }, initialPath = "/connexion/code") {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route path="/connexion/code" element={<PinLogin />} />
        <Route path="/connexion" element={<div>ÉCRAN ACCUEIL</div>} />
        <Route path="/connexion/numero" element={<div>ÉCRAN NUMÉRO</div>} />
        <Route path="/" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("PinLogin — connexion via PIN (corr. Gate Auth §6/§34/§46/§48)", () => {
  it("refresh-safe : sans numéro (ni state, ni mémorisé) -> retour à l'accueil", async () => {
    renderPinLogin();
    await waitFor(() => expect(screen.getByText("ÉCRAN ACCUEIL")).toBeInTheDocument());
  });

  it("numéro fraîchement saisi (state) -> titre générique, pas de numéro affiché, pas de lien 'Ce n'est pas mon numéro'", () => {
    renderPinLogin({ phoneE164: "+221770000001" });
    expect(screen.getByText("Entre ton code")).toBeInTheDocument();
    expect(screen.queryByText("Bon retour")).not.toBeInTheDocument();
    expect(screen.queryByText(/ce n'est pas mon numéro/i)).not.toBeInTheDocument();
  });

  it("numéro mémorisé (appareil reconnu) -> 'Bon retour', numéro partiellement masqué, lien présent", () => {
    localStorage.setItem("tayoo:last-phone", "+221770000099");
    renderPinLogin();
    expect(screen.getByText("Bon retour")).toBeInTheDocument();
    expect(screen.getByText(/77 •• •• •• 9/)).toBeInTheDocument();
    expect(screen.getByText(/ce n'est pas mon numéro/i)).toBeInTheDocument();
  });

  it("'Ce n'est pas mon numéro' efface la mémoire et retourne au numéro", async () => {
    localStorage.setItem("tayoo:last-phone", "+221770000099");
    const user = userEvent.setup();
    renderPinLogin();
    await user.click(screen.getByText(/ce n'est pas mon numéro/i));
    expect(screen.getByText("ÉCRAN NUMÉRO")).toBeInTheDocument();
    expect(localStorage.getItem("tayoo:last-phone")).toBeNull();
  });

  it("PIN correct -> login() appelé une fois, navigation vers l'app métier, numéro mémorisé", async () => {
    mockLogin.mockResolvedValue({ ok: true });
    renderPinLogin({ phoneE164: "+221770000001" });
    fireEvent.change(screen.getByLabelText("Entre ton code"), { target: { value: "1234" } });

    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith("+221770000001", "1234");
    expect(localStorage.getItem("tayoo:last-phone")).toBe("+221770000001");
  });

  it("PIN incorrect -> message générique 'Numéro ou code incorrect.', reste sur l'écran", async () => {
    mockLogin.mockResolvedValue({ ok: false, message: "Numéro ou code incorrect." });
    renderPinLogin({ phoneE164: "+221770000001" });
    fireEvent.change(screen.getByLabelText("Entre ton code"), { target: { value: "0000" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Numéro ou code incorrect.");
    expect(screen.getByText("Entre ton code")).toBeInTheDocument();
  });

  it("verrouillage -> message générique de blocage, jamais de détail technique", async () => {
    mockLogin.mockResolvedValue({ ok: false, message: "Trop d'essais. Réessaie dans quelques minutes." });
    renderPinLogin({ phoneE164: "+221770000001" });
    fireEvent.change(screen.getByLabelText("Entre ton code"), { target: { value: "0000" } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Trop d'essais. Réessaie dans quelques minutes.");
    expect(alert.textContent).not.toMatch(/PostgREST|JWT|Supabase|Edge Function|HTTP|500/i);
  });

  it("RÉGRESSION — aucune boucle de soumission : login() n'est appelé qu'une seule fois même après le passage par l'écran de chargement", async () => {
    let resolveLogin!: (v: { ok: true }) => void;
    mockLogin.mockReturnValue(new Promise((r) => (resolveLogin = r)));

    renderPinLogin({ phoneE164: "+221770000001" });
    fireEvent.change(screen.getByLabelText("Entre ton code"), { target: { value: "1234" } });

    expect(await screen.findByText("Connexion…")).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin({ ok: true });
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it("'Code oublié ?' ouvre un texte simple d'assistance, ne propose jamais de réinitialisation automatique du PIN", async () => {
    const user = userEvent.setup();
    renderPinLogin({ phoneE164: "+221770000001" });
    await user.click(screen.getByText("Code oublié ?"));
    expect(screen.getByText(/assistance tayoo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouveau code|réinitialiser/i })).not.toBeInTheDocument();
  });
});
