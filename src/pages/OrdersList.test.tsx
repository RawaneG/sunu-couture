// Corr. Jakob's Law §23/§24 — même exigence que ClientsList : un empty state
// "aucune commande" ne doit jamais être confondu avec "aucun résultat pour ce
// filtre/cette recherche".
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Fiche } from "../lib/types";
import type { FicheRepository } from "../repositories/FicheRepository";
import type { FicheBalance, Payment, PaymentRepository } from "../repositories/PaymentRepository";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import OrdersList from "./OrdersList";

const ZERO_BALANCE: FicheBalance = { price: 0, paid: 0, reste: 0 };

function fakeFicheRepository(fiches: Fiche[]): FicheRepository {
  return {
    list: () => fiches,
    get: (id) => fiches.find((f) => f.id === id),
    listByClient: () => [],
    add: async () => "x",
    setInfo: async () => {},
    setChamp: async () => {},
    strikeChamp: async () => {},
    restoreChamp: async () => {},
    setStatus: async () => {},
    advance: async () => {},
    remove: async () => {},
    removeMany: async () => {},
    subscribe: () => () => {},
  };
}

function fakePaymentRepository(): PaymentRepository {
  return {
    list: () => [],
    getBalance: () => ZERO_BALANCE,
    add: async (): Promise<Payment> => {
      throw new Error("non utilisé dans ces tests");
    },
    subscribe: () => () => {},
  };
}

function makeFiche(overrides: Partial<Fiche> = {}): Fiche {
  return {
    id: "f1",
    clientId: null,
    numero: 1,
    carnetNumero: 1,
    nom: "Diouf",
    prenom: "Awa",
    telephone: "77 512 44 08",
    champs: {} as Fiche["champs"],
    garment: "Robe",
    description: null,
    fabricColor: "",
    voiceNote: null,
    tissuPhotos: [],
    dueDate: null,
    price: 0,
    avance: 0,
    signature: null,
    soldeLe: null,
    status: "recu",
    late: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderOrdersList(fiches: Fiche[]) {
  const container = { ...createRepositoryContainerFor("local"), fiches: fakeFicheRepository(fiches), payments: fakePaymentRepository() };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/commandes"]}>
        <Routes>
          <Route path="/commandes" element={<OrdersList />} />
          <Route path="/commandes/nouvelle" element={<p>Écran nouvelle fiche</p>} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

describe("OrdersList — empty state (corr. Jakob's Law §23/§24)", () => {
  it("aucune commande du tout -> explique le vide + CTA « Créer la fiche »", () => {
    renderOrdersList([]);
    expect(screen.getByText("Aucune commande")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la fiche" })).toBeInTheDocument();
  });

  it("le CTA de l'empty state mène bien à l'écran de création", async () => {
    const user = userEvent.setup();
    renderOrdersList([]);
    await user.click(screen.getByRole("button", { name: "Créer la fiche" }));
    expect(await screen.findByText("Écran nouvelle fiche")).toBeInTheDocument();
  });

  it("des commandes existent mais la recherche ne trouve rien -> message DIFFÉRENT, aucun CTA dupliqué", async () => {
    const user = userEvent.setup();
    renderOrdersList([makeFiche()]);

    await user.click(screen.getByRole("button", { name: "Rechercher" }));
    await user.type(screen.getAllByPlaceholderText("Client, vêtement ou n° de fiche…")[0], "zzz");

    expect(screen.getByText("Aucune commande trouvée.")).toBeInTheDocument();
    expect(screen.queryByText("Aucune commande")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer la fiche" })).not.toBeInTheDocument();
  });

  it("avec des commandes -> aucun empty state affiché", () => {
    renderOrdersList([makeFiche()]);
    expect(screen.queryByText("Aucune commande")).not.toBeInTheDocument();
  });
});
