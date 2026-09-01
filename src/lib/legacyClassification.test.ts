import { describe, expect, it } from "vitest";
import { classifyClientOrigin, classifyFicheOrigin, classifyModeleOrigin } from "./legacyClassification";
import { seedClients, seedFiches } from "./store";
import type { Modele } from "./types";

describe("classifyClientOrigin / classifyFicheOrigin — démo vs réel", () => {
  it("marks an untouched seed client as demo", () => {
    expect(classifyClientOrigin(seedClients[0])).toBe("demo");
  });

  it("marks an untouched seed fiche as demo", () => {
    expect(classifyFicheOrigin(seedFiches[0])).toBe("demo");
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

  it("treats a seed fiche id whose content was edited as real", () => {
    const edited = { ...seedFiches[0], price: 999999 };
    expect(classifyFicheOrigin(edited)).toBe("reel");
  });

  it("treats any uid()-generated (timestamped) client id as real", () => {
    const real = { id: `c${Date.now()}-abc123`, name: "Client réel", phone: "70 111 22 33", photo: null, colorSeed: "amber" };
    expect(classifyClientOrigin(real)).toBe("reel");
  });

  it("classifies every seed client and every seed fiche as demo (full sweep)", () => {
    expect(seedClients.every((c) => classifyClientOrigin(c) === "demo")).toBe(true);
    expect(seedFiches.every((f) => classifyFicheOrigin(f) === "demo")).toBe(true);
  });
});

describe("classifyModeleOrigin", () => {
  it("always classifies a modele as real — there is no modele seed", () => {
    const modele: Modele = { id: "m1", nom: "Boubou", photos: [], patronPhotos: [], createdAt: "2026-01-01T00:00:00.000Z" };
    expect(classifyModeleOrigin(modele)).toBe("reel");
  });
});
