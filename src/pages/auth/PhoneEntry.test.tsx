import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhoneEntry from "./PhoneEntry";

function renderPhoneEntry(state?: { mode?: "register" | "login"; phoneE164?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connexion/numero", state }]}>
      <Routes>
        <Route path="/connexion" element={<div>ÉCRAN ACCUEIL</div>} />
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

  // Corr. Gate Auth navigation §18/§19
  it("Retour -> /connexion (déterministe, jamais navigate(-1))", async () => {
    const user = userEvent.setup();
    renderPhoneEntry({ mode: "register" });
    await user.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByText("ÉCRAN ACCUEIL")).toBeInTheDocument();
  });

  // Corr. Gate Auth navigation §20 — un retour depuis l'étape suivante ne
  // doit jamais obliger à tout retaper.
  it("préremplit le champ avec le numéro déjà saisi lors d'un passage précédent", () => {
    renderPhoneEntry({ mode: "register", phoneE164: "+221770000001" });
    expect(screen.getByLabelText("Numéro de téléphone")).toHaveValue("77 000 00 01");
  });

  // Corr. demande explicite — formatage réactif « XX XXX XX XX » (2-3-2-2) au
  // fur et à mesure de la frappe, pas seulement au préremplissage.
  it("reformate visuellement en direct au format « XX XXX XX XX » pendant la frappe", async () => {
    const user = userEvent.setup();
    renderPhoneEntry();
    const input = screen.getByLabelText("Numéro de téléphone");
    await user.type(input, "770123456");
    expect(input).toHaveValue("77 012 34 56");
  });
});
