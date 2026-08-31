import { describe, expect, it } from "vitest";
import { formatPhoneSenegalDisplay, normalizePhoneSenegal } from "./phone";

describe("normalizePhoneSenegal", () => {
  it("accepte un numéro local à 9 chiffres avec espaces", () => {
    expect(normalizePhoneSenegal("77 000 00 01")).toBe("+221770000001");
  });

  it("accepte un numéro local avec le 0 initial", () => {
    expect(normalizePhoneSenegal("0770000001")).toBe("+221770000001");
  });

  it("accepte un numéro déjà préfixé 221 sans le +", () => {
    expect(normalizePhoneSenegal("221770000001")).toBe("+221770000001");
  });

  it("accepte un numéro déjà en E.164 avec le +", () => {
    expect(normalizePhoneSenegal("+221 77 000 00 01")).toBe("+221770000001");
  });

  it("rejette un numéro trop court", () => {
    expect(normalizePhoneSenegal("7700001")).toBeNull();
  });

  it("rejette un numéro trop long", () => {
    expect(normalizePhoneSenegal("7700000000001")).toBeNull();
  });

  it("rejette une saisie vide ou non numérique", () => {
    expect(normalizePhoneSenegal("")).toBeNull();
    expect(normalizePhoneSenegal("abc def")).toBeNull();
  });
});

describe("formatPhoneSenegalDisplay", () => {
  it("regroupe les chiffres par paires pour l'affichage", () => {
    expect(formatPhoneSenegalDisplay("+221770000001")).toBe("+221 77 00 00 00 1");
  });
});
