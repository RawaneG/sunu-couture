// provision-workshop — Edge Function (Phase 3A)
//
// Contrat de sécurité (FRONTIÈRE service_role, corr. Q du schéma Phase 2) :
//   - l'identité de l'owner (`p_owner`) est DÉRIVÉE UNIQUEMENT du JWT vérifié
//     du navigateur (claim `sub`) — jamais d'un champ du corps JSON ;
//   - seul le nom de l'atelier est accepté depuis le navigateur ;
//   - l'appel privilégié passe par un client serveur authentifié avec la
//     CLÉ SECRÈTE (`sb_secret_…`, équivalent moderne de `service_role`) vers
//     `public.provision_workshop_api` — la SEULE porte PostgREST vers
//     `app_hidden.provision_workshop` (migration 20260830160310).
//
// CHOIX D'IMPLÉMENTATION (documenté — voir supabase/README.md « Phase 3A ») :
// le template généré par `supabase functions new` sur cette CLI (2.116.0)
// utilise par défaut `withSupabase()` du nouveau package `@supabase/server`
// (https://supabase.com/blog/introducing-supabase-server). Testé en local :
// `withSupabase({ auth: 'user' })` répond bien 401 sans JWT valide, MAIS avec
// un corps qu'on ne peut pas personnaliser (`{"message":"Invalid
// credentials","code":"INVALID_CREDENTIALS"}`, généré avant que le handler ne
// s'exécute) — incompatible avec l'exigence de réponses STRUCTURÉES
// homogènes 400/401/403/409/500. Implémentation manuelle retenue à la place :
// `supabase-js` (même version exacte que le front, 2.112.4) +
// `auth.getClaims(jwt)` — la méthode de vérification cryptographique
// actuellement recommandée par Supabase (vérification locale via JWKS quand
// le projet utilise des clés de signature asymétriques — confirmé en local :
// `SUPABASE_JWKS` expose une clé `"kty":"EC"` — sinon vérification serveur,
// jamais un simple décodage non vérifié). Ceci donne un contrôle total et
// vérifiable sur CHAQUE réponse, condition explicitement requise ici.
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
// En-têtes CORS OFFICIELLEMENT recommandés pour la version installée de
// supabase-js (2.112.4 ≥ 2.95.0) : importés directement du SDK plutôt que
// recopiés à la main, pour rester alignés avec les en-têtes que les
// bibliothèques clientes envoient réellement (mis à jour automatiquement à
// chaque upgrade de supabase-js). https://supabase.com/docs/guides/functions/cors
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
  // Erreur de configuration au démarrage — jamais une clé dans le message.
  throw new Error("provision-workshop: configuration Supabase manquante (URL ou clés).");
}

// Client de VÉRIFICATION du JWT appelant (clé publishable — jamais la clé
// secrète pour cet usage).
const verifierClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Client PRIVILÉGIÉ (clé secrète) — seul client autorisé à appeler le wrapper
// RPC réservé à service_role.
const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── CORS ─────────────────────────────────────────────────────────────────
// La vérification JWT (getClaims, ci-dessous) reste la protection PRINCIPALE
// de cette fonction — le CORS n'est qu'une défense en profondeur côté
// navigateur, jamais un contrôle d'accès en soi (un appel serveur-à-serveur ou
// via curl ignore totalement le CORS).
//
// `Access-Control-Allow-Headers` provient du SDK (`sdkCorsHeaders`) —
// recommandation officielle pour supabase-js ≥ 2.95.0, reste aligné
// automatiquement avec les en-têtes que les bibliothèques clientes envoient.
// `Access-Control-Allow-Origin` reste une logique maison (liste blanche
// locale/dev) : le SDK ne fournit qu'un `*` générique, insuffisant ici.
//
// LIMITE CONNUE (testée, voir supabase/README.md « Phase 3A ») : sur la stack
// Docker locale, la passerelle Kong répond ELLE-MÊME au préflight `OPTIONS`
// (avec `Access-Control-Allow-Origin: *`) et RÉÉCRIT l'en-tête de réponse même
// pour une origine hors liste blanche — le code ci-dessous n'est donc PAS
// vérifiable de bout en bout en local. La logique de restriction d'origine
// reste implémentée et testée unitairement, mais sa validation réelle
// (origine effectivement bloquée par le navigateur) est REPORTÉE à la Phase 3B
// (déploiement distant, où le comportement de la passerelle diffère). Ne pas
// considérer le CORS local comme un test de sécurité réussi.
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

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    ...sdkCorsHeaders,
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

