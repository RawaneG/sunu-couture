import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LegacySauvegarde from "./LegacySauvegarde";
import { LEGACY_STORAGE_KEY } from "../lib/store";

// Phase 6A, correction review « snapshot de vérification incohérent » —
// backup/vérification/prévisualisation doivent tous les trois provenir du
// MÊME instantané pris à l'ouverture de l'écran, jamais d'un état du store
// relu plus tard (ce qui produirait un faux `counts_mismatch`).

function persisted(clients: unknown[], fiches: unknown[] = []): string {
  return JSON.stringify({ state: { clients, fiches }, version: 12 });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/sauvegarde"]}>
      <LegacySauvegarde />
    </MemoryRouter>,
  );
}

const client1 = { id: "c1", name: "Awa", phone: "77", photo: null, colorSeed: "indigo" };
const client2 = { id: "c2", name: "Modou", phone: "76", photo: null, colorSeed: "teal" };

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("LegacySauvegarde — le snapshot pris à l'ouverture ne bouge plus", () => {
  it("shows the counts from the snapshot taken at mount, unaffected by a later change to the underlying storage", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1]));
    renderPage();

    // Simule une modification survenant APRÈS l'instantané — par ex. le
    // repository client écrit ailleurs pendant que le tailleur regarde l'écran.
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1, client2]));

    // Étape 1 (analyse) reste basée sur l'instantané : 1 client, pas 2.
    expect(screen.getByText(/1 client\(s\) · 0 fiche\(s\) · 0 modèle\(s\) trouvés/)).toBeInTheDocument();
  });

  it("verifies the initial snapshot as ok, never comparing against a state mutated after mount", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1]));
    const user = userEvent.setup();
    renderPage();

    // La donnée sous-jacente change juste après le montage, avant toute
    // interaction du tailleur.
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1, client2]));

    await user.click(screen.getByRole("button", { name: /télécharger le fichier/i }));
    await user.click(screen.getByRole("button", { name: /vérifier la sauvegarde générée/i }));

    // "ok" : la vérification compare le fichier au snapshot qui l'a produit,
    // pas à l'état (désormais différent) du storage.
    expect(await screen.findByText(/sauvegarde vérifiée/i)).toBeInTheDocument();
    expect(screen.getByText(/Sauvegarde vérifiée : 1 client\(s\), 0 fiche\(s\), 0 modèle\(s\)/)).toBeInTheDocument();
  });

  it("keeps the preview's counts consistent with the same snapshot, even after a later storage mutation", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1]));
    renderPage();

    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([]));

    // "1 client" — dérivé de backup.normalized, pas d'une relecture du storage.
    expect(screen.getByText(/1 client\(s\), 0 fiche\(s\), 0 modèle\(s\) seront/)).toBeInTheDocument();
  });
});
