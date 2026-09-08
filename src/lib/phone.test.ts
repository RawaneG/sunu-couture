import { describe, expect, it } from "vitest";
import { formatPhoneSenegalDisplay, formatSenegalLocalNumber, maskPhoneSenegalDisplay, normalizePhoneSenegal } from "./phone";

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

describe("formatSenegalLocalNumber — regroupement canonique réactif « XX XXX XX XX » (corr. Jakob's Law)", () => {
  it("numéro complet -> 4 groupes 2-3-2-2", () => {
    expect(formatSenegalLocalNumber("770123456")).toBe("77 012 34 56");
  });

  it("saisie partielle (en cours de frappe) -> groupes formés au fur et à mesure, jamais d'erreur", () => {
    expect(formatSenegalLocalNumber("7")).toBe("7");
    expect(formatSenegalLocalNumber("77")).toBe("77");
    expect(formatSenegalLocalNumber("770")).toBe("77 0");
    expect(formatSenegalLocalNumber("77012")).toBe("77 012");
    expect(formatSenegalLocalNumber("770123")).toBe("77 012 3");
    expect(formatSenegalLocalNumber("7701234")).toBe("77 012 34");
    expect(formatSenegalLocalNumber("77012345")).toBe("77 012 34 5");
  });

  it("retire un préfixe 0 ou 221 déjà tapé avant de regrouper", () => {
    expect(formatSenegalLocalNumber("0770123456")).toBe("77 012 34 56");
    expect(formatSenegalLocalNumber("221770123456")).toBe("77 012 34 56");
  });

  it("ignore tout caractère non numérique et une saisie vide reste vide", () => {
    expect(formatSenegalLocalNumber("77-012 34.56")).toBe("77 012 34 56");
    expect(formatSenegalLocalNumber("")).toBe("");
  });

  it("tronque au-delà de 9 chiffres, jamais un 5e groupe", () => {
    expect(formatSenegalLocalNumber("77012345699999")).toBe("77 012 34 56");
  });
});

describe("formatPhoneSenegalDisplay", () => {
  it("regroupe les chiffres au format canonique 2-3-2-2 pour l'affichage", () => {
    expect(formatPhoneSenegalDisplay("+221770123456")).toBe("+221 77 012 34 56");
  });
});

describe("maskPhoneSenegalDisplay — écran 'Bon retour' (corr. Gate Auth §46)", () => {
  it("conserve le premier et le dernier groupe visibles, masque le reste", () => {
    expect(maskPhoneSenegalDisplay("+221770123499")).toBe("+221 77 ••• •• 99");
  });

  it("ne renvoie jamais le numéro complet en clair pour un numéro masqué", () => {
    const masked = maskPhoneSenegalDisplay("+221771234567");
    expect(masked).not.toContain("1234567");
    expect(masked).not.toContain("12345");
    expect(masked).toBe("+221 77 ••• •• 67");
  });
});
