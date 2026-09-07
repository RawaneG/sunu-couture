import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PinCreate from "./PinCreate";

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">{JSON.stringify(location.state)}</div>;
}

function renderPinCreate(state?: { phoneE164?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connexion/creer-code", state }]}>
      <Routes>
        <Route path="/connexion/creer-code" element={<PinCreate />} />
        <Route path="/connexion/confirmer-code" element={<Probe />} />
        <Route path="/connexion/numero" element={<div>ÉCRAN NUMÉRO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PinCreate — choix du PIN (corr. Gate Auth §44)", () => {
  it("refresh-safe : sans numéro en state -> retour à l'étape numéro, jamais un écran mort", async () => {
    renderPinCreate();
    await waitFor(() => expect(screen.getByText("ÉCRAN NUMÉRO")).toBeInTheDocument());
  });

  it("affiche le titre simple et le pavé, sans jargon", () => {
    renderPinCreate({ phoneE164: "+221770000001" });
    expect(screen.getByText("Choisis ton code")).toBeInTheDocument();
    expect(screen.queryByText(/complexe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mot de passe/i)).not.toBeInTheDocument();
  });

  it("dès le 4e chiffre, avance automatiquement vers la confirmation avec {phoneE164, pin}", async () => {
    vi.useFakeTimers();
    try {
      renderPinCreate({ phoneE164: "+221770000001" });
      fireEvent.change(screen.getByLabelText("Choisis ton code"), { target: { value: "1234" } });
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(screen.getByTestId("probe")).toBeInTheDocument());
      expect(JSON.parse(screen.getByTestId("probe").textContent!)).toMatchObject({ phoneE164: "+221770000001", pin: "1234" });
    } finally {
      vi.useRealTimers();
    }
  });
});
