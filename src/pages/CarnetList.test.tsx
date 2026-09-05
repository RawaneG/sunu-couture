// Phase 9A — ouvrir "Nouvelle fiche" depuis le carnet ne doit plus créer de
// fiche/carnet/numéro immédiatement : seule une navigation vers le brouillon
// (`/carnet/nouvelle`) est attendue, sans aucun appel Repository.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { Fiche } from "../lib/types";
import type { FicheRepository, NewFicheInput } from "../repositories/FicheRepository";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import CarnetList from "./CarnetList";

const EMPTY_FICHES: Fiche[] = [];

function fakeFicheRepository(addMock: (input?: NewFicheInput) => Promise<string>): FicheRepository {
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
    subscribe: () => () => {},
  };
}

function DraftDestinationProbe() {
  const location = useLocation();
  return <p>Destination : {location.pathname}</p>;
}

function renderCarnetList(fiches: FicheRepository) {
  const container = { ...createRepositoryContainerFor("local"), fiches };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/carnet"]}>
        <Routes>
          <Route path="/carnet" element={<CarnetList />} />
          <Route path="/carnet/nouvelle" element={<DraftDestinationProbe />} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

describe("CarnetList — Phase 9A : 'Nouvelle fiche' navigue vers le brouillon sans créer", () => {
  it("carnet vide : le bouton d'état vide navigue vers /carnet/nouvelle, add() jamais appelé", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderCarnetList(fakeFicheRepository(async () => (addCalls += 1, "x")));

    await user.click(screen.getByRole("button", { name: /ouvrir une fiche/i }));

    expect(screen.getByText("Destination : /carnet/nouvelle")).toBeInTheDocument();
    expect(addCalls).toBe(0);
  });

  it("le bouton flottant 'Nouvelle fiche' navigue vers /carnet/nouvelle, add() jamais appelé", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderCarnetList(fakeFicheRepository(async () => (addCalls += 1, "x")));

    await user.click(screen.getAllByRole("button", { name: /nouvelle fiche/i })[0]);

    expect(screen.getByText("Destination : /carnet/nouvelle")).toBeInTheDocument();
    expect(addCalls).toBe(0);
  });
});
