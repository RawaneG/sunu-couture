// tayoo-pin-auth — Edge Function (pivot Auth : téléphone + PIN 4 chiffres,
// atelier invisible — corr. Gate Auth).
//
// REMPLACE le parcours SMS OTP (jamais activé côté fournisseur réel — voir
// supabase/config.toml) : cette fonction est nécessairement accessible AVANT
// toute session (`register`/`login`), donc `verify_jwt = false`
// (supabase/config.toml, `[functions.tayoo-pin-auth]`) — acceptable
// UNIQUEMENT parce qu'elle implémente ELLE-MÊME une authentification stricte
// (dérivation cryptographique + anti brute-force persistant ci-dessous),
// jamais un accès libre.
//
// ARCHITECTURE (corr. Gate Auth §20/§23) : un PIN à 4 chiffres n'a que 10 000
// valeurs possibles — il ne devient JAMAIS directement un mot de passe
// Supabase. À la place : téléphone + PIN → dérivation HMAC-SHA256 (secret
// serveur `TAYOO_PIN_AUTH_SECRET`, jamais commité/VITE_*/navigateur/log) →
// identité Supabase Auth TECHNIQUE (email/mot de passe internes,
// `u_<phoneKey>@auth.tayoo.invalid`, jamais vus par l'utilisateur) →
// `admin.auth.createUser()` / `signInWithPassword()` → VRAIE session Supabase
// Auth (jamais un JWT fabriqué à la main). Voir `crypto.ts` pour le détail
// des dérivations (testé indépendamment, `crypto.test.ts`, tourne sous
// Vitest/Node ET est importé ici tel quel sous Deno).
//
// Reprend les choix déjà établis par `provision-workshop`/
// `create-fiche-from-draft` (implémentation manuelle, pas `withSupabase()` —
// réponses structurées non personnalisables sinon ; CORS par liste blanche,
// limite Kong locale documentée dans leurs fichiers).
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders as sdkCorsHeaders } from "@supabase/supabase-js/cors";
import {
  derivePhoneKey,
  deriveTechnicalPassword,
  deriveTechnicalEmail,
  deriveThrottleKey,
  generatePasswordSalt,
  technicalWorkshopName,
} from "./crypto.ts";

// ── Configuration ────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const PUBLISHABLE_KEY = safeParseDefaultKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
const SECRET_KEY = safeParseDefaultKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
// Secret dédié à cette fonction UNIQUEMENT (corr. Gate Auth §24) — jamais
// réutilisé pour autre chose, jamais loggué. En local : défini dans
// `supabase/functions/.env` (gitignoré via `.env*`, jamais commité,
// auto-chargé par `supabase start` — voir doc Supabase « Edge Function
// secrets »). En distant : `supabase secrets set TAYOO_PIN_AUTH_SECRET=...`
// (hors dépôt, jamais dans ce tour — corr. Gate Auth §75).
const PIN_AUTH_SECRET = Deno.env.get("TAYOO_PIN_AUTH_SECRET");

function safeParseDefaultKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as { default?: string }).default;
  } catch {
    return undefined;
  }
}

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY || !PIN_AUTH_SECRET) {
  // Erreur de configuration au démarrage — jamais une clé/valeur dans le message.
  throw new Error("tayoo-pin-auth: configuration manquante (URL, clés Supabase, ou TAYOO_PIN_AUTH_SECRET).");
}

// Client de connexion (mot de passe technique) — clé publishable, comme un
// navigateur normal. Jamais utilisé pour une opération privilégiée.
const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Client PRIVILÉGIÉ (clé secrète) — seul client autorisé à créer/supprimer
// des utilisateurs Auth et à appeler les wrappers RPC réservés à service_role.
const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── CORS (même principe que provision-workshop/create-fiche-from-draft —
// voir leurs index.ts pour le détail et la limite Kong locale documentée) ──
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
// Nom dédié à CETTE fonction (corr. Gate Auth §55) — jamais un wildcard "*"
// pour une fonction d'authentification distante.
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_DEV_ORIGINS,
  ...(Deno.env.get("TAYOO_ALLOWED_ORIGINS")?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
]);

type OriginDecision = { kind: "allowed"; origin: string } | { kind: "forbidden" } | { kind: "absent" };

