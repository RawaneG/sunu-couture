// Dérivation cryptographique de l'auth PIN Tayoo — Web Crypto API UNIQUEMENT
// (`crypto.subtle` + `crypto.getRandomValues`), sans aucun import Deno- ou
// Node-spécifique. Ce fichier tourne IDENTIQUEMENT :
//   - sous Deno, importé par `index.ts` (l'Edge Function réelle) ;
//   - sous Node/Vitest (`crypto.test.ts`, `npm test`) — les runtimes Node ≥ 18
//     et Deno exposent tous deux `globalThis.crypto.subtle` nativement.
// NE JAMAIS importer "node:crypto" ici : casserait l'exécution Deno réelle.
//
// Un PIN à 4 chiffres n'a que 10 000 valeurs possibles (corr. Gate Auth §20) —
// il ne devient JAMAIS un mot de passe Supabase directement. Chaque valeur
// dérivée ci-dessous dépend du secret serveur `TAYOO_PIN_AUTH_SECRET` (jamais
// commité, jamais exposé au navigateur) : sans lui, aucune de ces sorties
// n'est reproductible ni inversable en pratique.
//
// Aucune fonction ici ne stocke ni ne loggue quoi que ce soit — ce sont des
// fonctions pures. Le PIN, le numéro normalisé et le mot de passe technique
// ne doivent jamais être écrits en base ni dans un log (voir `index.ts`).

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(signature);
}

/** Clé opaque et déterministe pour UN numéro normalisé — sert de clé de
 * recherche `pin_auth_accounts.phone_key` ET de base à l'email technique.
 * Jamais le numéro en clair : irréversible sans `secret`. */
export async function derivePhoneKey(secret: string, normalizedPhone: string): Promise<string> {
  const bytes = await hmacSha256(secret, `phone-key:v1|${normalizedPhone}`);
  return bytesToBase64Url(bytes);
}

/** Sel aléatoire (128 bits) — unique par compte, jamais dérivé d'une donnée
 * prévisible. Généré une seule fois à l'inscription, stocké tel quel (ce
 * n'est pas un secret : sans `TAYOO_PIN_AUTH_SECRET`, il ne permet à lui seul
 * ni de retrouver le PIN ni de forger le mot de passe technique). */
export function generatePasswordSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Mot de passe technique Supabase Auth — jamais stocké, jamais renvoyé au
 * navigateur, jamais loggué. Dépend du numéro normalisé, du PIN, D'UN sel
 * propre au compte, ET du secret serveur : un attaquant qui obtiendrait la
 * base (accounts + salt) sans le secret ne peut toujours pas forcer les
 * 10 000 combinaisons de PIN hors ligne sans casser HMAC-SHA256. */
export async function deriveTechnicalPassword(secret: string, normalizedPhone: string, pin: string, salt: string): Promise<string> {
  const bytes = await hmacSha256(secret, `password:v1|${normalizedPhone}|${pin}|${salt}`);
  return bytesToBase64Url(bytes);
}

/** Adresse email technique Supabase Auth — déterministe à partir de
 * `phoneKey` (donc du numéro), JAMAIS du numéro brut lui-même (corr. Gate
 * Auth §23) : irréversible vers le numéro sans `TAYOO_PIN_AUTH_SECRET`.
 * Jamais affichée à l'utilisateur Tayoo — identité purement technique. */
export function deriveTechnicalEmail(phoneKey: string): string {
  return `u_${phoneKey}@auth.tayoo.invalid`;
}

/** Clé de throttle opaque par portée — jamais l'IP ou le numéro bruts stockés
 * dans `app_hidden.pin_auth_throttle`/`pin_auth_register_throttle` (corr.
 * Gate Auth §27, corr. throttle §14). Trois portées, jamais mélangées
 * (namespaces distincts — corr. throttle §13) :
 *   - "phone" / "ip"     : anti brute-force LOGIN (compteur atomique, voir
 *                          `pin_auth_throttle_consume_attempt`) ;
 *   - "register-ip"      : anti-spray REGISTRATION, scope IP uniquement
 *                          (corr. throttle §9-13). */
export async function deriveThrottleKey(secret: string, scope: "phone" | "ip" | "register-ip", rawValue: string): Promise<string> {
  const bytes = await hmacSha256(secret, `throttle-${scope}:v1|${rawValue}`);
  return bytesToBase64Url(bytes);
}

/** Nom technique d'atelier auto-provisionné — jamais demandé ni affiché
 * pendant l'onboarding (corr. Gate Auth §8). Dérivé de l'id utilisateur
 * (public, pas un secret) uniquement pour rester lisible en base ; ne dépend
 * pas du secret serveur (ce n'est pas une donnée sensible). */
export function technicalWorkshopName(userId: string): string {
  return `Espace ${userId.slice(0, 8)}`;
}
