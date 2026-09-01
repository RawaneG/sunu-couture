import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as legacyBackupModule from "../lib/legacyBackup";
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

// Phase 6A, correction review « deux appels distincts à new Date() » — backup
// (generatedAt) et fileName doivent dériver du même instant, capturé une
// seule fois, même si l'horloge change de jour pendant que l'écran est ouvert.
describe("LegacySauvegarde — backup et fileName partagent le même instant", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the exact same Date instance to buildLegacyBackup() and legacyBackupFileName()", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([client1]));
    const buildSpy = vi.spyOn(legacyBackupModule, "buildLegacyBackup");
    const fileNameSpy = vi.spyOn(legacyBackupModule, "legacyBackupFileName");

    renderPage();

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(fileNameSpy).toHaveBeenCalledTimes(1);
    const nowForBackup = buildSpy.mock.calls[0][1];
    const nowForFileName = fileNameSpy.mock.calls[0][0];
    expect(nowForBackup).toBeInstanceOf(Date);
    expect(nowForBackup).toBe(nowForFileName); // même référence — un seul `new Date()`, pas deux

    buildSpy.mockRestore();
    fileNameSpy.mockRestore();
  });

  it("keeps generatedAt and the displayed fileName pinned to the instant captured at mount, even around a simulated day change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59, 59, 900)); // 100ms avant minuit, 31 janvier
    window.localStorage.setItem(LEGACY_STORAGE_KEY, persisted([]));

    const buildSpy = vi.spyOn(legacyBackupModule, "buildLegacyBackup");
    const fileNameSpy = vi.spyOn(legacyBackupModule, "legacyBackupFileName");

    renderPage();

    const nowForBackup = buildSpy.mock.calls[0][1];
    const nowForFileName = fileNameSpy.mock.calls[0][0];
    expect(nowForBackup).toBe(nowForFileName);
    expect(nowForBackup?.getDate()).toBe(31);

    // Le fichier affiché correspond à cet instant (31 janvier) — pas à un
    // second `new Date()` recalculé séparément pour le nom de fichier.
    expect(screen.getByRole("button", { name: /tayoo-sauvegarde-2026-01-31\.json/ })).toBeInTheDocument();

    // L'horloge avance jusqu'au lendemain PENDANT que l'écran reste ouvert —
    // le nom déjà affiché ne doit pas se recalculer rétroactivement.
    vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 5));
    expect(screen.getByRole("button", { name: /tayoo-sauvegarde-2026-01-31\.json/ })).toBeInTheDocument();

    buildSpy.mockRestore();
    fileNameSpy.mockRestore();
  });
});