function classifyOrigin(rawOrigin: string | null): OriginDecision {
  if (rawOrigin === null) return { kind: "absent" };
  if (rawOrigin === "null") return { kind: "forbidden" };
  if (ALLOWED_ORIGINS.has(rawOrigin)) return { kind: "allowed", origin: rawOrigin };
  return { kind: "forbidden" };
}

function corsHeadersFor(decision: OriginDecision): HeadersInit {
  if (decision.kind !== "allowed") return {};
  return {
    ...sdkCorsHeaders,
    "Access-Control-Allow-Origin": decision.origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Toutes les réponses de cette fonction (succès ET erreur) portent
 * `Cache-Control: no-store` (corr. Gate Auth §35) — jamais un token ou un
 * message d'erreur mis en cache par un intermédiaire. */
function jsonResponse(status: number, body: unknown, decision: OriginDecision): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeadersFor(decision) },
  });
}

/** Ne jamais logger : numéro (brut ou normalisé), PIN, email technique, mot
 * de passe technique, JWT, access/refresh token, phoneKey, secret (corr.
 * Gate Auth §56). */
function logSafe(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

// ── Numéro Sénégal — même convention que `src/lib/phone.ts` (frontend),
// réimplémentée ici car cette fonction Deno ne partage pas d'arborescence
// avec le code Vite (chaque Edge Function du dépôt est autonome). ─────────
const SENEGAL_PREFIX = "+221";
const LOCAL_DIGITS_LENGTH = 9;

function normalizeSenegalPhone(input: string): string | null {
  const digitsOnly = input.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  let local = digitsOnly;
  if (local.startsWith("221")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);
  if (local.length !== LOCAL_DIGITS_LENGTH) return null;
  return `${SENEGAL_PREFIX}${local}`;
}

const PIN_REGEX = /^[0-9]{4}$/;

const GENERIC_LOGIN_ERROR = { error: "invalid_credentials", message: "Numéro ou code incorrect." };
const GENERIC_LOCKED_ERROR = { error: "locked", message: "Trop d'essais. Réessaie dans quelques minutes." };
const GENERIC_SERVER_ERROR = { error: "internal_error", message: "Connexion impossible. Réessaie." };

/** Meilleur effort — l'IP n'est jamais stockée en clair (corr. Gate Auth
 * §27) : elle n'est utilisée que pour dériver une clé de throttle opaque. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

/** Vérifie les DEUX portées (téléphone, IP) — verrouillée si l'UNE des deux
 * l'est (corr. Gate Auth §27/§29). */
async function checkThrottle(phoneThrottleKey: string, ipThrottleKey: string): Promise<boolean> {
  const [phoneStatus, ipStatus] = await Promise.all([
    adminClient.rpc("pin_auth_throttle_status_api", { p_key_hash: phoneThrottleKey }),
    adminClient.rpc("pin_auth_throttle_status_api", { p_key_hash: ipThrottleKey }),
  ]);
  const phoneLocked = Array.isArray(phoneStatus.data) && phoneStatus.data[0]?.locked === true;
  const ipLocked = Array.isArray(ipStatus.data) && ipStatus.data[0]?.locked === true;
  return phoneLocked || ipLocked;
}

/** Enregistre un échec sur les DEUX portées (corr. Gate Auth §27/§29). */
async function recordThrottleFailure(phoneThrottleKey: string, ipThrottleKey: string): Promise<void> {
  await Promise.all([
    adminClient.rpc("pin_auth_throttle_record_failure_api", { p_key_hash: phoneThrottleKey }),
    adminClient.rpc("pin_auth_throttle_record_failure_api", { p_key_hash: ipThrottleKey }),
  ]);
}

/** Réinitialise les DEUX portées après un succès. */
async function resetThrottle(phoneThrottleKey: string, ipThrottleKey: string): Promise<void> {
  await Promise.all([
    adminClient.rpc("pin_auth_throttle_reset_api", { p_key_hash: phoneThrottleKey }),
    adminClient.rpc("pin_auth_throttle_reset_api", { p_key_hash: ipThrottleKey }),
  ]);
}

Deno.serve(async (req: Request) => {
  const decision = classifyOrigin(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    if (decision.kind === "forbidden") {
      logSafe("tayoo_pin_auth.cors_forbidden", { reason: "preflight_origin_not_allowed" });
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(decision) });
  }

  if (decision.kind === "forbidden") {
    logSafe("tayoo_pin_auth.cors_forbidden", { reason: "origin_not_allowed" });
    return new Response(JSON.stringify({ error: "forbidden_origin", message: "Origine non autorisée." }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(400, { error: "invalid_request", message: "Méthode non supportée." }, decision);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête JSON invalide." }, decision);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête invalide." }, decision);
  }
  const { action, phone, pin } = body as { action?: unknown; phone?: unknown; pin?: unknown };

  if (action !== "register" && action !== "login") {
    return jsonResponse(400, { error: "invalid_request", message: "Action non supportée." }, decision);
  }
  if (typeof phone !== "string") {
    return jsonResponse(400, { error: "invalid_request", message: "Vérifie le numéro." }, decision);
  }
  const normalizedPhone = normalizeSenegalPhone(phone);
  if (!normalizedPhone) {
    return jsonResponse(400, { error: "invalid_request", message: "Vérifie le numéro." }, decision);
  }
  if (typeof pin !== "string" || !PIN_REGEX.test(pin)) {
    return jsonResponse(400, { error: "invalid_request", message: "Le code doit contenir exactement 4 chiffres." }, decision);
  }

  // Dérivations — jamais loggué (numéro/PIN), voir crypto.ts.
  const phoneKey = await derivePhoneKey(PIN_AUTH_SECRET, normalizedPhone);
  const phoneThrottleKey = await deriveThrottleKey(PIN_AUTH_SECRET, "phone", normalizedPhone);
  const ipThrottleKey = await deriveThrottleKey(PIN_AUTH_SECRET, "ip", clientIp(req));

  const locked = await checkThrottle(phoneThrottleKey, ipThrottleKey);
  if (locked) {
    logSafe("tayoo_pin_auth.locked", { action });
    return jsonResponse(429, GENERIC_LOCKED_ERROR, decision);
  }

  if (action === "register") {
    return handleRegister({ normalizedPhone, pin, phoneKey, phoneThrottleKey, ipThrottleKey, decision });
  }
  return handleLogin({ normalizedPhone, pin, phoneKey, phoneThrottleKey, ipThrottleKey, decision });
});

