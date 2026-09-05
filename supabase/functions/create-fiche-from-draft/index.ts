// create-fiche-from-draft — Edge Function (Phase 9A)
//
// Contrat de sécurité (mêmes principes que `provision-workshop`, Phase 3A) :
//   - l'identité de l'appelant (`ownerId`) est DÉRIVÉE UNIQUEMENT du JWT
//     vérifié du navigateur (claim `sub`) — jamais d'un champ du corps JSON.
//     `ownerId`/`userId`/`role` envoyés dans le corps sont IGNORÉS.
//   - `workshopId` et `clientId` viennent du corps, mais sont VÉRIFIÉS avant
//     tout appel privilégié via un client SCOPÉ À L'UTILISATEUR (RLS) : la clé
//     secrète ne doit jamais transformer un id fourni par le navigateur en
//     autorisation implicite (la contrainte de clé étrangère composite sur
//     `fiches` reste une SECONDE ligne de défense, jamais la seule) :
//       1. `workshopId` visible par cet utilisateur (RLS `workshop_members`) ;
//       2. rôle de l'utilisateur dans cet atelier ∈ {owner, assistant} ;
//       3. si `clientId` fourni : appartient à CE `workshopId`, non supprimé
//          (RLS `clients_select_member`, elle-même bornée à `workshopId`).
//   - l'appel privilégié final passe par un client serveur authentifié avec
//     la CLÉ SECRÈTE vers `public.create_fiche_from_draft_api` — la SEULE
//     porte PostgREST vers `app_hidden.create_fiche_from_draft` (migration
//     20260905144612).
//
// Reprend intégralement les choix de `provision-workshop` (voir son
// index.ts) : implémentation manuelle (pas `withSupabase()`, réponses
// structurées non personnalisables), `auth.getClaims(jwt)` pour la
// vérification cryptographique, CORS via liste blanche + limite Kong locale
// documentée (valeurs d'en-tête non vérifiables en local, codes de statut
// seuls fiables).
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders as sdkCorsHeaders } from "@supabase/supabase-js/cors";

// ── Configuration (injectée automatiquement par la CLI en local) ───────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const PUBLISHABLE_KEY = safeParseDefaultKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
const SECRET_KEY = safeParseDefaultKey(Deno.env.get("SUPABASE_SECRET_KEYS"));

function safeParseDefaultKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as { default?: string }).default;
  } catch {
    return undefined;
  }
}

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  throw new Error("create-fiche-from-draft: configuration Supabase manquante (URL ou clés).");
}

// Client de VÉRIFICATION du JWT appelant (clé publishable seule).
const verifierClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Client PRIVILÉGIÉ (clé secrète) — seul client autorisé à appeler le wrapper
// RPC réservé à service_role. Jamais utilisé pour lire `workshop_members`/
// `clients` : ces vérifications passent par un client SCOPÉ AU JWT appelant
// (ci-dessous, par requête), pour que la clé secrète ne puisse jamais
// transformer un id fourni par le navigateur en autorisation implicite.
const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Client Supabase authentifié AVEC le JWT de l'appelant — les requêtes
 * passent par PostgREST avec ce JWT, donc sous RLS complète (pas de service
 * role). Sert exclusivement aux vérifications d'autorisation ci-dessous. */
