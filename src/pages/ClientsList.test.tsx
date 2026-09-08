// Corr. Jakob's Law §23/§24 — un empty state doit répondre à "qu'est-ce que
// c'est / pourquoi c'est vide / que puis-je faire" — jamais confondu avec
// "aucun résultat pour cette recherche" (CTA différent, ou absent).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Client } from "../lib/types";
import type { ClientRepository } from "../repositories/ClientRepository";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import ClientsList from "./ClientsList";

function fakeClientRepository(clients: Client[]): ClientRepository {
  return {
    list: () => clients,
    get: (id) => clients.find((c) => c.id === id),
    add: async () => "x",
    remove: async () => {},
    removeMany: async () => {},
    subscribe: () => () => {},
  };
}

function renderClientsList(clients: Client[]) {
  const container = { ...createRepositoryContainerFor("local"), clients: fakeClientRepository(clients) };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/clients"]}>
        <Routes>
          <Route path="/clients" element={<ClientsList />} />
          <Route path="/clients/nouveau" element={<p>Écran nouveau client</p>} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

describe("ClientsList — empty state (corr. Jakob's Law §23/§24)", () => {
  it("aucun client du tout -> explique le vide + CTA « Ajouter un client » (même libellé que la création)", () => {
    renderClientsList([]);
    expect(screen.getByText("Aucun client")).toBeInTheDocument();
    expect(screen.getByText(/ajoute ton premier client/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un client" })).toBeInTheDocument();
  });

  it("le CTA de l'empty state mène bien à l'écran de création", async () => {
    const user = userEvent.setup();
    renderClientsList([]);
    await user.click(screen.getByRole("button", { name: "Ajouter un client" }));
    expect(await screen.findByText("Écran nouveau client")).toBeInTheDocument();
  });

  it("des clients existent mais la recherche ne trouve rien -> message DIFFÉRENT, aucun CTA dupliqué", async () => {
    const user = userEvent.setup();
    renderClientsList([{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }]);

    await user.click(screen.getByRole("button", { name: "Rechercher" }));
    // Le champ desktop (toujours dans le DOM, masqué par CSS seulement)
    // partage le même placeholder — on cible celui du bandeau mobile ouvert.
    await user.type(screen.getAllByPlaceholderText("Nom ou téléphone…")[0], "zzz");

    expect(screen.getByText("Aucun client trouvé.")).toBeInTheDocument();
    expect(screen.queryByText("Aucun client")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter un client" })).not.toBeInTheDocument();
  });

  it("avec des clients -> aucun empty state affiché", () => {
    renderClientsList([{ id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" }]);
    expect(screen.queryByText("Aucun client")).not.toBeInTheDocument();
    expect(screen.getByText("Awa Diouf")).toBeInTheDocument();
  });
});
