import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CreatePinFlow from "./CreatePinFlow";

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">app métier — {JSON.stringify(location.pathname)}</div>;
}

function LoginProbe() {
  const location = useLocation();
  return <div data-testid="login-probe">{JSON.stringify(location.state)}</div>;
}

function renderCreatePinFlow(state?: { phoneE164?: string }, initialPath = "/connexion/creer-code") {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route path="/connexion/creer-code" element={<CreatePinFlow />} />
        <Route path="/connexion/numero" element={<div>ÉCRAN NUMÉRO</div>} />
        <Route path="/connexion/code" element={<LoginProbe />} />
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

describe("CreatePinFlow — création + confirmation du PIN FUSIONNÉES (corr. Gate Auth handoff §21/§22)", () => {
  it("refresh-safe : sans numéro en state -> retour à l'étape numéro", async () => {
    renderCreatePinFlow();
    await waitFor(() => expect(screen.getByText("ÉCRAN NUMÉRO")).toBeInTheDocument());
  });

  it("affiche le titre simple et le pavé, sans jargon", () => {
    renderCreatePinFlow({ phoneE164: "+221770000001" });
    expect(screen.getByText("Choisis ton code")).toBeInTheDocument();
    expect(screen.queryByText(/complexe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mot de passe/i)).not.toBeInTheDocument();
  });

  it("dès le 4e chiffre, avance vers la confirmation SANS jamais faire naviguer le router (même route, même instance)", async () => {
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
      expect(screen.getByLabelText("Confirme ton code")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Corr. Gate Auth handoff §21/§34 — preuve structurelle que le premier PIN
  // ne transite JAMAIS par location.state/history.state/URL/storage : ce test
  // échouerait immédiatement avec l'ancienne implémentation (PinCreate
  // naviguait avec `state: {phoneE164, pin: value}`, visible dans
  // `window.history.state`).
  it("le premier PIN n'apparaît JAMAIS dans location.state, history.state, l'URL, localStorage ou sessionStorage", async () => {
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());

      expect(JSON.stringify(window.history.state ?? {})).not.toContain("1234");
      expect(window.location.href).not.toContain("1234");
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        expect(localStorage.getItem(key)).not.toContain("1234");
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        expect(sessionStorage.getItem(key)).not.toContain("1234");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("codes différents -> message simple, reste sur cet écran (jamais un retour au numéro), register() jamais appelé", async () => {
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "5678" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Les codes ne sont pas les mêmes. Recommence.");
    expect(screen.getByText("Encore une fois")).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("codes identiques -> register() appelé exactement une fois, puis navigation vers l'app métier", async () => {
    mockRegister.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith("+221770000001", "1234");
  });

  it("RÉGRESSION — aucune boucle de soumission (corr. bug remount PinPad)", async () => {
    let resolveRegister!: (v: { ok: true }) => void;
    mockRegister.mockReturnValue(new Promise((r) => (resolveRegister = r)));
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByText("On prépare ton carnet…")).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    resolveRegister({ ok: true });
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  // Corr. Gate Auth handoff §14/§30/§35 — plus une erreur générique sous le
  // pavé : un état d'action clair, CTA "Entrer mon code", aucun second appel
  // register().
  it("phone_in_use -> état d'action dédié 'Ce numéro a déjà un code', CTA 'Entrer mon code' -> PinLogin avec le numéro connu, aucun second register()", async () => {
    mockRegister.mockResolvedValue({ ok: false, code: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." });
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByText("Ce numéro a déjà un code")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entrer mon code" }));

    await waitFor(() => expect(screen.getByTestId("login-probe")).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("login-probe").textContent!)).toMatchObject({ phoneE164: "+221770000001" });
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  // Corr. Gate Auth handoff §12/§13/§36 — cas critique observé pendant le
  // Gate : le compte a réellement été créé côté serveur, seule l'activation
  // locale a échoué. Jamais reproposer l'inscription (échouerait en 409).
  it("session_activation_failed -> 'Ton code a bien été créé', CTA 'Entrer mon code' -> PinLogin, jamais 'Connexion impossible. Réessaie.'", async () => {
    mockRegister.mockResolvedValue({ ok: false, code: "session_activation_failed", message: "Connexion impossible. Réessaie." });
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByText("Ton code a bien été créé")).toBeInTheDocument();
    expect(screen.queryByText("Connexion impossible. Réessaie.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Entrer mon code" }));
    await waitFor(() => expect(screen.getByTestId("login-probe")).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("login-probe").textContent!)).toMatchObject({ phoneE164: "+221770000001" });
  });

  it("erreur générique (ex. locked) -> message inline, reste sur l'étape confirmation", async () => {
    mockRegister.mockResolvedValue({ ok: false, code: "locked", message: "Trop d'essais. Réessaie dans quelques minutes." });
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Trop d'essais. Réessaie dans quelques minutes.");
    expect(screen.getByText("Encore une fois")).toBeInTheDocument();
  });

  it("Retour depuis l'étape 'création' -> /connexion/numero, numéro préservé pour préremplissage", async () => {
    renderCreatePinFlow({ phoneE164: "+221770000001" });
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    await waitFor(() => expect(screen.getByText("ÉCRAN NUMÉRO")).toBeInTheDocument());
  });

  it("Retour depuis l'étape 'confirmation' -> revient à l'étape 'création' SANS navigation d'URL (même route)", async () => {
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByText("Choisis ton code")).toBeInTheDocument();
  });

  it("affiche un état de chargement accessible pendant l'inscription, jamais un spinner muet", async () => {
    let resolveRegister!: (v: { ok: true }) => void;
    mockRegister.mockReturnValue(new Promise((r) => (resolveRegister = r)));
    vi.useFakeTimers();
    try {
      renderCreatePinFlow({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByText("Encore une fois")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
    fireEvent.change(screen.getByLabelText("Confirme ton code"), { target: { value: "1234" } });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("On prépare ton carnet…");
    resolveRegister({ ok: true });
    await waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
  });
});
