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
        <Route path="/connexion/atelier" element={<div>ÉCRAN NOM ATELIER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RequireAuth — garde de route (construite, non branchée sur l'app existante)", () => {
  it("affiche un état de chargement accessible pendant la restauration de session", () => {
    mockUseAuth.mockReturnValue({ initializing: true, session: null, workshop: null });
    renderGuarded();
    expect(screen.getByRole("status")).toHaveTextContent(/chargement/i);
    expect(screen.queryByText("CONTENU PROTÉGÉ")).not.toBeInTheDocument();
  });

  it("redirige vers /connexion si aucune session (utilisateur non connecté)", () => {
    mockUseAuth.mockReturnValue({ initializing: false, session: null, workshop: null });
    renderGuarded();
    expect(screen.getByText("ÉCRAN CONNEXION")).toBeInTheDocument();
  });

  it("redirige vers /connexion/atelier si connecté mais sans atelier résolu", () => {
    mockUseAuth.mockReturnValue({ initializing: false, session: { userId: "u1" }, workshop: null });
    renderGuarded();
    expect(screen.getByText("ÉCRAN NOM ATELIER")).toBeInTheDocument();
  });

  it("rend le contenu protégé si connecté ET atelier résolu", () => {
    mockUseAuth.mockReturnValue({ initializing: false, session: { userId: "u1" }, workshop: { id: "w1" } });
    renderGuarded();
    expect(screen.getByText("CONTENU PROTÉGÉ")).toBeInTheDocument();
  });
});
