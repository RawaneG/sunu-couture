import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WorkshopName from "./WorkshopName";

const { mockProvisionWorkshop } = vi.hoisted(() => ({ mockProvisionWorkshop: vi.fn() }));
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ provisionWorkshop: mockProvisionWorkshop }),
}));

function renderWorkshopName() {
  return render(
    <MemoryRouter initialEntries={["/connexion/atelier"]}>
      <Routes>
        <Route path="/connexion/atelier" element={<WorkshopName />} />
        <Route path="/" element={<div>ACCUEIL APP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkshopName — nouvel utilisateur uniquement", () => {
  it("ne demande que le nom de l'atelier (un seul champ)", () => {
    renderWorkshopName();
    expect(screen.getByLabelText(/nom de l'atelier/i)).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("désactive le bouton tant qu'aucun nom n'est saisi", () => {
    renderWorkshopName();
    expect(screen.getByRole("button", { name: /créer mon atelier/i })).toBeDisabled();
  });

  it("crée l'atelier avec le nom saisi et redirige vers l'application", async () => {
    mockProvisionWorkshop.mockResolvedValue({ kind: "workshop", workshop: { id: "w1", name: "Couture chez Fatou" } });
    const user = userEvent.setup();
    renderWorkshopName();

    await user.type(screen.getByLabelText(/nom de l'atelier/i), "Couture chez Fatou");
    await user.click(screen.getByRole("button", { name: /créer mon atelier/i }));

    expect(mockProvisionWorkshop).toHaveBeenCalledWith("Couture chez Fatou");
    await waitFor(() => expect(screen.getByText("ACCUEIL APP")).toBeInTheDocument());
  });

  it("affiche une erreur accessible si la création échoue", async () => {
    mockProvisionWorkshop.mockResolvedValue({ kind: "error", message: "Une erreur est survenue. Réessaie plus tard." });
    const user = userEvent.setup();
    renderWorkshopName();

    await user.type(screen.getByLabelText(/nom de l'atelier/i), "Couture chez Fatou");
    await user.click(screen.getByRole("button", { name: /créer mon atelier/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Une erreur est survenue");
  });
});
