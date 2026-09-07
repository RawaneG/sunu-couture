import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireAuth from "./RequireAuth";

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock("./AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/prive"]}>
      <Routes>
        <Route
          path="/prive"
          element={
            <RequireAuth>
              <div>CONTENU PROTÉGÉ</div>
            </RequireAuth>
          }
        />
        <Route path="/connexion" element={<div>ÉCRAN CONNEXION</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RequireAuth — garde de route (états AuthStatus, corr. Gate Auth §38)", () => {
  it("affiche un état de chargement accessible pendant 'initializing'", () => {
    mockUseAuth.mockReturnValue({ status: "initializing", session: null, workshop: null, error: null });
    renderGuarded();
    expect(screen.getByRole("status")).toHaveTextContent(/chargement/i);
    expect(screen.queryByText("CONTENU PROTÉGÉ")).not.toBeInTheDocument();
  });

  it("affiche un état de chargement accessible pendant 'provisioning'", () => {
    mockUseAuth.mockReturnValue({ status: "provisioning", session: { userId: "u1" }, workshop: null, error: null });
    renderGuarded();
    expect(screen.getByRole("status")).toHaveTextContent(/chargement/i);
  });

  it("redirige vers /connexion si 'signed_out'", () => {
    mockUseAuth.mockReturnValue({ status: "signed_out", session: null, workshop: null, error: null });
    renderGuarded();
    expect(screen.getByText("ÉCRAN CONNEXION")).toBeInTheDocument();
  });

  it("affiche un message d'erreur accessible si 'error' — jamais un écran mort", () => {
    mockUseAuth.mockReturnValue({ status: "error", session: { userId: "u1" }, workshop: null, error: "Ton atelier n'a pas pu être préparé. Réessaie de te connecter." });
    renderGuarded();
    expect(screen.getByRole("alert")).toHaveTextContent(/atelier/i);
    expect(screen.queryByText("CONTENU PROTÉGÉ")).not.toBeInTheDocument();
  });

  it("rend le contenu protégé si 'ready'", () => {
    mockUseAuth.mockReturnValue({ status: "ready", session: { userId: "u1" }, workshop: { id: "w1" }, error: null });
    renderGuarded();
    expect(screen.getByText("CONTENU PROTÉGÉ")).toBeInTheDocument();
  });
});
