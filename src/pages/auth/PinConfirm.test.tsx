import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PinConfirm from "./PinConfirm";

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">app métier — {JSON.stringify(location.pathname)}</div>;
}

function renderPinConfirm(state?: { phoneE164?: string; pin?: string }, initialPath = "/connexion/confirmer-code") {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route path="/connexion/confirmer-code" element={<PinConfirm />} />
        <Route path="/connexion/numero" element={<div>ÉCRAN NUMÉRO</div>} />
        <Route path="/" element={<Probe />} />
        <Route path="/clients/nouveau" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("PinConfirm — confirmation du PIN (corr. Gate Auth §45)", () => {
  it("refresh-safe : sans {phoneE164, pin} en state -> retour à l'étape numéro", async () => {
    renderPinConfirm();
    await waitFor(() => expect(screen.getByText("ÉCRAN NUMÉRO")).toBeInTheDocument());
  });

  it("codes différents -> message simple, reste sur cet écran (jamais un retour au numéro), register() jamais appelé", async () => {
    renderPinConfirm({ phoneE164: "+221770000001", pin: "1234" });
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "5678" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Les codes ne sont pas les mêmes. Recommence.");
    expect(screen.getByText("Encore une fois")).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("codes identiques -> register() appelé exactement une fois, puis navigation vers l'app métier", async () => {
    mockRegister.mockResolvedValue({ ok: true });
    renderPinConfirm({ phoneE164: "+221770000001", pin: "1234" });
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith("+221770000001", "1234");
  });

  it("register() rejeté (ex. numéro déjà utilisé) -> message affiché, reste sur cet écran", async () => {
    mockRegister.mockResolvedValue({ ok: false, message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." });
    renderPinConfirm({ phoneE164: "+221770000001", pin: "1234" });
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Ce numéro est déjà utilisé");
    expect(screen.getByText("Encore une fois")).toBeInTheDocument();
  });

  it("RÉGRESSION — aucune boucle de soumission : register() n'est appelé qu'une seule fois même après le passage par l'écran de chargement (corr. bug remount PinPad)", async () => {
    let resolveRegister!: (v: { ok: true }) => void;
    mockRegister.mockReturnValue(new Promise((r) => (resolveRegister = r)));

    renderPinConfirm({ phoneE164: "+221770000001", pin: "1234" });
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    // Pendant la soumission : écran de chargement, <PinPad> démonté.
    expect(await screen.findByText("On prépare ton carnet…")).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    resolveRegister({ ok: true });
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());

    // Toujours un seul appel — jamais rappelé en boucle.
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("affiche un état de chargement accessible pendant l'inscription, jamais un spinner muet", async () => {
    let resolveRegister!: (v: { ok: true }) => void;
    mockRegister.mockReturnValue(new Promise((r) => (resolveRegister = r)));
    renderPinConfirm({ phoneE164: "+221770000001", pin: "1234" });
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("On prépare ton carnet…");
    resolveRegister({ ok: true });
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
  });
});
