// Tourne sous Vitest/Node (npm test) — voir l'en-tête de crypto.ts : ce
// fichier ne dépend d'aucune API Deno, seulement de `globalThis.crypto`,
// disponible nativement sous Node ≥ 18 comme sous Deno.
import { describe, expect, it } from "vitest";
import { derivePhoneKey, deriveTechnicalPassword, deriveTechnicalEmail, deriveThrottleKey, generatePasswordSalt, technicalWorkshopName } from "./crypto";

const SECRET_A = "test-secret-a-do-not-use-in-prod-0123456789abcdef";
const SECRET_B = "test-secret-b-completely-different-fedcba9876543210";
const PHONE_1 = "+221770000001";
const PHONE_2 = "+221770000002";

describe("derivePhoneKey — déterministe, opaque, dépend du secret", () => {
  it("même secret + même numéro -> même phoneKey", async () => {
    const a = await derivePhoneKey(SECRET_A, PHONE_1);
    const b = await derivePhoneKey(SECRET_A, PHONE_1);
    expect(a).toBe(b);
  });

  it("numéro différent -> phoneKey différent", async () => {
    const a = await derivePhoneKey(SECRET_A, PHONE_1);
    const b = await derivePhoneKey(SECRET_A, PHONE_2);
    expect(a).not.toBe(b);
  });

  it("secret différent -> phoneKey différent pour le même numéro", async () => {
    const a = await derivePhoneKey(SECRET_A, PHONE_1);
    const b = await derivePhoneKey(SECRET_B, PHONE_1);
    expect(a).not.toBe(b);
  });

  it("jamais le numéro en clair dans la sortie", async () => {
    const key = await derivePhoneKey(SECRET_A, PHONE_1);
    expect(key).not.toContain("770000001");
    expect(key).not.toContain(PHONE_1);
  });

  it("format base64url — jamais de '+', '/' ou '=' (sûr pour un identifiant/email)", async () => {
    const key = await derivePhoneKey(SECRET_A, PHONE_1);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("generatePasswordSalt — aléatoire, jamais deux fois pareil", () => {
  it("deux appels produisent des sels différents", () => {
    const s1 = generatePasswordSalt();
    const s2 = generatePasswordSalt();
    expect(s1).not.toBe(s2);
  });

  it("format base64url", () => {
    const salt = generatePasswordSalt();
    expect(salt).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("deriveTechnicalPassword — jamais le PIN directement comme mot de passe (corr. Gate Auth §20)", () => {
  it("même phone + même PIN + même salt -> même mot de passe technique", async () => {
    const a = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    const b = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    expect(a).toBe(b);
  });

  it("PIN différent -> mot de passe technique différent", async () => {
    const a = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    const b = await deriveTechnicalPassword(SECRET_A, PHONE_1, "5678", "salt-fixe");
    expect(a).not.toBe(b);
  });

  it("salt différent -> mot de passe technique différent (même phone + même PIN)", async () => {
    const a = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-un");
    const b = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-deux");
    expect(a).not.toBe(b);
  });

  it("phone différent -> mot de passe technique différent (même PIN + même salt)", async () => {
    const a = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    const b = await deriveTechnicalPassword(SECRET_A, PHONE_2, "1234", "salt-fixe");
    expect(a).not.toBe(b);
  });

  it("secret différent -> mot de passe technique différent", async () => {
    const a = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    const b = await deriveTechnicalPassword(SECRET_B, PHONE_1, "1234", "salt-fixe");
    expect(a).not.toBe(b);
  });

  it("jamais le PIN en clair dans la sortie", async () => {
    const pwd = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    expect(pwd).not.toContain("1234");
  });

  it("la sortie n'est jamais littéralement le PIN (le PIN ne devient jamais directement le mot de passe)", async () => {
    const pwd = await deriveTechnicalPassword(SECRET_A, PHONE_1, "1234", "salt-fixe");
    expect(pwd).not.toBe("1234");
    expect(pwd.length).toBeGreaterThan(4);
  });
});

describe("deriveTechnicalEmail — déterministe à partir de phoneKey, jamais le numéro brut", () => {
  it("même phoneKey -> même email technique", () => {
    expect(deriveTechnicalEmail("abc123")).toBe(deriveTechnicalEmail("abc123"));
  });

  it("phoneKey différent -> email différent", () => {
    expect(deriveTechnicalEmail("abc123")).not.toBe(deriveTechnicalEmail("xyz789"));
  });

  it("se termine par le domaine technique interne, jamais un vrai domaine", () => {
    expect(deriveTechnicalEmail("abc123")).toBe("u_abc123@auth.tayoo.invalid");
  });

  it("un email dérivé d'un vrai phoneKey ne contient jamais le numéro en clair", async () => {
    const phoneKey = await derivePhoneKey(SECRET_A, PHONE_1);
    const email = deriveTechnicalEmail(phoneKey);
    expect(email).not.toContain("770000001");
  });
});

describe("deriveThrottleKey — opaque par portée, jamais l'IP/numéro brut stocké", () => {
  it("même secret + même portée + même valeur -> même clé", async () => {
    const a = await deriveThrottleKey(SECRET_A, "phone", PHONE_1);
    const b = await deriveThrottleKey(SECRET_A, "phone", PHONE_1);
    expect(a).toBe(b);
  });

  it("portée différente ('phone' vs 'ip') pour la même valeur brute -> clé différente (pas de collision entre scopes)", async () => {
    const phoneScoped = await deriveThrottleKey(SECRET_A, "phone", "1.2.3.4");
    const ipScoped = await deriveThrottleKey(SECRET_A, "ip", "1.2.3.4");
    expect(phoneScoped).not.toBe(ipScoped);
  });

  it("valeur différente -> clé différente", async () => {
    const a = await deriveThrottleKey(SECRET_A, "ip", "1.2.3.4");
    const b = await deriveThrottleKey(SECRET_A, "ip", "5.6.7.8");
    expect(a).not.toBe(b);
  });
});

describe("technicalWorkshopName — jamais demandé/affiché à l'utilisateur, stable pour un même userId", () => {
  it("déterministe pour le même userId", () => {
    expect(technicalWorkshopName("11111111-2222-3333-4444-555555555555")).toBe(technicalWorkshopName("11111111-2222-3333-4444-555555555555"));
  });

  it("userId différent -> nom différent", () => {
    expect(technicalWorkshopName("11111111-0000-0000-0000-000000000000")).not.toBe(technicalWorkshopName("22222222-0000-0000-0000-000000000000"));
  });
});
