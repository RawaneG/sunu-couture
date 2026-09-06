// Phase 8B — correction obligatoire : `ModeleNew` devient un véritable écran
// de brouillon. Ouvrir cet écran, y taper, ou le quitter sans valider ne doit
// JAMAIS appeler `modeleRepository.add()` — un modèle cloud ne peut
// structurellement pas exister sans nom, et l'ancien comportement (création
// au montage) laissait une ligne vide dès l'ouverture, même en cas d'abandon.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import type { Modele } from "../lib/types";
import type { ModeleRepository, NewModeleInput } from "../repositories/ModeleRepository";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import ModeleNew from "./ModeleNew";

function fakeModeleRepository(addMock: (input: NewModeleInput) => Promise<string>): ModeleRepository {
  return {
    list: (): Modele[] => [],
    get: () => undefined,
    add: addMock,
    setNom: async () => {},
    remove: async () => {},
    removeMany: async () => {},
    subscribe: () => () => {},
  };
}

function CatalogueDestinationProbe() {
  const { id } = useParams();
  return <p>Destination catalogue : {id}</p>;
}

function renderModeleNew(modeles: ModeleRepository) {
  const container = { ...createRepositoryContainerFor("local"), modeles };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/catalogue/nouveau"]}>
        <Routes>
          <Route path="/catalogue/nouveau" element={<ModeleNew />} />
          <Route path="/catalogue/:id" element={<CatalogueDestinationProbe />} />
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

describe("ModeleNew — brouillon local, aucune création implicite", () => {
  it("le simple montage de l'écran n'appelle jamais add() (Test A)", () => {
    let addCalls = 0;
    renderModeleNew(fakeModeleRepository(async () => (addCalls += 1, "x")));
    expect(addCalls).toBe(0);
  });

  it("quitter l'écran sans valider n'appelle jamais add() (Test B)", () => {
    let addCalls = 0;
    const { unmount } = renderModeleNew(fakeModeleRepository(async () => (addCalls += 1, "x")));
    unmount();
    expect(addCalls).toBe(0);
  });

  it("un nom uniquement composé d'espaces empêche la soumission — add() jamais appelé (Test C)", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderModeleNew(fakeModeleRepository(async () => (addCalls += 1, "x")));

    await user.type(screen.getByLabelText("Nom du modèle"), "   ");
    expect(screen.getByRole("button", { name: /créer le modèle/i })).toBeDisabled();
    expect(addCalls).toBe(0);
  });

  it("nom valide + clic -> add() appelé exactement une fois, puis navigation vers le VRAI id (Test D)", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    renderModeleNew(
      fakeModeleRepository(async () => {
        addCalls += 1;
        return "modele-123";
      }),
    );

    await user.type(screen.getByLabelText("Nom du modèle"), "Robe wax");
    await user.click(screen.getByRole("button", { name: /créer le modèle/i }));

    expect(await screen.findByText("Destination catalogue : modele-123")).toBeInTheDocument();
    expect(addCalls).toBe(1);
  });

  it("add() en attente désactive le bouton et empêche un double appel (Test E)", async () => {
    const user = userEvent.setup();
    let addCalls = 0;
    const pending = deferred<string>();
    renderModeleNew(
      fakeModeleRepository(() => {
        addCalls += 1;
        return pending.promise;
      }),
    );

    await user.type(screen.getByLabelText("Nom du modèle"), "Robe wax");
    const button = screen.getByRole("button", { name: /créer le modèle/i });
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);

    expect(addCalls).toBe(1);
    expect(screen.queryByText(/destination catalogue/i)).not.toBeInTheDocument();

    pending.resolve("modele-999");
    expect(await screen.findByText("Destination catalogue : modele-999")).toBeInTheDocument();
  });

  it("add() rejeté -> reste sur la page, message role=alert, aucune navigation (Test F)", async () => {
    const user = userEvent.setup();
    renderModeleNew(
      fakeModeleRepository(async () => {
        throw new Error("réseau indisponible");
      }),
    );

    await user.type(screen.getByLabelText("Nom du modèle"), "Robe wax");
    await user.click(screen.getByRole("button", { name: /créer le modèle/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'a pas pu être créé/i);
    expect(screen.getByLabelText("Nom du modèle")).toHaveValue("Robe wax");
    expect(screen.queryByText(/destination catalogue/i)).not.toBeInTheDocument();
  });
});
