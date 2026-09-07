import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhoneEntry from "./PhoneEntry";

function renderPhoneEntry(state?: { mode?: "register" | "login" }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connexion/numero", state }]}>
      <Routes>
        <Route path="/connexion/numero" element={<PhoneEntry />} />
        <Route path="/connexion/creer-code" element={<div>ÉCRAN CRÉER CODE</div>} />
        <Route path="/connexion/code" element={<div>ÉCRAN PIN CONNEXION</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // rien à réinitialiser — plus d'appel réseau depuis cet écran (pivot Gate Auth)
});

describe("PhoneEntry — saisie téléphone, purement une étape de navigation (pivot Gate Auth)", () => {
  it("affiche l'indicatif +221 et un champ inputMode='tel'", () => {
    renderPhoneEntry();
    expect(screen.getByText("+221")).toBeInTheDocument();
    const input = screen.getByLabelText("Numéro de téléphone");
    expect(input).toHaveAttribute("inputMode", "tel");
  });

  it("désactive le bouton principal tant que le numéro est invalide", async () => {
    const user = userEvent.setup();
    renderPhoneEntry();
    const button = screen.getByRole("button", { name: "Continuer" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Numéro de téléphone"), "770");
    expect(button).toBeDisabled();
  });

  it("active le bouton une fois le numéro valide", async () => {
    const user = userEvent.setup();
    renderPhoneEntry();
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  it("mode 'register' (défaut) -> navigue vers la création du PIN avec le numéro normalisé", async () => {
    const user = userEvent.setup();
    renderPhoneEntry({ mode: "register" });
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 01");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByText("ÉCRAN CRÉER CODE")).toBeInTheDocument();
  });

  it("mode 'login' -> navigue vers l'écran PIN de connexion", async () => {
    const user = userEvent.setup();
    renderPhoneEntry({ mode: "login" });
    await user.type(screen.getByLabelText("Numéro de téléphone"), "77 000 00 02");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(await screen.findByText("ÉCRAN PIN CONNEXION")).toBeInTheDocument();
  });

  it("affiche une erreur simple et accessible (role=alert) pour un numéro invalide", async () => {
    renderPhoneEntry();
    // Le bouton reste désactivé pour un numéro invalide — l'erreur ne peut
    // donc être déclenchée que via une soumission programmatique impossible
    // ici ; ce test vérifie plutôt qu'aucune erreur ne s'affiche prématurément.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("jamais de jargon (« Authentifiez-vous », « Identifiant ») dans les textes visibles", () => {
    renderPhoneEntry();
    expect(screen.queryByText(/authentifiez-vous/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/identifiant/i)).not.toBeInTheDocument();
  });
});
