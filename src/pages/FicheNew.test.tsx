// Phase 9A — `FicheNew` devient un véritable écran de brouillon : ouvrir cet
// écran, le remplir ou le quitter sans valider ne doit JAMAIS créer de fiche,
// de carnet, ni consommer de numéro. `ficheRepository.add()` n'est appelé
// qu'une seule fois, sur clic explicite, avec un brouillon significatif.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import type { Client, Fiche } from "../lib/types";
import type { ClientRepository } from "../repositories/ClientRepository";
import type { FicheRepository, NewFicheInput } from "../repositories/FicheRepository";
import type { RepositoryStatus } from "../repositories/RepositoryStatus";
import { READY_STATUS } from "../repositories/RepositoryStatus";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import FicheNew from "./FicheNew";

const client1: Client = { id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" };

class FakeClientRepository implements ClientRepository {
  private readonly clients: Client[];
  private readonly status: RepositoryStatus;
  constructor(clients: Client[], status: RepositoryStatus = READY_STATUS) {
    this.clients = clients;
    this.status = status;
  }
  list(): Client[] {
    return this.clients;
  }
  get(id: string): Client | undefined {
    return this.clients.find((c) => c.id === id);
  }
  getStatus(): RepositoryStatus {
    return this.status;
  }
  async add(): Promise<string> {
    throw new Error("non utilisé");
  }
  async remove(): Promise<void> {}
  async removeMany(): Promise<void> {}
  subscribe(): () => void {
    return () => {};
  }
}

// Référence STABLE — voir ClientDetail.test.tsx pour la même remarque sur le
// contrat `useSyncExternalStore`.
const EMPTY_FICHES: Fiche[] = [];

function fakeFicheRepository(
  addMock: (input?: NewFicheInput) => Promise<string>,
  fiches: Fiche[] = EMPTY_FICHES,
): FicheRepository {
  return {
    list: () => fiches,
    get: () => undefined,
    listByClient: (clientId: string) => fiches.filter((f) => f.clientId === clientId),
    add: addMock,
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

function FicheDestinationProbe() {
  const { id } = useParams();
  return <p>Destination fiche : {id}</p>;
}

function renderFicheNew(fiches: FicheRepository, clients: ClientRepository = new FakeClientRepository([]), initialPath = "/carnet/nouvelle") {
  const container = { ...createRepositoryContainerFor("local"), fiches, clients };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/carnet/nouvelle" element={<FicheNew />} />
          <Route path="/carnet/:id" element={<FicheDestinationProbe />} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FicheNew — brouillon local, aucune création implicite", () => {
  it("le simple montage de l'écran n'appelle jamais add()", () => {
    let addCalls = 0;
    renderFicheNew(fakeFicheRepository(async () => (addCalls += 1, "x")));
    expect(addCalls).toBe(0);
  });

  it("quitter l'écran sans valider n'appelle jamais add()", () => {
    let addCalls = 0;
    const { unmount } = renderFicheNew(fakeFicheRepository(async () => (addCalls += 1, "x")));
    unmount();
    expect(addCalls).toBe(0);
  });

  it("taper dans une mesure ne crée toujours rien tant que 'Créer la fiche' n'est pas cliqué", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderFicheNew(fakeFicheRepository(async () => (addCalls += 1, "x")));

    await user.type(screen.getByLabelText("Cou"), "42");

    expect(screen.getByLabelText("Cou")).toHaveValue("42");
    expect(addCalls).toBe(0);
  });

  it("brouillon vide + clic sur 'Créer la fiche' -> aucun add(), message contrôlé affiché", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderFicheNew(fakeFicheRepository(async () => (addCalls += 1, "x")));

    await user.click(screen.getAllByRole("button", { name: /créer la fiche/i })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/ajoute au moins/i);
    expect(addCalls).toBe(0);
    expect(screen.queryByText(/destination fiche/i)).not.toBeInTheDocument();
  });

  it("brouillon significatif + clic -> add() appelé exactement une fois, puis navigation vers le VRAI id", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderFicheNew(
      fakeFicheRepository(async () => {
        addCalls += 1;
        return "fiche-123";
      }),
    );

    await user.type(screen.getByLabelText("Cou"), "42");
    await user.click(screen.getAllByRole("button", { name: /créer la fiche/i })[0]);

    await waitFor(() => expect(screen.getByText("Destination fiche : fiche-123")).toBeInTheDocument());
    expect(addCalls).toBe(1);
  });

  it("add() en attente désactive le bouton et empêche un double appel", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    const pending = deferred<string>();
    renderFicheNew(
      fakeFicheRepository(() => {
        addCalls += 1;
        return pending.promise;
      }),
    );

    await user.type(screen.getByLabelText("Cou"), "42");
    const buttons = screen.getAllByRole("button", { name: /créer la fiche/i });
    await user.click(buttons[0]);
    for (const button of screen.getAllByRole("button", { name: /créer la fiche/i })) {
      expect(button).toBeDisabled();
    }
    await user.click(buttons[0]);

    expect(addCalls).toBe(1);
    expect(screen.queryByText(/destination fiche/i)).not.toBeInTheDocument();

    pending.resolve("fiche-999");
    await waitFor(() => expect(screen.getByText("Destination fiche : fiche-999")).toBeInTheDocument());
  });

  it("add() rejeté -> le brouillon est conservé, aucune navigation, message role=alert", async () => {
    const user = userEvent.setup();
    renderFicheNew(
      fakeFicheRepository(async () => {
        throw new Error("réseau indisponible");
      }),
    );

    await user.type(screen.getByLabelText("Cou"), "42");
    await user.click(screen.getAllByRole("button", { name: /créer la fiche/i })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être créée/i);
    expect(screen.getByLabelText("Cou")).toHaveValue("42");
    expect(screen.queryByText(/destination fiche/i)).not.toBeInTheDocument();
  });
});

describe("FicheNew — préremplissage à partir du client", () => {
  it("résout le client via ?client=<id> et préremplit nom/prénom/téléphone + dernières mesures", async () => {
    const lastFiche: Fiche = {
      id: "f-old",
      clientId: "c1",
      numero: 1,
      carnetNumero: 1,
      nom: "Diouf",
      prenom: "Awa",
      telephone: "77 512 44 08",
      champs: Object.fromEntries(
        ["E", "Cou", "P", "T", "M", "C", "H", "F", "G", "TM", "LR", "LP", "LJ", "nbrePagnes", "tissusDeposes"].map(
          (key) => [key, { valeur: key === "Cou" ? "38" : "", historique: [] }],
        ),
      ) as unknown as Fiche["champs"],
      garment: "",
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
    };

    renderFicheNew(
      fakeFicheRepository(async () => "x", [lastFiche]),
      new FakeClientRepository([client1]),
      "/carnet/nouvelle?client=c1",
    );

    await waitFor(() => expect(screen.getByLabelText("Cou")).toHaveValue("38"));
    expect(screen.getByDisplayValue("Awa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Diouf")).toBeInTheDocument();
    expect(screen.getByDisplayValue("77 512 44 08")).toBeInTheDocument();
  });
});