interface ActionContext {
  normalizedPhone: string;
  pin: string;
  phoneKey: string;
  phoneThrottleKey: string;
  ipThrottleKey: string;
  decision: OriginDecision;
}

/** Établit une VRAIE session Supabase Auth via mot de passe technique —
 * jamais un JWT fabriqué à la main (corr. Gate Auth §22). */
async function establishSession(technicalEmail: string, technicalPassword: string) {
  return authClient.auth.signInWithPassword({ email: technicalEmail, password: technicalPassword });
}

async function handleRegister(ctx: ActionContext): Promise<Response> {
  const { normalizedPhone, pin, phoneKey, phoneThrottleKey, ipThrottleKey, decision } = ctx;

  // Duplicate : réponse UX contrôlée, jamais l'email/user id/phoneKey (corr.
  // Gate Auth §33).
  const { data: existing, error: lookupError } = await adminClient.rpc("pin_auth_lookup_account_api", { p_phone_key: phoneKey });
  if (lookupError) {
    logSafe("tayoo_pin_auth.register.error", { phase: "lookup", code: lookupError.code ?? "unknown" });
    return jsonResponse(500, GENERIC_SERVER_ERROR, decision);
  }
  if (Array.isArray(existing) && existing.length > 0) {
    return jsonResponse(409, { error: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." }, decision);
  }

  const salt = generatePasswordSalt();
  const technicalEmail = deriveTechnicalEmail(phoneKey);
  const technicalPassword = await deriveTechnicalPassword(PIN_AUTH_SECRET!, normalizedPhone, pin, salt);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: technicalEmail,
    password: technicalPassword,
    email_confirm: true, // aucun email envoyé — identité purement technique (corr. Gate Auth §31)
  });
  if (createError || !created?.user) {
    // Course rare : deux inscriptions concurrentes pour le même numéro ont
    // toutes deux passé la vérification de duplication ci-dessus — traité
    // comme un doublon plutôt qu'un 500 générique.
    logSafe("tayoo_pin_auth.register.create_user_failed", { code: createError?.code ?? "unknown" });
    return jsonResponse(409, { error: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." }, decision);
  }
  const userId = created.user.id;

  const { error: insertError } = await adminClient.rpc("pin_auth_register_account_api", {
    p_user_id: userId,
    p_phone_key: phoneKey,
    p_password_salt: salt,
  });
  if (insertError) {
    // Transaction partielle (corr. Gate Auth §32) : auth.admin.createUser()
    // et Postgres ne partagent pas une transaction unique — compensation
    // EXPLICITE, jamais un utilisateur orphelin silencieux.
    await adminClient.auth.admin.deleteUser(userId);
    if (insertError.code === "23505") {
      return jsonResponse(409, { error: "phone_in_use", message: "Ce numéro est déjà utilisé. Choisis « J'ai déjà un code »." }, decision);
    }
    logSafe("tayoo_pin_auth.register.error", { phase: "insert_account", code: insertError.code ?? "unknown" });
    return jsonResponse(500, GENERIC_SERVER_ERROR, decision);
  }

  // Atelier invisible (corr. Gate Auth §7/§8/§36) — idempotent par
  // construction (provision_workshop_api renvoie l'atelier existant si
  // owner en a déjà un), jamais demandé/affiché à l'utilisateur.
  const { error: provisionError } = await adminClient.rpc("provision_workshop_api", {
    p_owner: userId,
    p_name: technicalWorkshopName(userId),
  });
  if (provisionError) {
    // Compensation complète — cascade sur pin_auth_accounts via FK ON DELETE
    // CASCADE — jamais un compte à moitié créé.
    await adminClient.auth.admin.deleteUser(userId);
    logSafe("tayoo_pin_auth.register.error", { phase: "provision_workshop", code: provisionError.code ?? "unknown" });
    return jsonResponse(500, GENERIC_SERVER_ERROR, decision);
  }

  const { data: signInData, error: signInError } = await establishSession(technicalEmail, technicalPassword);
  if (signInError || !signInData.session) {
    // État cohérent (compte + atelier réels) — seule la connexion finale a
    // échoué ; l'utilisateur peut réessayer via « J'ai déjà un code ».
    logSafe("tayoo_pin_auth.register.error", { phase: "sign_in" });
    return jsonResponse(500, GENERIC_SERVER_ERROR, decision);
  }

  await resetThrottle(phoneThrottleKey, ipThrottleKey);
  logSafe("tayoo_pin_auth.register.success");
  return jsonResponse(
    200,
    { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token },
    decision,
  );
}

async function handleLogin(ctx: ActionContext): Promise<Response> {
  const { normalizedPhone, pin, phoneKey, phoneThrottleKey, ipThrottleKey, decision } = ctx;

  const { data: rows, error: lookupError } = await adminClient.rpc("pin_auth_lookup_account_api", { p_phone_key: phoneKey });
  if (lookupError) {
    logSafe("tayoo_pin_auth.login.error", { phase: "lookup", code: lookupError.code ?? "unknown" });
    return jsonResponse(500, GENERIC_SERVER_ERROR, decision);
  }
  const account = Array.isArray(rows) ? rows[0] : undefined;
  if (!account) {
    // Jamais distinguer publiquement "compte inexistant" de "PIN incorrect"
    // (corr. Gate Auth §34).
    await recordThrottleFailure(phoneThrottleKey, ipThrottleKey);
    return jsonResponse(401, GENERIC_LOGIN_ERROR, decision);
  }

  const technicalEmail = deriveTechnicalEmail(phoneKey);
  const technicalPassword = await deriveTechnicalPassword(PIN_AUTH_SECRET!, normalizedPhone, pin, account.password_salt as string);

  const { data: signInData, error: signInError } = await establishSession(technicalEmail, technicalPassword);
  if (signInError || !signInData.session) {
    await recordThrottleFailure(phoneThrottleKey, ipThrottleKey);
    return jsonResponse(401, GENERIC_LOGIN_ERROR, decision);
  }

  await resetThrottle(phoneThrottleKey, ipThrottleKey);
  await adminClient.rpc("pin_auth_touch_login_api", { p_user_id: account.user_id as string });
  // Filet de sécurité idempotent (corr. Gate Auth §36) — ne devrait
  // normalement jamais créer un second atelier, l'inscription en a déjà
  // provisionné un.
  await adminClient.rpc("provision_workshop_api", {
    p_owner: account.user_id as string,
    p_name: technicalWorkshopName(account.user_id as string),
  });

  logSafe("tayoo_pin_auth.login.success");
  return jsonResponse(
    200,
    { access_token: signInData.session.access_token, refresh_token: signInData.session.refresh_token },
    decision,
  );
}
