import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { Client } from "../lib/types";
import type { ClientRepository, NewClientInput } from "./ClientRepository";
import { createRepositoryContainerFor } from "./RepositoryContainer";
import { RepositoryProvider } from "./RepositoryProvider";
import { useClients } from "./hooks";

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

  add(input: NewClientInput): string {
    const id = `fake-${this.clients.length + 1}`;
    this.clients = [...this.clients, { id, name: input.name, phone: input.phone, photo: input.photo, colorSeed: "indigo" }];
    this.notify();
    return id;
  }

  remove(id: string): void {
    this.clients = this.clients.filter((c) => c.id !== id);
    this.notify();
  }

  removeMany(ids: string[]): void {
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
  it("se re-rend automatiquement quand un faux Repository injecté notifie une mutation", () => {
    const fakeClients = new FakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };

    render(
      <RepositoryProvider repositories={container}>
        <ClientNames />
      </RepositoryProvider>,
    );

    expect(screen.queryByText("Awa Diouf")).not.toBeInTheDocument();

    act(() => {
      fakeClients.add({ name: "Awa Diouf", phone: "77 512 44 08", photo: null });
    });

    expect(screen.getByText("Awa Diouf")).toBeInTheDocument();
  });

  it("ne conserve plus un client supprimé après notification", () => {
    const fakeClients = new FakeClientRepository();
    const container = { ...createRepositoryContainerFor("local"), clients: fakeClients };
    let id = "";
    act(() => {
      id = fakeClients.add({ name: "Modou Fall", phone: "", photo: null });
    });

    render(
      <RepositoryProvider repositories={container}>
        <ClientNames />
      </RepositoryProvider>,
    );
    expect(screen.getByText("Modou Fall")).toBeInTheDocument();

    act(() => {
      fakeClients.remove(id);
    });
    expect(screen.queryByText("Modou Fall")).not.toBeInTheDocument();
  });
});