function userScopedClient(jwt: string) {
  return createClient(SUPABASE_URL!, PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ── CORS (identique à provision-workshop — voir son index.ts pour le détail
// et la limite Kong locale documentée) ──────────────────────────────────────
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const ALLOWED_ORIGINS = new Set([
  ...DEFAULT_DEV_ORIGINS,
  ...(Deno.env.get("EXTRA_DEV_ORIGINS")?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
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

function jsonResponse(status: number, body: unknown, decision: OriginDecision): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(decision) },
  });
}

/** Ne jamais logger : numéro de téléphone, JWT, clé secrète/publishable, ni
 * le contenu du brouillon (peut porter des données identifiantes en clair
 * via `metadata.legacy_identity`). */
function logSafe(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

const MAX_UUID_LENGTH = 64; // large marge — un uuid fait 36 caractères

function isPlausibleUuid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_UUID_LENGTH;
}

Deno.serve(async (req: Request) => {
  const decision = classifyOrigin(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    if (decision.kind === "forbidden") {
      logSafe("create_fiche_from_draft.cors_forbidden", { reason: "preflight_origin_not_allowed" });
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(decision) });
  }

  if (decision.kind === "forbidden") {
    logSafe("create_fiche_from_draft.cors_forbidden", { reason: "origin_not_allowed" });
    return new Response(JSON.stringify({ error: "forbidden_origin", message: "Origine non autorisée." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(400, { error: "invalid_request", message: "Méthode non supportée." }, decision);
  }

  // 1) Authorization présent et bien formé.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logSafe("create_fiche_from_draft.unauthorized", { reason: "missing_authorization_header" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    logSafe("create_fiche_from_draft.unauthorized", { reason: "empty_bearer_token" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }

  // 2) Vérification CRYPTOGRAPHIQUE du JWT — jamais un décodage non vérifié.
  let ownerId: string | undefined;
  let jwtRole: string | undefined;
  try {
    const { data, error } = await verifierClient.auth.getClaims(jwt);
    if (error || !data?.claims?.sub) {
      logSafe("create_fiche_from_draft.unauthorized", { reason: "invalid_or_expired_jwt" });
      return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
    }
    ownerId = data.claims.sub as string;
    jwtRole = (data.claims as { role?: string }).role;
  } catch {
    logSafe("create_fiche_from_draft.unauthorized", { reason: "getClaims_threw" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }

  // 3) Défense en profondeur : le rôle du JWT doit être `authenticated`
  // (jamais `anon`/`service_role` en provenance du navigateur).
  if (jwtRole && jwtRole !== "authenticated") {
    logSafe("create_fiche_from_draft.forbidden", { reason: "unexpected_jwt_role" });
    return jsonResponse(403, { error: "forbidden", message: "Accès refusé." }, decision);
  }

  // 4) Corps de requête — SEULS `workshopId`/`clientId`/`fiche` sont lus.
  // `ownerId`/`userId`/`role` envoyés depuis le navigateur sont
  // silencieusement ignorés : l'identité vient exclusivement de `ownerId`
  // (dérivé du JWT vérifié ci-dessus), jamais du corps.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête JSON invalide." }, decision);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête invalide." }, decision);
  }
  const { workshopId, clientId, fiche } = body as { workshopId?: unknown; clientId?: unknown; fiche?: unknown };

  if (!isPlausibleUuid(workshopId)) {
    return jsonResponse(400, { error: "invalid_request", message: "workshopId requis." }, decision);
  }
  if (clientId !== null && clientId !== undefined && !isPlausibleUuid(clientId)) {
    return jsonResponse(400, { error: "invalid_request", message: "clientId invalide." }, decision);
  }
  const normalizedClientId: string | null = typeof clientId === "string" ? clientId : null;
  if (typeof fiche !== "object" || fiche === null || Array.isArray(fiche)) {
    return jsonResponse(400, { error: "invalid_request", message: "fiche requis (objet)." }, decision);
  }

  // 5) Autorisation — TOUJOURS via un client scopé au JWT appelant (RLS),
  // JAMAIS via le client admin. Une seule requête suffit à vérifier à la fois
  // « workshopId visible par cet utilisateur » et « rôle ∈ {owner,
  // assistant} » : la ligne n'existe (et n'est visible) QUE si l'utilisateur
  // est effectivement membre de cet atelier (policy `workshop_members_select`
  // : `user_id = auth.uid()` couvre toujours ce cas, quel que soit le rôle).
  const scoped = userScopedClient(jwt);
  const { data: membership, error: membershipError } = await scoped
    .from("workshop_members")
    .select("role")
    .eq("workshop_id", workshopId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (membershipError) {
    logSafe("create_fiche_from_draft.error", { phase: "membership_check", code: membershipError.code ?? "unknown" });
    return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
  }
  if (!membership || (membership.role !== "owner" && membership.role !== "assistant")) {
    logSafe("create_fiche_from_draft.forbidden", { reason: "not_a_workshop_member" });
    return jsonResponse(403, { error: "forbidden", message: "Accès refusé à cet atelier." }, decision);
  }

  // 6) Si un client est fourni, vérifier qu'il appartient à CE workshopId et
  // n'est pas supprimé — via le MÊME client scopé RLS (jamais le client
  // admin). Le refus d'un client hors atelier reste une décision prise ICI,
  // AVANT le RPC privilégié — la contrainte de clé étrangère composite sur
  // `fiches` (23503) n'est qu'une seconde ligne de défense, jamais la seule.
  if (normalizedClientId) {
    const { data: client, error: clientError } = await scoped
      .from("clients")
      .select("id")
      .eq("id", normalizedClientId)
      .eq("workshop_id", workshopId)
      .is("deleted_at", null)
      .maybeSingle();

    if (clientError) {
      logSafe("create_fiche_from_draft.error", { phase: "client_check", code: clientError.code ?? "unknown" });
      return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
    }
    if (!client) {
      logSafe("create_fiche_from_draft.invalid_client", { reason: "client_not_in_workshop" });
      return jsonResponse(400, { error: "invalid_client", message: "Ce client n'existe pas dans cet atelier." }, decision);
    }
  }

  // 7) Appel privilégié — SEUL point d'écriture, via la SEULE porte RPC.
  const { data, error } = await adminClient.rpc("create_fiche_from_draft_api", {
    p_workshop_id: workshopId,
    p_client_id: normalizedClientId,
    p_fiche: fiche,
  });

  if (error) {
    // Règle anti-fiche-vide (app_hidden.create_fiche_from_draft, testée
    // T32/T33) — jamais un 500 générique pour un brouillon vide.
    if (error.code === "23514") {
      return jsonResponse(422, { error: "empty_draft", message: "Le brouillon est vide." }, decision);
    }
    // Client hors atelier détecté au niveau SQL (seconde ligne de défense —
    // ne devrait normalement plus se produire après la vérification §6).
    if (error.code === "23503") {
      logSafe("create_fiche_from_draft.invalid_client", { reason: "fk_violation_at_sql_level" });
      return jsonResponse(400, { error: "invalid_client", message: "Ce client n'existe pas dans cet atelier." }, decision);
    }
    // Payload malformé (racine non-objet, type invalide) — erreurs contrôlées
    // de app_hidden.create_fiche_from_draft.
    if (error.code === "22004" || error.code === "22023") {
      return jsonResponse(400, { error: "invalid_request", message: "Brouillon invalide." }, decision);
    }
    logSafe("create_fiche_from_draft.error", { phase: "rpc", code: error.code ?? "unknown" });
    return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
  }

  logSafe("create_fiche_from_draft.success");
  return jsonResponse(200, { fiche: data }, decision);
});
