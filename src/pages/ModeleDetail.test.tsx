// Correctif ciblé (finding review PR #11) : `ModeleNomEditor` initialise son
// buffer local (`useState(modele.nom)`) une seule fois au montage. Tant que
// `modele.id` reste identique, React ne remonte PAS le composant — si
// `modele.nom` change ENTRE-TEMPS (ex. refresh réseau après une modification
// depuis un autre appareil), l'ancien `draft` local survivrait et pourrait
// écraser la valeur serveur au prochain blur/Enter. Ce test démontre que la
// clé `${modele.id}:${modele.nom}` force le remontage attendu.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Modele, TissuPhoto, VoiceNote } from "../lib/types";
import type { ModeleRepository, NewModeleInput } from "../repositories/ModeleRepository";
import type { MediaRepository } from "../repositories/MediaRepository";
import type { RepositoryStatus } from "../repositories/RepositoryStatus";
import { READY_STATUS } from "../repositories/RepositoryStatus";
import { createRepositoryContainerFor } from "../repositories/RepositoryContainer";
import { RepositoryProvider } from "../repositories/RepositoryProvider";
import ModeleDetail from "./ModeleDetail";

class FakeModeleRepository implements ModeleRepository {
  private listeners = new Set<() => void>();
  private modeles: Modele[];
  constructor(modeles: Modele[]) {
    this.modeles = modeles;
  }
  list(): Modele[] {
    return this.modeles;
  }
  get(id: string): Modele | undefined {
    return this.modeles.find((m) => m.id === id);
  }
  getStatus(): RepositoryStatus {
    return READY_STATUS;
  }
  /** Simule un changement AUTORITATIF (ex. refresh réseau) — même id, nom
   * différent — sans passer par `setNom()` (qui viendrait de CE client). */
  setNomFromServer(id: string, nom: string) {
    this.modeles = this.modeles.map((m) => (m.id === id ? { ...m, nom } : m));
    this.notify();
  }
  async add(_input: NewModeleInput): Promise<string> {
    throw new Error("non utilisé dans ce test");
  }
  async setNom(): Promise<void> {}
  async remove(): Promise<void> {}
  async removeMany(): Promise<void> {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}

const EMPTY_PHOTOS: TissuPhoto[] = [];

class FakeMediaRepository implements MediaRepository {
  listFichePhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addFichePhoto(): Promise<void> {}
  async removeFichePhoto(): Promise<void> {}
  getFicheVoiceNote(): VoiceNote | null {
    return null;
  }
  async setFicheVoiceNote(): Promise<void> {}
  getFicheSignature(): string | null {
    return null;
  }
  async setFicheSignature(): Promise<void> {}
  listModelePhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addModelePhoto(): Promise<void> {}
  async removeModelePhoto(): Promise<void> {}
  listModelePatronPhotos(): TissuPhoto[] {
    return EMPTY_PHOTOS;
  }
  async addModelePatronPhoto(): Promise<void> {}
  async removeModelePatronPhoto(): Promise<void> {}
  async copyModeleMediaToFiche(): Promise<void> {}
  subscribe(): () => void {
    return () => {};
  }
}

function renderModeleDetail(modeles: ModeleRepository, media: MediaRepository) {
  const container = { ...createRepositoryContainerFor("local"), modeles, media };
  return render(
    <RepositoryProvider repositories={container}>
      <MemoryRouter initialEntries={["/catalogue/m1"]}>
        <Routes>
          <Route path="/catalogue" element={<p>Retour au catalogue</p>} />
          <Route path="/catalogue/:id" element={<ModeleDetail />} />
        </Routes>
      </MemoryRouter>
    </RepositoryProvider>,
  );
}

describe("ModeleDetail — ModeleNomEditor resynchronisé après un changement autoritatif du nom (correctif review PR #11)", () => {
  it("nom initial affiché, puis un nom serveur mis à jour (même id) remonte l'éditeur — le draft local ne survit pas", async () => {
    const modeles = new FakeModeleRepository([{ id: "m1", nom: "Robe A", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" }]);
    const media = new FakeMediaRepository();
    renderModeleDetail(modeles, media);

    const input = await screen.findByLabelText("Nom du modèle");
    expect(input).toHaveValue("Robe A");

    modeles.setNomFromServer("m1", "Robe B");

    await waitFor(() => expect(screen.getByLabelText("Nom du modèle")).toHaveValue("Robe B"));
  });
});

// Corr. Jakob's Law §14/§53 — Catalogue → modèle → Retour, déterministe.
describe("ModeleDetail — Retour", () => {
  it("Retour -> /catalogue (jamais navigate(-1))", async () => {
    const user = userEvent.setup();
    const modeles = new FakeModeleRepository([{ id: "m1", nom: "Robe A", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" }]);
    renderModeleDetail(modeles, new FakeMediaRepository());

    await screen.findByLabelText("Nom du modèle");
    await user.click(screen.getByRole("link", { name: "Retour" }));
    expect(await screen.findByText("Retour au catalogue")).toBeInTheDocument();
  });
});
