import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthPublicRoute from "./AuthPublicRoute";

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock("./AuthProvider", () => ({ useAuth: () => mockUseAuth() }));

function renderAt(path: string, initialState?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state: initialState }]}>
      <Routes>
        <Route
          path="/connexion"
          element={
            <AuthPublicRoute>
              <div>ÉCRAN CONNEXION</div>
            </AuthPublicRoute>
          }
        />
        <Route path="/" element={<div>APP MÉTIER</div>} />
        <Route path="/clients/nouveau" element={<div>NOUVEAU CLIENT</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Corr. Gate Auth navigation §25/§26/§27 — garde symétrique de RequireAuth :
// un utilisateur déjà authentifié (session + atelier "ready") ne doit jamais
// pouvoir revisiter /connexion/* (Back navigateur après connexion, notamment).
describe("AuthPublicRoute", () => {
  it("initializing -> état de chargement, jamais l'écran public ni une redirection prématurée", () => {
    mockUseAuth.mockReturnValue({ status: "initializing" });
    renderAt("/connexion");
    expect(screen.getByRole("status")).toHaveTextContent("Chargement de ta session…");
    expect(screen.queryByText("ÉCRAN CONNEXION")).not.toBeInTheDocument();
  });

  it("signed_out -> rend l'écran public normalement", () => {
    mockUseAuth.mockReturnValue({ status: "signed_out" });
    renderAt("/connexion");
    expect(screen.getByText("ÉCRAN CONNEXION")).toBeInTheDocument();
  });

  it("ready (déjà authentifié) -> redirection immédiate vers '/', jamais l'écran public", () => {
    mockUseAuth.mockReturnValue({ status: "ready" });
    renderAt("/connexion");
    expect(screen.getByText("APP MÉTIER")).toBeInTheDocument();
    expect(screen.queryByText("ÉCRAN CONNEXION")).not.toBeInTheDocument();
  });

  it("ready + `from` valide en state -> redirige vers `from`, pas seulement '/'", () => {
    mockUseAuth.mockReturnValue({ status: "ready" });
    renderAt("/connexion", { from: { pathname: "/clients/nouveau" } });
    expect(screen.getByText("NOUVEAU CLIENT")).toBeInTheDocument();
  });

  it("ready + `from` pointant vers une route d'auth -> ignoré, redirige vers '/' (jamais une boucle /connexion -> /connexion)", () => {
    mockUseAuth.mockReturnValue({ status: "ready" });
    renderAt("/connexion", { from: { pathname: "/connexion/code" } });
    expect(screen.getByText("APP MÉTIER")).toBeInTheDocument();
  });

  it("error (session valide, atelier non résolu) -> laisse passer l'écran public plutôt qu'un blocage", () => {
    mockUseAuth.mockReturnValue({ status: "error" });
    renderAt("/connexion");
    expect(screen.getByText("ÉCRAN CONNEXION")).toBeInTheDocument();
  });
});
