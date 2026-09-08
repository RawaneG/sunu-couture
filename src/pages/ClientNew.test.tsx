// Corr. Jakob's Law §15/§16/§55 — formulaire de création client : action
// principale nommée (verbe + objet), Retour déterministe, confirmation
// uniquement si une saisie réelle serait perdue, jamais de double soumission.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import type { Client } from "../lib/types";
import type { ClientRepository, NewClientInput } from "../repositories/ClientRepository";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import ClientNew from "./ClientNew";

function fakeClientRepository(addMock: (input: NewClientInput) => Promise<string>): ClientRepository {
  return {
    list: (): Client[] => [],
    get: () => undefined,
    add: addMock,
    remove: async () => {},
    removeMany: async () => {},
    subscribe: () => () => {},
  };
}

function ClientDestinationProbe() {
  const { id } = useParams();
  return <p>Destination client : {id}</p>;
}

function renderClientNew(clients: ClientRepository) {
  const container = { ...createRepositoryContainerFor("local"), clients };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/clients/nouveau"]}>
        <Routes>
          <Route path="/clients" element={<p>Retour aux clients</p>} />
          <Route path="/clients/nouveau" element={<ClientNew />} />
          <Route path="/clients/:id" element={<ClientDestinationProbe />} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ClientNew — création", () => {
  it("nom vide -> bouton désactivé, add() jamais appelé", async () => {
    let addCalls = 0;
    renderClientNew(fakeClientRepository(async () => (addCalls += 1, "x")));
    expect(screen.getByRole("button", { name: /ajouter le client/i })).toBeDisabled();
    expect(addCalls).toBe(0);
  });

  it("nom renseigné + clic -> add() appelé une fois, puis navigation vers le VRAI id", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderClientNew(
      fakeClientRepository(async () => {
        addCalls += 1;
        return "client-123";
      }),
    );

    await user.type(screen.getByLabelText("Nom"), "Fatou Ndiaye");
    await user.click(screen.getByRole("button", { name: /ajouter le client/i }));

    expect(await screen.findByText("Destination client : client-123")).toBeInTheDocument();
    expect(addCalls).toBe(1);
  });

  it("add() en attente -> bouton désactivé + libellé « Ajout… », empêche un double appel", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    const pending = deferred<string>();
    renderClientNew(
      fakeClientRepository(() => {
        addCalls += 1;
        return pending.promise;
      }),
    );

    await user.type(screen.getByLabelText("Nom"), "Fatou Ndiaye");
    const button = screen.getByRole("button", { name: /ajouter le client/i });
    await user.click(button);
    expect(await screen.findByRole("button", { name: "Ajout…" })).toBeDisabled();
    await user.click(button);

    expect(addCalls).toBe(1);
    pending.resolve("client-999");
    expect(await screen.findByText("Destination client : client-999")).toBeInTheDocument();
  });

  it("add() rejeté -> reste sur la page, message role=alert, saisie conservée", async () => {
    const user = userEvent.setup();
    renderClientNew(
      fakeClientRepository(async () => {
        throw new Error("réseau indisponible");
      }),
    );

    await user.type(screen.getByLabelText("Nom"), "Fatou Ndiaye");
    await user.click(screen.getByRole("button", { name: /ajouter le client/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être enregistré/i);
    expect(screen.getByLabelText("Nom")).toHaveValue("Fatou Ndiaye");
  });
});

describe("ClientNew — Retour et confirmation avant perte de saisie", () => {
  it("aucune saisie -> Retour immédiat, aucune confirmation", async () => {
    const user = userEvent.setup();
    renderClientNew(fakeClientRepository(async () => "x"));

    await user.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByText("Retour aux clients")).toBeInTheDocument();
    expect(screen.queryByText("Quitter sans enregistrer ?")).not.toBeInTheDocument();
  });

  it("saisie réelle -> Retour affiche une confirmation ; « Continuer ici » reste sur l'écran, saisie conservée", async () => {
    const user = userEvent.setup();
    renderClientNew(fakeClientRepository(async () => "x"));

    await user.type(screen.getByLabelText("Nom"), "Fatou");
    await user.click(screen.getByRole("button", { name: "Retour" }));

    expect(await screen.findByText("Quitter sans enregistrer ?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuer ici" }));
    expect(screen.queryByText("Quitter sans enregistrer ?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Fatou");
  });

  it("saisie réelle -> « Quitter » navigue vers la liste, la saisie est abandonnée", async () => {
    const user = userEvent.setup();
    renderClientNew(fakeClientRepository(async () => "x"));

    await user.type(screen.getByLabelText("Nom"), "Fatou");
    await user.click(screen.getByRole("button", { name: "Retour" }));
    await user.click(await screen.findByRole("button", { name: "Quitter" }));

    expect(await screen.findByText("Retour aux clients")).toBeInTheDocument();
  });
});