/** Ne jamais logger : numéro de téléphone complet, JWT, clé secrète/publishable. */
function logSafe(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

const MAX_NAME_LENGTH = 120;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResponse(400, { error: "invalid_request", message: "Méthode non supportée." }, origin);
  }

  // 1) Authorization présent et bien formé.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logSafe("provision_workshop.unauthorized", { reason: "missing_authorization_header" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, origin);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    logSafe("provision_workshop.unauthorized", { reason: "empty_bearer_token" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, origin);
  }

  // 2) Vérification CRYPTOGRAPHIQUE du JWT — jamais un décodage non vérifié.
  let ownerId: string | undefined;
  let role: string | undefined;
  try {
    const { data, error } = await verifierClient.auth.getClaims(jwt);
    if (error || !data?.claims?.sub) {
      logSafe("provision_workshop.unauthorized", { reason: "invalid_or_expired_jwt" });
      return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, origin);
    }
    ownerId = data.claims.sub as string;
    role = (data.claims as { role?: string }).role;
  } catch {
    logSafe("provision_workshop.unauthorized", { reason: "getClaims_threw" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, origin);
  }

  // 3) Défense en profondeur : le rôle du JWT doit être `authenticated`
  // (jamais `anon`/`service_role` en provenance du navigateur).
  if (role && role !== "authenticated") {
    logSafe("provision_workshop.forbidden", { reason: "unexpected_role" });
    return jsonResponse(403, { error: "forbidden", message: "Accès refusé." }, origin);
  }

  // 4) Corps de requête : SEUL `name` est lu. `owner_id` / `user_id` envoyés
  // par erreur ou malice depuis le navigateur sont silencieusement ignorés —
  // jamais lus, jamais transmis à la base. L'identité vient exclusivement de
  // `ownerId` (dérivé du JWT vérifié ci-dessus).
  //
  // `name` PEUT être `null` (ou absent) — c'est le mode SONDE utilisé par le
  // front juste après connexion pour savoir si un atelier existe déjà, SANS
  // jamais inventer de nom. Seul un type manifestement invalide (nombre,
  // objet, tableau…) ou une chaîne trop longue est rejeté en 400 ; une chaîne
  // vide/blanche est traitée comme "pas de nom" (transmise telle quelle au
  // wrapper SQL, qui a la même tolérance).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête JSON invalide." }, origin);
  }
  const rawName = typeof body === "object" && body !== null && "name" in body ? (body as { name: unknown }).name : undefined;

  let name: string | null;
  if (rawName === undefined || rawName === null) {
    name = null;
  } else if (typeof rawName === "string") {
    if (rawName.length > MAX_NAME_LENGTH) {
      return jsonResponse(
        400,
        { error: "invalid_request", message: `Le nom de l'atelier est trop long (${MAX_NAME_LENGTH} caractères maximum).` },
        origin,
      );
    }
    name = rawName;
  } else {
    return jsonResponse(400, { error: "invalid_request", message: "Le nom de l'atelier doit être du texte." }, origin);
  }

  // 5) Appel privilégié — SEUL point d'écriture, via la SEULE porte RPC.
  const { data, error } = await adminClient.rpc("provision_workshop_api", {
    p_owner: ownerId,
    p_name: name,
  });

  if (error) {
    // Erreur métier CONTRÔLÉE : aucun atelier existant et aucun nom fourni —
    // jamais un nom inventé automatiquement, jamais un 500 générique.
    if (error.code === "WSN01") {
      return jsonResponse(
        400,
        { error: "WORKSHOP_NAME_REQUIRED", message: "Entre le nom de ton atelier pour continuer." },
        origin,
      );
    }
    // Défensif : une violation d'unicité inattendue (course extrême au-delà
    // du verrou advisory côté SQL, ou évolution future du schéma) devient un
    // 409 explicite plutôt qu'un 500 générique.
    if (error.code === "23505") {
      logSafe("provision_workshop.conflict", { code: error.code });
      return jsonResponse(409, { error: "conflict", message: "Un atelier existe déjà pour ce compte." }, origin);
    }
    logSafe("provision_workshop.error", { code: error.code ?? "unknown" });
    return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, origin);
  }

  logSafe("provision_workshop.success");
  return jsonResponse(200, { workshop: data }, origin);
});
