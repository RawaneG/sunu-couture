#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios de sécurité/fonctionnels de l'Edge
// Function `create-fiche-from-draft` contre le stack Supabase LOCAL — même
// structure que `scripts/test-provision-workshop.mjs` (voir ce fichier pour
// le détail des choix : lecture dynamique de `supabase status`, jamais de
// vraie donnée, jamais de secret loggé).
//
// Prérequis (dans deux terminaux séparés, avant de lancer ce script) :
//   1. npx supabase start
//   2. npx supabase functions serve
//
// Usage :
//   npm run test:edge:fiche-draft
//
// Utilise DEUX numéros de test fixes définis dans `supabase/config.toml`
// ([auth.sms.test_otp]) — jamais un vrai numéro, jamais de fournisseur SMS
// réel. Le second numéro (221770000098) a été ajouté spécifiquement pour ce
// script : les scénarios "atelier A vs atelier B" exigent un DEUXIÈME
// utilisateur réel (JWT distinct), pas seulement un second id fabriqué.
//
// FIXTURES : contrairement à `provision-workshop` (qui teste son propre
// mécanisme de création d'atelier), ici les ateliers/memberships/clients de
// test sont créés DIRECTEMENT via la clé secrète (REST), jamais via l'Edge
// Function elle-même — on ne veut pas dépendre de `provision_workshop_api`
// (idempotent à UN SEUL atelier par owner) pour construire un scénario à
// plusieurs ateliers pour le même owner.
//
// LIMITE ASSUMÉE (comme pour provision-workshop) : le rôle `workshop_role`
// est un ENUM Postgres à seulement deux valeurs (`owner`, `assistant`) — il
// est donc IMPOSSIBLE de construire en base une ligne `workshop_members`
// avec un troisième rôle pour tester littéralement "rôle invalide -> 403".
// Le scénario "aucune ligne de membership" (couvert ci-dessous par "atelier
// étranger") emprunte exactement la même branche de code (rôle absent ⇒
// refusé) et est donc considéré comme la vérification équivalente.

import { execSync } from "node:child_process";

const TEST_PHONE_1 = "221770000099";
const TEST_PHONE_2 = "221770000098";
const TEST_CODE = "123456";

