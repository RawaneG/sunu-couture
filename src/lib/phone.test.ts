import { describe, expect, it } from "vitest";
import { formatPhoneSenegalDisplay, maskPhoneSenegalDisplay, normalizePhoneSenegal } from "./phone";

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

describe("maskPhoneSenegalDisplay — écran 'Bon retour' (corr. Gate Auth §46)", () => {
  it("conserve le premier et le dernier groupe visibles, masque le reste", () => {
    expect(maskPhoneSenegalDisplay("+221770000099")).toBe("+221 77 •• •• •• 9");
  });

  it("ne renvoie jamais le numéro complet en clair pour un numéro masqué", () => {
    const masked = maskPhoneSenegalDisplay("+221771234567");
    expect(masked).not.toContain("1234567");
    expect(masked).not.toContain("123456");
    expect(masked).toBe("+221 77 •• •• •• 7");
  });
});
