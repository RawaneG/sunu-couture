// Hotfix Phase 7A — `ClientDetail` était le seul consumer resté sur les
// anciens contrats synchrones/`useClients().find()` après la PR #5. Ces tests
// empêchent spécifiquement la régression visée : une redirection pendant le
// chargement, une navigation avant confirmation serveur, et le classique
// `/carnet/[object Promise]` d'un `add()` non attendu.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useParams, useSearchParams } from "react-router-dom";
import type { Client, Fiche } from "../lib/types";
import type { ClientRepository } from "../repositories/ClientRepository";
import type { FicheRepository, NewFicheInput } from "../repositories/FicheRepository";
import type { RepositoryStatus } from "../repositories/RepositoryStatus";
import { READY_STATUS, LOADING_STATUS } from "../repositories/RepositoryStatus";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import ClientDetail from "./ClientDetail";

const client1: Client = { id: "c1", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" };

class FakeClientRepository implements ClientRepository {
  private clients: Client[];
  private status: RepositoryStatus;
  private readonly listeners = new Set<() => void>();
  readonly removeMock: (id: string) => Promise<void>;

  constructor(clients: Client[], status: RepositoryStatus = READY_STATUS, removeMock?: (id: string) => Promise<void>) {
    this.clients = clients;
    this.status = status;
    this.removeMock = removeMock ?? (async () => {});
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
    throw new Error("FakeClientRepository.add() non utilisé dans ces tests");
  }
  async remove(id: string): Promise<void> {
    await this.removeMock(id);
  }
  async removeMany(): Promise<void> {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Référence STABLE (pas un littéral `[]` recréé à chaque appel) — exigée par
// le contrat `useSyncExternalStore` : un `getSnapshot()` qui renvoie une
// nouvelle référence à chaque rendu provoque une boucle de rerender infinie.
const EMPTY_FICHES: Fiche[] = [];

function fakeFicheRepository(addMock: (input?: NewFicheInput) => Promise<string>): FicheRepository {
  const listeners = new Set<() => void>();
  return {
    list: () => EMPTY_FICHES,
    get: () => undefined,
    listByClient: () => EMPTY_FICHES,
    add: addMock,
    setInfo: async () => {},
    setChamp: async () => {},
    strikeChamp: async () => {},
    restoreChamp: async () => {},
    setStatus: async () => {},
    advance: async () => {},
    remove: async () => {},
    removeMany: async () => {},
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Sonde de destination — affiche l'id EXACT reçu par la route, pour prouver
 * qu'on n'y arrive jamais avec la chaîne littérale "[object Promise]". */
function FicheDestinationProbe() {
  const { id } = useParams();
  return <p>Destination fiche : {id}</p>;
}

/** Sonde du brouillon — Phase 9A : prouve que "Nouvelle fiche" navigue vers
 * `/carnet/nouvelle?client=<id>` (contexte client par paramètre d'URL, pas un
 * objet sérialisé), sans jamais passer par `/carnet/:id`. */
function FicheDraftDestinationProbe() {
  const [params] = useSearchParams();
  return <p>Destination brouillon — client : {params.get("client")}</p>;
}

function renderClientDetail(clients: ClientRepository, fiches: FicheRepository, initialPath = "/clients/c1") {
  const container = { ...createRepositoryContainerFor("local"), clients, fiches };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients" element={<p>Liste des clients</p>} />
          <Route path="/carnet/nouvelle" element={<FicheDraftDestinationProbe />} />
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

describe("ClientDetail — loading distinct de introuvable (A)", () => {
  it("status loading : aucune redirection vers /clients, pas de contenu client affiché", () => {
    const clients = new FakeClientRepository([], LOADING_STATUS);
    renderClientDetail(clients, fakeFicheRepository(async () => "x"));

    expect(screen.getByText(/chargement du client/i)).toBeInTheDocument();
    expect(screen.queryByText("Liste des clients")).not.toBeInTheDocument();
  });
});

describe("ClientDetail — ready + introuvable (B)", () => {
  it("status ready sans le client -> redirection vers /clients", async () => {
    const clients = new FakeClientRepository([], READY_STATUS); // c1 absent
    renderClientDetail(clients, fakeFicheRepository(async () => "x"));

    await waitFor(() => expect(screen.getByText("Liste des clients")).toBeInTheDocument());
  });

  it("status ready AVEC le client -> aucune redirection, contenu affiché", () => {
    const clients = new FakeClientRepository([client1], READY_STATUS);
    renderClientDetail(clients, fakeFicheRepository(async () => "x"));

    expect(screen.queryByText("Liste des clients")).not.toBeInTheDocument();
    // Le nom apparaît deux fois (PageHeader mobile + desktop) — le numéro de
    // téléphone, lui, n'apparaît qu'une fois dans le bloc profil.
    expect(screen.getByText("77 512 44 08")).toBeInTheDocument();
  });
});

describe("ClientDetail — Phase 9A : navigation vers le brouillon, aucune création immédiate (C)", () => {
  it("clique sur 'Nouvelle fiche' -> navigue vers /carnet/nouvelle?client=<id>, add() jamais appelé", async () => {
    const user = userEvent.setup();
    const clients = new FakeClientRepository([client1], READY_STATUS);
    let addCalls = 0;
    renderClientDetail(
      clients,
      fakeFicheRepository(async () => {
        addCalls += 1;
        return "ne-devrait-jamais-etre-appele";
      }),
    );

    await user.click(screen.getByRole("button", { name: /nouvelle fiche pour awa/i }));

    // Navigation synchrone (pas de Promise en jeu) : le contexte client passe
    // par le paramètre d'URL `?client=`, jamais par un `add()` immédiat.
    expect(screen.getByText("Destination brouillon — client : c1")).toBeInTheDocument();
    expect(screen.queryByText(/destination fiche :/i)).not.toBeInTheDocument();
    expect(addCalls).toBe(0);
  });
});

describe("ClientDetail — suppression (E)", () => {
  it("remove() en attente -> aucune navigation ; résolu -> navigation vers /clients", async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const clients = new FakeClientRepository([client1], READY_STATUS, () => pending.promise);
    renderClientDetail(clients, fakeFicheRepository(async () => "x"));

    await user.click(screen.getAllByRole("button", { name: /supprimer le client/i })[0]);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(screen.queryByText("Liste des clients")).not.toBeInTheDocument();

    pending.resolve();
    await waitFor(() => expect(screen.getByText("Liste des clients")).toBeInTheDocument());
  });

  it("remove() rejeté -> aucune navigation, message d'erreur affiché", async () => {
    const user = userEvent.setup();
    const clients = new FakeClientRepository([client1], READY_STATUS, async () => {
      throw new Error("échec serveur");
    });
    renderClientDetail(clients, fakeFicheRepository(async () => "x"));

    await user.click(screen.getAllByRole("button", { name: /supprimer le client/i })[0]);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/suppression a échoué/i));
    expect(screen.queryByText("Liste des clients")).not.toBeInTheDocument();
  });
});
