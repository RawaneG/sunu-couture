// import-legacy-data — Edge Function (Phase 6B0)
//
// INFRASTRUCTURE UNIQUEMENT (voir docs/refonte/02-PLAN-MIGRATION.md §6B0) :
// cette fonction est la SEULE porte réseau vers les 7 fonctions
// `app_hidden.import_legacy_*` (migration 20260908194925). Phase 6B0
// construit ce relais ; Phase 6B pilotera le VRAI import (UI migration,
// lecture des fichiers legacy, orchestration `migrationMap`) — aucune
// donnée réelle n'est importée par cette fonction elle-même.
//
// Contrat de sécurité (mêmes principes que `create-fiche-from-draft`,
// durcis pour l'import legacy — corr. Q, §16 du plan) :
//   - l'identité de l'appelant (`ownerId`) est DÉRIVÉE UNIQUEMENT du JWT
//     vérifié (claim `sub`) — jamais d'un champ du corps JSON ;
//   - `workshopId` fourni par le corps est VÉRIFIÉ via un client SCOPÉ AU
//     JWT appelant (RLS réelle), jamais présumé légitime ;
//   - rôle requis = EXACTEMENT `owner` — un `assistant` est REFUSÉ pour
//     TOUTE opération d'import legacy (plus strict que
//     `create-fiche-from-draft`, qui accepte owner ET assistant) ;
//   - l'appel privilégié final passe par le client SECRET vers les
//     wrappers `public.import_legacy_*_api` — la SEULE porte PostgREST vers
//     `app_hidden.import_legacy_*` (`app_hidden` non listé dans
//     `[api].schemas`, même limite déjà rencontrée pour
//     `create_fiche_from_draft_api`/`provision_workshop_api` — jamais
//     contournée en exposant `app_hidden` globalement) ;
//   - le Storage (médias) est uploadé AVANT l'appel RPC, sur un chemin
//     DÉTERMINISTE (jamais `crypto.randomUUID()`) pour survivre à un retry
//     sans créer un second blob — voir `buildLegacyMediaPath` ci-dessous.
//
// API minimale, typée, explicite (§18) : une opération unique par appel
// (`operation.type` ∈ client|carnet|fiche|payment|modele|fiche_media|
// modele_media), jamais de SQL arbitraire, payload strictement validé.
// Chaque opération est idempotente côté serveur (PostgreSQL fait autorité,
// jamais `migrationMap` IndexedDB côté 6B) : la même opération rejouée
// renvoie la même ligne, sans doublon.
//
// CORRECTIFS revue PR #20 (candidate jamais mergée/déployée) :
//   §1 `carnet.status` (active/archived, allow-list stricte) — fidélité du
//      mapping canonique Phase 6 (carnet legacy le plus élevé = active, les
//      précédents = archived) ;
//   §2 `fiche.createdAt`/`fiche.settledAt` (ISO-8601, facultatifs) — préserve
//      l'historique temporel legacy (`f.createdAt`/`f.soldeLe`) ;
//   §3 `fiche_media.metadata`/`modele_media.metadata` transmise TELLE QUELLE
//      au RPC (D7 : duration_seconds, dimensions, codec, checksum…), jamais
//      remplacée par `{}` ;
//   §4 validation stricte des nombres (entiers finis, jamais NaN/Infinity)
//      et des dates (YYYY-MM-DD / ISO-8601) AVANT tout RPC — un payload
//      invalide reste un 400 contrôlé, jamais un 500 issu d'un cast
//      PostgreSQL imprévisible.
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
  throw new Error("import-legacy-data: configuration Supabase manquante (URL ou clés).");
}

