import { describe, expect, it, vi, afterEach } from "vitest";
import { classifyClientOrigin, classifyFicheOrigin, classifyModeleOrigin } from "./legacyClassification";
import { seedClients, buildSeedFiches } from "./store";
import type { Modele } from "./types";

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyClientOrigin — démo vs réel", () => {
  it("marks an untouched seed client as demo", () => {
    expect(classifyClientOrigin(seedClients[0])).toBe("demo");
  });

  it("never marks a real, non-seed client as demo, even one that resembles the seed", () => {
    const notSeed = { id: "c99", name: "Awa Diouf", phone: "77 512 44 08", photo: null, colorSeed: "indigo" };
    // Same content as seedClients[0] but a different id → not "the" seed record → réel.
    expect(classifyClientOrigin(notSeed)).toBe("reel");
  });

  it("treats a seed id whose content was edited by the tailor as real (no longer intact)", () => {
    const edited = { ...seedClients[0], phone: "70 000 00 00" };
    expect(classifyClientOrigin(edited)).toBe("reel");
  });

  it("treats any uid()-generated (timestamped) client id as real", () => {
    const real = { id: `c${Date.now()}-abc123`, name: "Client réel", phone: "70 111 22 33", photo: null, colorSeed: "amber" };
    expect(classifyClientOrigin(real)).toBe("reel");
  });

  it("classifies every seed client as demo (full sweep)", () => {
    expect(seedClients.every((c) => classifyClientOrigin(c) === "demo")).toBe(true);
  });
});

describe("classifyFicheOrigin — robustesse à l'écoulement du temps (Phase 6A, correction blocker « seed datée »)", () => {
  it("classifies a fiche built by buildSeedFiches() at some past install date as demo, evaluated 'today'", () => {
    const installedAt = new Date(2026, 0, 1, 9, 0, 0);
    const seedAtInstall = buildSeedFiches(installedAt);
    for (const fiche of seedAtInstall) {
      expect(classifyFicheOrigin(fiche)).toBe("demo");
    }
  });

  it("keeps classifying an untouched seed fiche as demo across J+1, J+30 and J+365 of real wall-clock time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0)); // J0 — app installée, seed écrite telle quelle
    const persistedFiche = buildSeedFiches(new Date())[0]; // f1, tel que réellement persisté ce jour-là

    for (const daysLater of [1, 30, 365]) {
      vi.setSystemTime(new Date(2026, 0, 1 + daysLater, 14, 0, 0));
      expect(classifyFicheOrigin(persistedFiche)).toBe("demo");
    }
  });

  it("does the same for every seed fiche id (f1..f6), not just the first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 8, 0, 0));
    const persisted = buildSeedFiches(new Date());

    vi.setSystemTime(new Date(2027, 5, 15, 8, 0, 0)); // +365 jours
    for (const fiche of persisted) {
      expect(classifyFicheOrigin(fiche)).toBe("demo");
    }
  });

  it("never compares against a seed regenerated at today's date — an untouched J0 fiche must not require re-importing store.seedFiches at classification time", () => {
    // Seed « installée » un jour arbitraire dans le passé, jamais régénérée depuis.
    const installedAt = new Date(2020, 0, 1);
    const persistedFiche = buildSeedFiches(installedAt)[2]; // f3 (dueDate/soldeLe/createdAt tous décalés différemment de f1)
    // On n'appelle PAS buildSeedFiches(new Date()) ici : classifyFicheOrigin
    // doit reconstruire elle-même la bonne date à partir de la fiche fournie.
    expect(classifyFicheOrigin(persistedFiche)).toBe("demo");
  });
});

describe("classifyFicheOrigin — modifications réelles détectées malgré le même id", () => {
  it("treats a same-id fiche with a modified measurement as real", () => {
    const seed = buildSeedFiches(new Date())[0]; // f1
    const edited = { ...seed, champs: { ...seed.champs, E: { valeur: "999", historique: [] } } };
    expect(classifyFicheOrigin(edited)).toBe("reel");
  });

  it("treats a same-id fiche with a modified price as real", () => {
    const seed = buildSeedFiches(new Date())[0];
    expect(classifyFicheOrigin({ ...seed, price: seed.price + 1 })).toBe("reel");
  });

  it("treats a same-id fiche whose dueDate the tailor actually changed as real", () => {
    const seed = buildSeedFiches(new Date())[0];
    const changed = new Date(seed.dueDate!);
    changed.setDate(changed.getDate() + 5);
    expect(classifyFicheOrigin({ ...seed, dueDate: changed.toISOString() })).toBe("reel");
  });

  it("treats an unknown fiche id as real", () => {
    const real = { ...buildSeedFiches(new Date())[0], id: "f-unknown-123" };
    expect(classifyFicheOrigin(real)).toBe("reel");
  });

  it("treats a uid()-generated (timestamped) fiche id as real, even with seed-like content", () => {
    const seed = buildSeedFiches(new Date())[0];
    const real = { ...seed, id: `f${Date.now()}-abc123` };
    expect(classifyFicheOrigin(real)).toBe("reel");
  });

  it("treats a fiche with an unparseable createdAt as real rather than crashing", () => {
    const seed = buildSeedFiches(new Date())[0];
    expect(classifyFicheOrigin({ ...seed, createdAt: "not-a-date" })).toBe("reel");
  });
});

describe("classifyModeleOrigin", () => {
  it("always classifies a modele as real — there is no modele seed", () => {
    const modele: Modele = { id: "m1", nom: "Boubou", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" };
    expect(classifyModeleOrigin(modele)).toBe("reel");
  });
});
