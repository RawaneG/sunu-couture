import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConnexionEntry from "./ConnexionEntry";

// PinLogin (branche numéro mémorisé) consomme useAuth().login — hors sujet
// pour ce test de routage, jamais exercé (aucun PIN saisi ici).
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe("ConnexionEntry — point d'entrée /connexion (corr. Gate Auth §6/§46/§66)", () => {
  it("aucun numéro mémorisé -> Welcome", () => {
    render(
      <MemoryRouter initialEntries={["/connexion"]}>
        <ConnexionEntry />
      </MemoryRouter>,
    );
    expect(screen.getByText("Bienvenue sur Tayoo")).toBeInTheDocument();
  });

  it("un numéro mémorisé -> saute directement à l'écran PIN 'Bon retour'", () => {
    localStorage.setItem("tayoo:last-phone", "+221770000099");
    render(
      <MemoryRouter initialEntries={["/connexion"]}>
        <ConnexionEntry />
      </MemoryRouter>,
    );
    expect(screen.getByText("Bon retour")).toBeInTheDocument();
    expect(screen.queryByText("Bienvenue sur Tayoo")).not.toBeInTheDocument();
  });
});