function getLocalConfig() {
  let out;
  try {
    out = execSync("npx supabase status -o env", { encoding: "utf8" });
  } catch (e) {
    console.error("Impossible de lire `supabase status` — la stack locale tourne-t-elle ? (npx supabase start)");
    console.error(e.message);
    process.exit(1);
  }
  const env = {};
  for (const line of out.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq)] = line.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return env;
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function main() {
  const env = getLocalConfig();
  const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = env;
  if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    console.error("Config locale incomplète (API_URL/PUBLISHABLE_KEY/SECRET_KEY manquants).");
    process.exit(1);
  }
  const FUNCTIONS_URL = `${API_URL}/functions/v1/create-fiche-from-draft`;
  const REST_URL = `${API_URL}/rest/v1`;

  async function callFn(token, body) {
    const headers = { "Content-Type": "application/json" };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* réponse non-JSON (ex. 204) — ignoré */
    }
    return { status: res.status, json };
  }

  async function callFnRaw({ method = "POST", token, body, origin } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    if (origin !== undefined) headers.Origin = origin;
    const res = await fetch(FUNCTIONS_URL, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignoré */
    }
    return { status: res.status, json, headers: res.headers };
  }

  async function login(phone) {
    await fetch(`${API_URL}/auth/v1/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
      body: JSON.stringify({ phone }),
    });
    const res = await fetch(`${API_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
      body: JSON.stringify({ phone, token: TEST_CODE, type: "sms" }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(
        `Échec de connexion (${phone}) — [auth.sms.test_otp] est-il bien configuré ? Réponse: ${JSON.stringify(body)}`,
      );
    }
    return { userId: body.user.id, accessToken: body.access_token };
  }

  // ── Fixtures, TOUJOURS via la clé secrète — jamais via l'Edge Function ────
  function adminHeaders(extra = {}) {
    return { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json", ...extra };
  }

  async function deleteWorkshopsOwnedBy(userId) {
    await fetch(`${REST_URL}/workshops?owner_id=eq.${userId}`, { method: "DELETE", headers: adminHeaders() });
  }

  async function createWorkshop(ownerId, name) {
    const res = await fetch(`${REST_URL}/workshops`, {
      method: "POST",
      headers: adminHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ owner_id: ownerId, name }),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(`createWorkshop a échoué: ${JSON.stringify(rows)}`);
    return rows[0].id;
  }

  async function addAssistant(workshopId, userId) {
    const res = await fetch(`${REST_URL}/workshop_members`, {
      method: "POST",
      headers: adminHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ workshop_id: workshopId, user_id: userId, role: "assistant" }),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(`addAssistant a échoué: ${JSON.stringify(rows)}`);
    return rows[0];
  }

  async function createClient(workshopId, displayName) {
    const res = await fetch(`${REST_URL}/clients`, {
      method: "POST",
      headers: adminHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ workshop_id: workshopId, display_name: displayName }),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(`createClient a échoué: ${JSON.stringify(rows)}`);
    return rows[0].id;
  }

  async function countFiches(workshopId) {
    const res = await fetch(`${REST_URL}/fiches?workshop_id=eq.${workshopId}&select=id`, { headers: adminHeaders() });
    const rows = await res.json();
    if (!res.ok) throw new Error(`countFiches a échoué: ${JSON.stringify(rows)}`);
    return rows.length;
  }

  async function countCarnets(workshopId) {
    const res = await fetch(`${REST_URL}/carnets?workshop_id=eq.${workshopId}&select=id`, { headers: adminHeaders() });
    const rows = await res.json();
    if (!res.ok) throw new Error(`countCarnets a échoué: ${JSON.stringify(rows)}`);
    return rows.length;
  }

  console.log("create-fiche-from-draft — suite automatisée\n");

  console.log("0) Connexion des deux utilisateurs de test + nettoyage des ateliers existants");
  const user1 = await login(TEST_PHONE_1);
  const user2 = await login(TEST_PHONE_2);
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

  console.log("\n1) Fixtures : atelier A (owner=user1, +assistant=user2), atelier B (owner=user1), client A, client B");
  const workshopA = await createWorkshop(user1.userId, "Atelier Test A — Phase 9A");
  const workshopB = await createWorkshop(user1.userId, "Atelier Test B — Phase 9A");
  await addAssistant(workshopA, user2.userId); // user2 : assistant de A, AUCUNE relation avec B
  const clientA = await createClient(workshopA, "Cliente A — Phase 9A");
  const clientB = await createClient(workshopB, "Cliente B — Phase 9A");

  console.log("\n2) Sécurité JWT");
  {
    const r = await callFn(undefined, { workshopId: workshopA, clientId: null, fiche: { garment: "Boubou" } });
    check("sans Authorization -> 401", r.status === 401);
  }
  {
    const r = await callFn("ceci-nest-pas-un-jwt", { workshopId: workshopA, clientId: null, fiche: {} });
    check("JWT invalide -> 401", r.status === 401);
  }

  console.log("\n3) Corps de requête invalide -> 400 invalid_request");
  {
    const r = await callFn(user1.accessToken, { clientId: null, fiche: {} }); // workshopId manquant
    check("workshopId manquant -> 400 invalid_request", r.status === 400 && r.json?.error === "invalid_request", r.json);
  }
  {
    const r = await callFn(user1.accessToken, { workshopId: workshopA, clientId: null, fiche: "pas-un-objet" });
    check("fiche non-objet -> 400 invalid_request", r.status === 400 && r.json?.error === "invalid_request", r.json);
  }

  console.log("\n4) Atelier étranger -> 403 (couvre aussi 'rôle absent', enum ne permettant aucun 3e rôle)");
  {
    // user2 n'a AUCUNE relation avec workshopB (ni owner, ni assistant).
    const before = await countFiches(workshopB);
    const r = await callFn(user2.accessToken, { workshopId: workshopB, clientId: null, fiche: { garment: "Ne doit jamais être créé" } });
    check("membre d'aucun atelier -> 403 forbidden", r.status === 403 && r.json?.error === "forbidden", r.json);
    const after = await countFiches(workshopB);
    check("aucune fiche créée malgré le refus", after === before, { before, after });
  }
  {
    // Injection : `role: "owner"` dans le corps ne doit avoir AUCUN effet —
    // l'autorisation vient exclusivement de workshop_members, jamais du body.
    const r = await callFn(user2.accessToken, {
      workshopId: workshopB,
      clientId: null,
      fiche: { garment: "x" },
      role: "owner",
      ownerId: user1.userId,
      userId: user1.userId,
    });
    check("injection role/ownerId/userId dans le corps -> toujours 403, aucun effet", r.status === 403, r.json);
  }

  console.log("\n5) Client hors atelier -> 400 invalid_client");
  {
    const before = await countFiches(workshopA);
    // user1 est owner de A, mais clientB appartient à B.
    const r = await callFn(user1.accessToken, { workshopId: workshopA, clientId: clientB, fiche: {} });
    check("client d'un autre atelier -> 400 invalid_client", r.status === 400 && r.json?.error === "invalid_client", r.json);
    const after = await countFiches(workshopA);
    check("aucune fiche créée (client rejeté avant le RPC)", after === before, { before, after });
  }

  console.log("\n6) Brouillon vide -> 422 empty_draft, 0 fiche / 0 carnet consommé");
  {
    const fichesBefore = await countFiches(workshopA);
    const carnetsBefore = await countCarnets(workshopA);
    const r = await callFn(user1.accessToken, { workshopId: workshopA, clientId: null, fiche: {} });
    check("payload vide -> 422 empty_draft", r.status === 422 && r.json?.error === "empty_draft", r.json);
    const fichesAfter = await countFiches(workshopA);
    const carnetsAfter = await countCarnets(workshopA);
    check(
      "zéro consommation : aucune fiche, aucun carnet créé pour un brouillon vide",
      fichesAfter === fichesBefore && carnetsAfter === carnetsBefore,
      { fichesBefore, fichesAfter, carnetsBefore, carnetsAfter },
    );
  }
  {
    // Chaînes blanches uniquement — doit être traité comme vide, pas comme
    // significatif (même règle que app_hidden.create_fiche_from_draft, T32).
    const r = await callFn(user1.accessToken, {
      workshopId: workshopA,
      clientId: null,
      fiche: { garment: "   ", description: "\t\n" },
    });
    check("payload blanc (espaces/tabulations) -> 422 empty_draft", r.status === 422 && r.json?.error === "empty_draft", r.json);
  }

  console.log("\n7) Scénario positif : owner crée dans son propre atelier");
  let ficheAId;
  {
    const r = await callFn(user1.accessToken, {
      workshopId: workshopA,
      clientId: clientA,
      fiche: { garment: "Boubou", description: "Manches longues", measurements: { Cou: { valeur: "42" } } },
    });
    check(
      "owner + brouillon significatif -> 200, fiche créée avec numéro serveur",
      r.status === 200 && typeof r.json?.fiche?.id === "string" && typeof r.json?.fiche?.number === "number",
      r.json,
    );
    ficheAId = r.json?.fiche?.id;
  }

  console.log("\n8) Scénario positif : assistant crée dans SON atelier (A), mais pas dans B");
  {
    const r = await callFn(user2.accessToken, {
      workshopId: workshopA,
      clientId: null,
      fiche: { garment: "Robe assistant" },
    });
    check("assistant de A + brouillon significatif -> 200, fiche créée dans A", r.status === 200 && r.json?.fiche?.workshop_id === workshopA, r.json);
  }
  {
    const r = await callFn(user2.accessToken, { workshopId: workshopB, clientId: null, fiche: { garment: "Ne doit jamais être créé" } });
    check("assistant de A tente B (où il n'est ni owner ni assistant) -> 403", r.status === 403 && r.json?.error === "forbidden", r.json);
  }

  console.log("\n9) Numérotation indépendante par atelier : owner crée aussi dans B");
  {
    const r = await callFn(user1.accessToken, { workshopId: workshopB, clientId: null, fiche: { garment: "Premier de B" } });
    check(
      "owner de B + brouillon significatif -> 200, numéro 1 (carnet propre à B, indépendant de A)",
      r.status === 200 && r.json?.fiche?.number === 1 && r.json?.fiche?.workshop_id === workshopB,
      r.json,
    );
  }

  console.log("\n10) CORS — origine autorisée / interdite / null / absente, préflight (mêmes limites locales que provision-workshop, voir son index.ts)");
  const ALLOWED_ORIGIN = "http://localhost:5173";
  const FORBIDDEN_ORIGIN = "https://evil.example.com";
  {
    const r = await callFnRaw({ method: "OPTIONS", origin: ALLOWED_ORIGIN });
    check("OPTIONS + origine autorisée -> 204", r.status === 204, { status: r.status });
  }
  {
    const r = await callFnRaw({ method: "OPTIONS", origin: FORBIDDEN_ORIGIN });
    check("OPTIONS + origine interdite -> 403", r.status === 403, { status: r.status });
  }
  {
    const before = await countFiches(workshopA);
    const r = await callFnRaw({
      token: user1.accessToken,
      body: { workshopId: workshopA, clientId: null, fiche: { garment: "Ne doit jamais être créé" } },
      origin: FORBIDDEN_ORIGIN,
    });
    check("origine présente mais interdite -> 403 (rejet avant tout traitement métier)", r.status === 403, { status: r.status, json: r.json });
    const after = await countFiches(workshopA);
    check("aucune fiche créée pour l'origine interdite", after === before, { before, after });
  }
  {
    const r = await callFnRaw({ token: user1.accessToken, body: { workshopId: workshopA, clientId: null, fiche: {} }, origin: "null" });
    check("Origin: null (littéral) -> traité comme interdit, 403", r.status === 403, { status: r.status });
  }
  {
    const r = await callFnRaw({ body: { workshopId: workshopA, clientId: null, fiche: {} } }); // pas de token, pas d'Origin
    check("absence d'Origin -> poursuit jusqu'à la vérification JWT (401 sans JWT, jamais 403)", r.status === 401, { status: r.status });
  }

  console.log("\nNettoyage des données de test…");
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

  console.log(`\n${passed} test(s) OK, ${failed} échec(s).`);
  if (failed > 0) {
    console.log("Échecs :", failures.join(", "));
    process.exitCode = 1;
  }
  void ficheAId; // conservé pour lisibilité du scénario 7, non réutilisé plus loin
}

main().catch((err) => {
  console.error("ERREUR SCRIPT:", err);
  process.exitCode = 1;
});
