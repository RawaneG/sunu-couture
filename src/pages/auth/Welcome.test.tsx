import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Welcome from "./Welcome";

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">{JSON.stringify(location.state)}</div>;
}

function renderWelcome(initialState?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connexion", state: initialState }]}>
      <Routes>
        <Route path="/connexion" element={<Welcome />} />
        <Route path="/connexion/numero" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Welcome — écran d'entrée (corr. Gate Auth §5/§42/§65)", () => {
  it("affiche la promesse courte et les deux actions, aucun jargon", () => {
    renderWelcome();
    expect(screen.getByText("Bienvenue sur Tayoo")).toBeInTheDocument();
    expect(screen.getByText("Ton carnet, toujours avec toi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commencer" })).toBeInTheDocument();
    expect(screen.getByText("J'ai déjà un code")).toBeInTheDocument();
    expect(screen.queryByText(/atelier/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/organisation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument();
  });

  it("'Commencer' navigue vers le numéro en mode inscription", async () => {
    const user = userEvent.setup();
    renderWelcome();
    await user.click(screen.getByRole("button", { name: "Commencer" }));
    expect(JSON.parse(screen.getByTestId("probe").textContent!)).toMatchObject({ mode: "register" });
  });

  it("'J'ai déjà un code' navigue vers le numéro en mode connexion", async () => {
    const user = userEvent.setup();
    renderWelcome();
    await user.click(screen.getByText("J'ai déjà un code"));
    expect(JSON.parse(screen.getByTestId("probe").textContent!)).toMatchObject({ mode: "login" });
  });

  it("propage la route protégée initialement demandée (from) vers l'étape suivante — jamais perdue", async () => {
    const user = userEvent.setup();
    renderWelcome({ from: { pathname: "/clients/nouveau" } });
    await user.click(screen.getByRole("button", { name: "Commencer" }));
    expect(JSON.parse(screen.getByTestId("probe").textContent!)).toMatchObject({ from: { pathname: "/clients/nouveau" } });
  });
});