// Client de VÉRIFICATION du JWT appelant (clé publishable seule).
const verifierClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Client PRIVILÉGIÉ (clé secrète) — seul client autorisé à appeler les
// wrappers RPC réservés à service_role, et à écrire dans Storage sans être
// soumis aux policies `authenticated` (service_role contourne RLS ; les
// policies `storage.objects` restent néanmoins respectées dans la
// CONSTRUCTION du path, pour qu'une lecture ultérieure côté navigateur
// (authenticated) reste cohérente avec la convention 4-segments).
const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Client Supabase authentifié AVEC le JWT de l'appelant — requêtes sous RLS
 * complète (pas de service role). Sert exclusivement aux vérifications
 * d'autorisation ci-dessous — jamais à une écriture. */
function userScopedClient(jwt: string) {
  return createClient(SUPABASE_URL!, PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ── CORS (identique à create-fiche-from-draft) ──────────────────────────────
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

/** Ne jamais logger : téléphone, JWT, clé secrète/publishable, nom/legacy_id
 * client, ni le contenu base64 d'un média. */
function logSafe(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

const MAX_LEGACY_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
// Borne défensive sur la taille d'un média encodé en base64 (~10 Mo
// binaires décodés) — un garde-fou de ressource, pas une décision produit :
// évite qu'un payload démesuré ne consomme la mémoire de la fonction.
const MAX_BASE64_LENGTH = 14_000_000;

// Format RÉEL (pas seulement une borne de longueur, contrairement à
// `create-fiche-from-draft`) : un `workshopId`/`carnetId`/`ficheId`/... qui
// PASSE la validation applicative mais échoue au niveau PostgREST (comparaison
// `text` fournie par le navigateur contre une colonne `uuid`) revient comme
// une erreur PostgREST NON structurée — un 500 générique serait alors
// indiscernable d'une vraie panne. Un rejet 400 explicite, ICI, avant toute
// requête, referme ce trou (couvert par le test §21 « payload invalide »).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isPlausibleUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
function isNonEmptyString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function isOptionalString(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string | undefined | null {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength);
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOptionalPlainObject(value: unknown): value is Record<string, unknown> | undefined {
  return value === undefined || isPlainObject(value);
}
// CORRECTIF revue PR #20 (§4) : un `typeof value === "number"` seul laisse
// passer NaN/Infinity/-Infinity et des décimaux (12.5) jusqu'au RPC, où un
// cast PostgreSQL imprévisible peut produire un 500 au lieu d'un 400 — voir
// `isFiniteInt`/`isIntAtLeast` ci-dessous, utilisés pour TOUT entier reçu du
// corps de requête (numbers, ordinal, position, montants, quantité).
function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}
function isIntAtLeast(value: unknown, min: number): value is number {
  return isFiniteInt(value) && value >= min;
}
function isPositiveInt(value: unknown): value is number {
  return isIntAtLeast(value, 1);
}

// Dates/horodatages — validés STRICTEMENT avant tout RPC (jamais une simple
// chaîne non vérifiée) : un format inattendu doit renvoyer un 400 contrôlé
// ICI, jamais un cast PostgreSQL imprévisible côté serveur (corr. PR #20 §4).
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Rejette les dates calendaires invalides (ex. 2024-02-30) que `Date`
  // normalise silencieusement au lieu de lever une erreur — round-trip strict.
  return d.toISOString().slice(0, 10) === value;
}
function isOptionalDateOnly(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isValidDateOnly(value);
}
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP_RE.test(value) && !Number.isNaN(Date.parse(value));
}
function isOptionalIsoTimestamp(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isValidIsoTimestamp(value);
}

// Chemins Storage déterministes (Phase 8A/8B, mêmes conventions que
// `src/repositories/supabase/mediaPath.ts`) — dupliqués ici intentionnellement
// (aucun partage de code entre l'arbre Vite frontend et les Edge Functions
// Deno, même choix déjà fait pour `crypto.ts` de `tayoo-pin-auth`). Le
// dernier segment est déterministe (`legacy-{kind}-{ordinal}`), jamais
// `crypto.randomUUID()` : un retry sur le MÊME ordinal reconstruit
// EXACTEMENT le même path, condition nécessaire à l'idempotence Storage.
const MEDIA_BUCKET = "media";
function buildLegacyFicheMediaPath(workshopId: string, ficheId: string, kind: string, ordinal: number): string {
  return `workshops/${workshopId}/fiches/${ficheId}/legacy-${kind}-${ordinal}`;
}
function buildLegacyModeleMediaPath(workshopId: string, modeleId: string, kind: string, ordinal: number): string {
  return `workshops/${workshopId}/modeles/${modeleId}/legacy-${kind}-${ordinal}`;
}

const FICHE_MEDIA_KINDS = new Set(["fabric_photo", "voice_note", "signature"]);
const MODELE_MEDIA_KINDS = new Set(["photo", "patron"]);
// CORRECTIF revue PR #20 (§1) : le mapping canonique Phase 6 exige que SEUL
// le carnet legacy le plus élevé soit `active`, tous les précédents
// `archived` — jamais `full` (calculé par l'app normale, sans rapport avec
// l'import). Allow-list stricte, jamais une valeur arbitraire transmise telle
// quelle au RPC (qui la revalide de toute façon — défense en profondeur).
const CARNET_IMPORT_STATUSES = new Set(["active", "archived"]);

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

/** Mappe une erreur PostgreSQL (déjà connue et volontairement codée dans les
 * fonctions `app_hidden.import_legacy_*`) vers une réponse HTTP contrôlée —
 * jamais un 500 générique pour une erreur de validation attendue. */
function mapRpcError(error: { code?: string; message: string }, decision: OriginDecision): Response {
  // Paramètre requis manquant / valeur nulle (22004 — raised explicitement).
  if (error.code === "22004") {
    return jsonResponse(400, { error: "invalid_request", message: "Champ requis manquant ou invalide." }, decision);
  }
  // Valeur hors contrat (22023 — raised explicitement, ex : type de média,
  // statut legacy, montant non positif).
  if (error.code === "22023") {
    return jsonResponse(400, { error: "invalid_request", message: "Valeur invalide pour cette opération." }, decision);
  }
  // Parent hors atelier / inexistant (23503) — seconde ligne de défense
  // après la vérification RLS ci-dessous, ne devrait normalement plus se
  // produire.
  if (error.code === "23503") {
    return jsonResponse(400, { error: "invalid_reference", message: "Référence invalide pour cet atelier." }, decision);
  }
  // Contrainte CHECK violée (23514) — ex : montant <= 0 arrivé jusqu'au SQL.
  if (error.code === "23514") {
    return jsonResponse(422, { error: "invalid_request", message: "Donnée rejetée par une contrainte métier." }, decision);
  }
  logSafe("import_legacy_data.rpc_error", { code: error.code ?? "unknown" });
  return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
}

Deno.serve(async (req: Request) => {
  const decision = classifyOrigin(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    if (decision.kind === "forbidden") {
      logSafe("import_legacy_data.cors_forbidden", { reason: "preflight_origin_not_allowed" });
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(decision) });
  }

  if (decision.kind === "forbidden") {
    logSafe("import_legacy_data.cors_forbidden", { reason: "origin_not_allowed" });
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
    logSafe("import_legacy_data.unauthorized", { reason: "missing_authorization_header" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    logSafe("import_legacy_data.unauthorized", { reason: "empty_bearer_token" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }

  // 2) Vérification CRYPTOGRAPHIQUE du JWT — jamais un décodage non vérifié.
  let ownerId: string | undefined;
  let jwtRole: string | undefined;
  try {
    const { data, error } = await verifierClient.auth.getClaims(jwt);
    if (error || !data?.claims?.sub) {
      logSafe("import_legacy_data.unauthorized", { reason: "invalid_or_expired_jwt" });
      return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
    }
    ownerId = data.claims.sub as string;
    jwtRole = (data.claims as { role?: string }).role;
  } catch {
    logSafe("import_legacy_data.unauthorized", { reason: "getClaims_threw" });
    return jsonResponse(401, { error: "unauthorized", message: "Session invalide. Reconnecte-toi." }, decision);
  }

  // 3) Défense en profondeur : le rôle du JWT doit être `authenticated`.
  if (jwtRole && jwtRole !== "authenticated") {
    logSafe("import_legacy_data.forbidden", { reason: "unexpected_jwt_role" });
    return jsonResponse(403, { error: "forbidden", message: "Accès refusé." }, decision);
  }

  // 4) Corps de requête — seuls `workshopId`/`operation` sont lus. Un
  // `ownerId`/`userId`/`role` envoyé depuis le navigateur est ignoré :
  // l'identité vient exclusivement du JWT vérifié ci-dessus.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête JSON invalide." }, decision);
  }
  if (!isPlainObject(body)) {
    return jsonResponse(400, { error: "invalid_request", message: "Corps de requête invalide." }, decision);
  }
  const { workshopId, operation } = body as { workshopId?: unknown; operation?: unknown };

  if (!isPlausibleUuid(workshopId)) {
    return jsonResponse(400, { error: "invalid_request", message: "workshopId requis." }, decision);
  }
  if (!isPlainObject(operation) || typeof operation.type !== "string") {
    return jsonResponse(400, { error: "invalid_request", message: "operation requise (objet typé)." }, decision);
  }

  // 5) Autorisation — TOUJOURS via un client scopé au JWT appelant (RLS),
  // JAMAIS via le client admin. Rôle requis = EXACTEMENT `owner` (plus
  // strict que `create-fiche-from-draft` : un `assistant` est refusé pour
  // TOUTE opération d'import legacy — §16 du plan).
  const scoped = userScopedClient(jwt);
  const { data: membership, error: membershipError } = await scoped
    .from("workshop_members")
    .select("role")
    .eq("workshop_id", workshopId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (membershipError) {
    logSafe("import_legacy_data.error", { phase: "membership_check", code: membershipError.code ?? "unknown" });
    return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
  }
  if (!membership) {
    logSafe("import_legacy_data.forbidden", { reason: "not_a_workshop_member" });
    return jsonResponse(403, { error: "forbidden", message: "Accès refusé à cet atelier." }, decision);
  }
  if (membership.role !== "owner") {
    logSafe("import_legacy_data.forbidden", { reason: "role_not_owner" });
    return jsonResponse(403, { error: "forbidden", message: "Seul le propriétaire de l'atelier peut importer des données." }, decision);
  }

  /** Vérifie, via le client SCOPÉ RLS (jamais l'admin), qu'une ligne
   * `table.id = id` appartient bien à `workshopId` et n'est pas supprimée.
   * Utilisé avant tout RPC référençant un parent (carnet/client/fiche/
   * modèle) — la FK composite SQL reste une seconde ligne de défense,
   * jamais la seule (même principe que `create-fiche-from-draft` §6). */
  async function belongsToWorkshop(table: "carnets" | "clients" | "fiches" | "modeles", id: string): Promise<boolean | "error"> {
    const { data, error } = await scoped
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("workshop_id", workshopId as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      // `carnets` n'a pas de colonne `deleted_at` — reformule sans ce filtre.
      if (error.code === "42703") {
        const retry = await scoped.from(table).select("id").eq("id", id).eq("workshop_id", workshopId as string).maybeSingle();
        if (retry.error) return "error";
        return Boolean(retry.data);
      }
      return "error";
    }
    return Boolean(data);
  }

  const opType = operation.type;

  // ── client ─────────────────────────────────────────────────────────────
  if (opType === "client") {
    const legacyId = operation.legacyId;
    const displayName = operation.displayName;
    const firstName = operation.firstName;
    const lastName = operation.lastName;
    const phoneE164 = operation.phoneE164;
    const phoneDisplay = operation.phoneDisplay;
    const metadata = operation.metadata;
    if (
      !isNonEmptyString(legacyId, MAX_LEGACY_ID_LENGTH) ||
      !isNonEmptyString(displayName, 200) ||
      !isOptionalString(firstName, 200) ||
      !isOptionalString(lastName, 200) ||
      !isOptionalString(phoneE164, 32) ||
      !isOptionalString(phoneDisplay, 32) ||
      !isOptionalPlainObject(metadata)
    ) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération client invalide." }, decision);
    }
    const { data, error } = (await adminClient.rpc("import_legacy_client_api", {
      p_workshop_id: workshopId,
      p_legacy_id: legacyId,
      p_display_name: displayName,
      p_first_name: firstName ?? null,
      p_last_name: lastName ?? null,
      p_phone_e164: phoneE164 ?? null,
      p_phone_display: phoneDisplay ?? null,
      p_metadata: metadata ?? {},
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "client" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── carnet ─────────────────────────────────────────────────────────────
  if (opType === "carnet") {
    const number = operation.number;
    const nextNumber = operation.nextNumber;
    const status = operation.status;
    if (
      !isPositiveInt(number) ||
      !isPositiveInt(nextNumber) ||
      (status !== undefined && (typeof status !== "string" || !CARNET_IMPORT_STATUSES.has(status)))
    ) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération carnet invalide." }, decision);
    }
    const { data, error } = (await adminClient.rpc("import_legacy_carnet_api", {
      p_workshop_id: workshopId,
      p_number: number,
      p_next_number: nextNumber,
      p_status: status ?? "active",
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "carnet" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── fiche ──────────────────────────────────────────────────────────────
  if (opType === "fiche") {
    const carnetId = operation.carnetId;
    const clientId = operation.clientId;
    const legacyId = operation.legacyId;
    const number = operation.number;
    const legacyStatus = operation.legacyStatus;
    const measurements = operation.measurements;
    const garment = operation.garment;
    const description = operation.description;
    const fabricNotes = operation.fabricNotes;
    const quantity = operation.quantity;
    const dueDate = operation.dueDate;
    const totalPrice = operation.totalPrice;
    const metadata = operation.metadata;
    const createdAt = operation.createdAt;
    const settledAt = operation.settledAt;
    if (
      !isPlausibleUuid(carnetId) ||
      (clientId !== null && clientId !== undefined && !isPlausibleUuid(clientId)) ||
      !isNonEmptyString(legacyId, MAX_LEGACY_ID_LENGTH) ||
      !isPositiveInt(number) ||
      !isNonEmptyString(legacyStatus, 40) ||
      !isOptionalPlainObject(measurements) ||
      !isOptionalString(garment, 200) ||
      !isOptionalString(description, MAX_TEXT_LENGTH) ||
      !isOptionalString(fabricNotes, MAX_TEXT_LENGTH) ||
      (quantity !== undefined && !isPositiveInt(quantity)) ||
      !isOptionalDateOnly(dueDate) ||
      (totalPrice !== undefined && !isIntAtLeast(totalPrice, 0)) ||
      !isOptionalPlainObject(metadata) ||
      !isOptionalIsoTimestamp(createdAt) ||
      !isOptionalIsoTimestamp(settledAt)
    ) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération fiche invalide." }, decision);
    }
    const normalizedClientId = typeof clientId === "string" ? clientId : null;

    const carnetOk = await belongsToWorkshop("carnets", carnetId);
    if (carnetOk === "error") return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
    if (!carnetOk) return jsonResponse(400, { error: "invalid_reference", message: "Ce carnet n'existe pas dans cet atelier." }, decision);

    if (normalizedClientId) {
      const clientOk = await belongsToWorkshop("clients", normalizedClientId);
      if (clientOk === "error") return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
      if (!clientOk) return jsonResponse(400, { error: "invalid_reference", message: "Ce client n'existe pas dans cet atelier." }, decision);
    }

    const { data, error } = (await adminClient.rpc("import_legacy_fiche_api", {
      p_workshop_id: workshopId,
      p_carnet_id: carnetId,
      p_client_id: normalizedClientId,
      p_legacy_id: legacyId,
      p_number: number,
      p_legacy_status: legacyStatus,
      p_measurements: measurements ?? {},
      p_garment: garment ?? "",
      p_description: description ?? null,
      p_fabric_notes: fabricNotes ?? null,
      p_quantity: quantity ?? 1,
      p_due_date: dueDate ?? null,
      p_total_price: totalPrice ?? 0,
      p_metadata: metadata ?? {},
      p_created_at: createdAt ?? null,
      p_settled_at: settledAt ?? null,
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "fiche" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── payment ────────────────────────────────────────────────────────────
  if (opType === "payment") {
    const ficheId = operation.ficheId;
    const amount = operation.amount;
    const recordedAt = operation.recordedAt;
    if (!isPlausibleUuid(ficheId) || !isPositiveInt(amount) || !isOptionalIsoTimestamp(recordedAt)) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération paiement invalide." }, decision);
    }
    const ficheOk = await belongsToWorkshop("fiches", ficheId);
    if (ficheOk === "error") return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
    if (!ficheOk) return jsonResponse(400, { error: "invalid_reference", message: "Cette fiche n'existe pas dans cet atelier." }, decision);

    const { data, error } = (await adminClient.rpc("import_legacy_payment_api", {
      p_workshop_id: workshopId,
      p_fiche_id: ficheId,
      p_amount: amount,
      p_recorded_at: recordedAt ?? new Date().toISOString(),
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "payment" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── modele ─────────────────────────────────────────────────────────────
  if (opType === "modele") {
    const legacyId = operation.legacyId;
    const nom = operation.nom;
    const metadata = operation.metadata;
    if (!isNonEmptyString(legacyId, MAX_LEGACY_ID_LENGTH) || !isNonEmptyString(nom, 200) || !isOptionalPlainObject(metadata)) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération modèle invalide." }, decision);
    }
    const { data, error } = (await adminClient.rpc("import_legacy_modele_api", {
      p_workshop_id: workshopId,
      p_legacy_id: legacyId,
      p_nom: nom,
      p_metadata: metadata ?? {},
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "modele" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── fiche_media ────────────────────────────────────────────────────────
  if (opType === "fiche_media") {
    const ficheId = operation.ficheId;
    const kind = operation.kind;
    const ordinal = operation.ordinal;
    const mimeType = operation.mimeType;
    const contentBase64 = operation.contentBase64;
    const metadata = operation.metadata;
    if (
      !isPlausibleUuid(ficheId) ||
      typeof kind !== "string" ||
      !FICHE_MEDIA_KINDS.has(kind) ||
      !isPositiveInt(ordinal) ||
      !isNonEmptyString(mimeType, 100) ||
      typeof contentBase64 !== "string" ||
      contentBase64.length === 0 ||
      contentBase64.length > MAX_BASE64_LENGTH ||
      !isOptionalPlainObject(metadata)
    ) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération média fiche invalide." }, decision);
    }
    const ficheOk = await belongsToWorkshop("fiches", ficheId);
    if (ficheOk === "error") return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
    if (!ficheOk) return jsonResponse(400, { error: "invalid_reference", message: "Cette fiche n'existe pas dans cet atelier." }, decision);

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(contentBase64);
    } catch {
      return jsonResponse(400, { error: "invalid_request", message: "Contenu média invalide (base64)." }, decision);
    }

    const path = buildLegacyFicheMediaPath(workshopId, ficheId, kind, ordinal);
    const upload = await adminClient.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
    // Retry-safe : si l'objet existe déjà EXACTEMENT à ce chemin déterministe,
    // c'est une reprise normale (crash/retry) — jamais une erreur bloquante.
    // Un chemin différent appartenant à une AUTRE entité ne peut jamais
    // collisionner ici (le chemin encode workshopId + ficheId réels).
    if (upload.error && !/duplicate|already exists|resource already exists/i.test(upload.error.message)) {
      logSafe("import_legacy_data.storage_error", { phase: "fiche_media_upload" });
      return jsonResponse(500, { error: "internal_error", message: "Échec de l'envoi du média. Réessaie plus tard." }, decision);
    }

    // CORRECTIF revue PR #20 (§3) : la `metadata` legacy sûre (durée, dimensions,
    // codec, checksum — D7) doit atteindre `media_assets.metadata`, jamais être
    // remplacée par `{}` — transmise TELLE QUELLE, jamais transformée. Elle ne
    // peut jamais écraser workshop_id/fiche_id/type/storage_path : ces champs
    // restent des colonnes structurées issues des paramètres validés
    // ci-dessus, jamais de `metadata` elle-même.
    const { data, error } = (await adminClient.rpc("import_legacy_media_asset_api", {
      p_workshop_id: workshopId,
      p_fiche_id: ficheId,
      p_type: kind,
      p_storage_path: path,
      p_mime_type: mimeType,
      p_size_bytes: bytes.byteLength,
      p_metadata: metadata ?? {},
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "fiche_media" });
    return jsonResponse(200, { result: data }, decision);
  }

  // ── modele_media ───────────────────────────────────────────────────────
  if (opType === "modele_media") {
    const modeleId = operation.modeleId;
    const kind = operation.kind;
    const ordinal = operation.ordinal;
    const mimeType = operation.mimeType;
    const contentBase64 = operation.contentBase64;
    const position = operation.position;
    const metadata = operation.metadata;
    if (
      !isPlausibleUuid(modeleId) ||
      typeof kind !== "string" ||
      !MODELE_MEDIA_KINDS.has(kind) ||
      !isPositiveInt(ordinal) ||
      !isNonEmptyString(mimeType, 100) ||
      typeof contentBase64 !== "string" ||
      contentBase64.length === 0 ||
      contentBase64.length > MAX_BASE64_LENGTH ||
      (position !== undefined && !isIntAtLeast(position, 0)) ||
      !isOptionalPlainObject(metadata)
    ) {
      return jsonResponse(400, { error: "invalid_request", message: "Opération média modèle invalide." }, decision);
    }
    const modeleOk = await belongsToWorkshop("modeles", modeleId);
    if (modeleOk === "error") return jsonResponse(500, { error: "internal_error", message: "Une erreur est survenue. Réessaie plus tard." }, decision);
    if (!modeleOk) return jsonResponse(400, { error: "invalid_reference", message: "Ce modèle n'existe pas dans cet atelier." }, decision);

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(contentBase64);
    } catch {
      return jsonResponse(400, { error: "invalid_request", message: "Contenu média invalide (base64)." }, decision);
    }

    const path = buildLegacyModeleMediaPath(workshopId, modeleId, kind, ordinal);
    const upload = await adminClient.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
    if (upload.error && !/duplicate|already exists|resource already exists/i.test(upload.error.message)) {
      logSafe("import_legacy_data.storage_error", { phase: "modele_media_upload" });
      return jsonResponse(500, { error: "internal_error", message: "Échec de l'envoi du média. Réessaie plus tard." }, decision);
    }

    const { data, error } = (await adminClient.rpc("import_legacy_modele_media_api", {
      p_workshop_id: workshopId,
      p_modele_id: modeleId,
      p_kind: kind,
      p_storage_path: path,
      p_mime_type: mimeType,
      p_size_bytes: bytes.byteLength,
      p_position: position ?? 0,
      p_metadata: metadata ?? {},
    })) as RpcResult;
    if (error) return mapRpcError(error, decision);
    logSafe("import_legacy_data.success", { type: "modele_media" });
    return jsonResponse(200, { result: data }, decision);
  }

  return jsonResponse(400, { error: "invalid_request", message: "Type d'opération inconnu." }, decision);
});
