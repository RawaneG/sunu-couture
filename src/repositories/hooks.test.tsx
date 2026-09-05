import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { Client } from "../lib/types";
import type { ClientRepository, NewClientInput } from "./ClientRepository";
import type { RepositoryStatus } from "./RepositoryStatus";
import { createRepositoryContainerFor } from "./RepositoryContainer";
import { RepositoryProvider } from "./RepositoryProvider";
import { useClients, useClient } from "./hooks";

/** Faux ClientRepository — preuve que `RepositoryProvider` accepte
 * l'injection d'un Repository de test (aucun localStorage, aucun Zustand). */
class FakeClientRepository implements ClientRepository {
  private clients: Client[] = [];
  private listeners = new Set<() => void>();

  list(): Client[] {
    return this.clients;
  }

  get(id: string): Client | undefined {
    return this.clients.find((c) => c.id === id);
  }

  async add(input: NewClientInput): Promise<string> {
    const id = `fake-${this.clients.length + 1}`;
    this.clients = [...this.clients, { id, name: input.name, phone: input.phone, photo: input.photo, colorSeed: "indigo" }];
    this.notify();
    return id;
  }

  async remove(id: string): Promise<void> {
    this.clients = this.clients.filter((c) => c.id !== id);
    this.notify();
  }

  async removeMany(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    this.clients = this.clients.filter((c) => !idSet.has(c.id));
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

/** Faux ClientRepository dont l'hydratation est contrôlée manuellement par
 * le test — reproduit un Repository cloud (Phase 7A) qui reste `loading`
 * tant que son cache/réseau n'a pas encore répondu. */
class HydratingFakeClientRepository implements ClientRepository {
  private clients: Client[] = [];
  private listeners = new Set<() => void>();
  private status: RepositoryStatus = { status: "loading" };

  list(): Client[] {
    return this.clients;
  }
  get(id: string): Client | undefined {
    return this.clients.find((c) => c.id === id);
  }
  getStatus(): RepositoryStatus {
    return this.status;
  }
  async add(input: NewClientInput): Promise<string> {
    const id = `fake-${this.clients.length + 1}`;
    this.clients = [...this.clients, { id, name: input.name, phone: input.phone, photo: input.photo, colorSeed: "indigo" }];
    this.notify();
    return id;
  }
  async remove(id: string): Promise<void> {
    this.clients = this.clients.filter((c) => c.id !== id);
    this.notify();
  }
  async removeMany(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    this.clients = this.clients.filter((c) => !idSet.has(c.id));
    this.notify();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Simule la fin d'hydratation (cache ou réseau) — passe à "ready" et notifie. */
  markReady(clients: Client[]) {
    this.clients = clients;
    this.status = { status: "ready" };
    this.notify();
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}

function ClientProbe({ id }: { id: string }) {
  const state = useClient(id);
  if (state.status === "loading") return <p>Chargement…</p>;
  if (state.status === "error") return <p>Erreur</p>;
  return <p>{state.data ? state.data.name : "Introuvable"}</p>;
}

function ClientNames() {
  const clients = useClients();
  return (
    <ul>
      {clients.map((c) => (
        <li key={c.id}>{c.name}</li>
      ))}
    </ul>
  );
}

describe("useClients() — un composant réagit à une mutation du Repository", () => {
  it("se re-rend automatiquement quand un faux Repository injecté notifie une mutation", async () => {
    const fakeClients = new FakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };

    render(
      <RepositoryProvider repositories={container}>
        <ClientNames />
      </RepositoryProvider>,
    );

    expect(screen.queryByText("Awa Diouf")).not.toBeInTheDocument();

    await act(async () => {
      await fakeClients.add({ name: "Awa Diouf", phone: "77 512 44 08", photo: null });
    });

    expect(screen.getByText("Awa Diouf")).toBeInTheDocument();
  });

  it("ne conserve plus un client supprimé après notification", async () => {
    const fakeClients = new FakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };
    let id = "";
    await act(async () => {
      id = await fakeClients.add({ name: "Modou Fall", phone: "", photo: null });
    });

    render(
      <RepositoryProvider repositories={container}>
        <ClientNames />
      </RepositoryProvider>,
    );
    expect(screen.getByText("Modou Fall")).toBeInTheDocument();

    await act(async () => {
      await fakeClients.remove(id);
    });
    expect(screen.queryByText("Modou Fall")).not.toBeInTheDocument();
  });
});

describe("useClient() — état loading distinct de 'introuvable' (corr. R, Phase 7A §19)", () => {
  it("affiche 'loading' pendant l'hydratation, jamais confondu avec une absence réelle", () => {
    const fakeClients = new HydratingFakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };

    render(
      <RepositoryProvider repositories={container}>
        <ClientProbe id="c1" />
      </RepositoryProvider>,
    );

    // Le Repository n'a pas encore fini de s'hydrater : le composant doit
    // afficher "loading", jamais "Introuvable" (qui laisserait croire à une
    // suppression/redirection légitime).
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByText("Introuvable")).not.toBeInTheDocument();
  });

  it("passe de 'loading' à 'introuvable' seulement une fois réellement hydraté (status ready + data undefined)", () => {
    const fakeClients = new HydratingFakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };

    render(
      <RepositoryProvider repositories={container}>
        <ClientProbe id="c-jamais-cree" />
      </RepositoryProvider>,
    );
    expect(screen.getByText("Chargement…")).toBeInTheDocument();

    act(() => {
      fakeClients.markReady([]); // hydratation terminée, collection réellement vide
    });

    expect(screen.getByText("Introuvable")).toBeInTheDocument();
  });

  it("passe de 'loading' au client réel une fois hydraté — jamais 'introuvable' entre-temps si le client existe", () => {
    const fakeClients = new HydratingFakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };

    render(
      <RepositoryProvider repositories={container}>
        <ClientProbe id="c1" />
      </RepositoryProvider>,
    );
    expect(screen.getByText("Chargement…")).toBeInTheDocument();

    act(() => {
      fakeClients.markReady([{ id: "c1", name: "Awa Diouf", phone: "", photo: null, colorSeed: "indigo" }]);
    });

    expect(screen.getByText("Awa Diouf")).toBeInTheDocument();
    expect(screen.queryByText("Introuvable")).not.toBeInTheDocument();
  });

  it("un Repository sans getStatus() (LocalStorage) reste toujours 'ready' — comportement inchangé avant cette phase", () => {
    const container = createRepositoryContainerFor("local");
    render(
      <RepositoryProvider repositories={container}>
        <ClientProbe id="inconnu-local" />
      </RepositoryProvider>,
    );
    // Jamais "Chargement…" pour un Repository local — toujours prêt immédiatement.
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
    expect(screen.getByText("Introuvable")).toBeInTheDocument();
  });
});
