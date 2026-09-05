import { describe, expect, it } from "vitest";
import { normalizeClientPhoneE164 } from "./clientPhone";

describe("normalizeClientPhoneE164 — D3 (indépendant de l'OTP auth, corr. R §11)", () => {
  it("numéro local sénégalais avec espaces → E.164", () => {
    expect(normalizeClientPhoneE164("77 512 44 08")).toBe("+221775124408");
  });

  it("0 + 9 chiffres commençant par 7 → E.164", () => {
    expect(normalizeClientPhoneE164("0775124408")).toBe("+221775124408");
  });

  it("221 + numéro mobile valide → E.164", () => {
    expect(normalizeClientPhoneE164("221775124408")).toBe("+221775124408");
  });

  it("déjà en E.164 sénégalais → conservé tel quel", () => {
    expect(normalizeClientPhoneE164("+221775124408")).toBe("+221775124408");
  });

  it("9 chiffres mais ne commençant pas par 7 → null", () => {
    expect(normalizeClientPhoneE164("123456789")).toBeNull();
  });

  it("numéro local à 8 groupes ne commençant pas par 7 (traité comme numéro local sénégalais) → null", () => {
    expect(normalizeClientPhoneE164("33 123 45 67")).toBeNull();
  });

  it("déjà en E.164 non sénégalais → conservé tel quel (D3 n'exige pas un indicatif sénégalais)", () => {
    expect(normalizeClientPhoneE164("+33612345678")).toBe("+33612345678");
  });

  it("saisie non numérique → null", () => {
    expect(normalizeClientPhoneE164("abc")).toBeNull();
  });

  it("chaîne vide → null", () => {
    expect(normalizeClientPhoneE164("")).toBeNull();
  });
});
