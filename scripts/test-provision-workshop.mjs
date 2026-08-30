#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios de sécurité/fonctionnels de l'Edge
// Function `provision-workshop` contre le stack Supabase LOCAL.
//
// Prérequis (dans deux terminaux séparés, avant de lancer ce script) :
//   1. npx supabase start
//   2. npx supabase functions serve
//
// Usage :
//   npm run test:edge
//
// Ce script n'utilise QUE le numéro de test fixe défini dans
// `supabase/config.toml` ([auth.sms.test_otp]) — jamais un vrai numéro, jamais
// de fournisseur SMS réel. Il lit l'URL et les clés locales dynamiquement via
// `supabase status`, jamais codées en dur (elles changent à chaque
// régénération du projet local).
//
// LIMITE ASSUMÉE (non automatisée ici, testée manuellement une fois — voir
// supabase/README.md « Phase 3A ») : le scénario « JWT expiré → 401 »
// nécessite de redémarrer toute la stack avec un `jwt_expiry` très court, ce
// qui casserait la config locale partagée par tous les autres tests si on le
// faisait dans ce script. Le comportement a été vérifié empiriquement une
// fois (token réellement expiré, signature valide) et documenté séparément —
// ne pas confondre cette note avec un test automatisé : il ne l'est pas.
//
// De même, « aucun secret ou téléphone complet dans les logs » ne peut pas
// être vérifié depuis l'extérieur par une requête HTTP (les logs ne sont pas
// dans la réponse) — cette exigence est garantie par relecture du code de
// `logSafe()` dans supabase/functions/provision-workshop/index.ts, pas par ce
// script.

import { execSync } from "node:child_process";

const TEST_PHONE = "221770000099";
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
  const FUNCTIONS_URL = `${API_URL}/functions/v1/provision-workshop`;

  async function callFn(token, body) {
    const headers = { "Content-Type": "application/json" };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(FUNCTIONS_URL, { method: "POST", headers, body: JSON.stringify(body) });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* réponse non-JSON (ex. 204) — ignoré */
    }
    return { status: res.status, json };
  }

  async function login() {
    await fetch(`${API_URL}/auth/v1/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
      body: JSON.stringify({ phone: TEST_PHONE }),
    });
    const res = await fetch(`${API_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PUBLISHABLE_KEY },
      body: JSON.stringify({ phone: TEST_PHONE, token: TEST_CODE, type: "sms" }),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(
        `Échec de connexion avec le numéro de test — [auth.sms.test_otp] est-il bien configuré dans supabase/config.toml ? Réponse: ${JSON.stringify(body)}`,
      );
    }
    return { userId: body.user.id, accessToken: body.access_token };
  }

  // Nettoyage via la clé secrète (service_role) — jamais via l'Edge Function
  // elle-même, pour ne pas fausser les scénarios "nouvel utilisateur".
  async function resetTestUserWorkshops(userId) {
    await fetch(`${API_URL}/rest/v1/workshops?owner_id=eq.${userId}`, {
      method: "DELETE",
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    });
  }

  console.log("provision-workshop — suite automatisée\n");

  console.log("1) Sécurité JWT");
  {
    const r = await callFn(undefined, { name: null });
    check("sans Authorization -> 401", r.status === 401);
  }
  {
    const r = await callFn("ceci-nest-pas-un-jwt", { name: null });
    check("JWT invalide -> 401", r.status === 401);
  }

  const { userId, accessToken } = await login();
  await resetTestUserWorkshops(userId);

  console.log("\n2) owner_id/user_id injectés depuis le body -> ignorés");
  {
    const r = await callFn(accessToken, {
      name: null,
      owner_id: "00000000-0000-0000-0000-000000000000",
      user_id: "11111111-1111-1111-1111-111111111111",
    });
    check(
      "injection ignorée (sonde nouvel utilisateur -> WORKSHOP_NAME_REQUIRED, pas d'ID injecté utilisé)",
      r.status === 400 && r.json?.error === "WORKSHOP_NAME_REQUIRED",
      r.json,
    );
  }

  console.log("\n3) nouvel utilisateur sans nom -> WORKSHOP_NAME_REQUIRED");
  {
    const r = await callFn(accessToken, { name: null });
    check("name: null, aucun atelier existant -> 400 WORKSHOP_NAME_REQUIRED", r.status === 400 && r.json?.error === "WORKSHOP_NAME_REQUIRED", r.json);
  }

  console.log("\n4) nouvel utilisateur avec nom -> atelier créé");
  let workshopId;
  {
    const r = await callFn(accessToken, { name: "Atelier Automatisé" });
    check("name valide -> 200 + atelier créé pour le bon owner", r.status === 200 && r.json?.workshop?.owner_id === userId, r.json);
    workshopId = r.json?.workshop?.id;
  }

  console.log("\n5) utilisateur existant -> atelier existant retourné (idempotent)");
  {
    const r1 = await callFn(accessToken, { name: null });
    check("sonde après création -> même atelier", r1.status === 200 && r1.json?.workshop?.id === workshopId, r1.json);
    const r2 = await callFn(accessToken, { name: "Nom Différent Ignoré" });
    check(
      "nom différent envoyé -> toujours le même atelier, pas de renommage",
      r2.status === 200 && r2.json?.workshop?.id === workshopId && r2.json?.workshop?.name === "Atelier Automatisé",
      r2.json,
    );
  }

  console.log("\n6) appels concurrents/répétés -> aucun doublon");
  {
    await resetTestUserWorkshops(userId);
    const results = await Promise.all(Array.from({ length: 5 }, () => callFn(accessToken, { name: "Atelier Concurrent" })));
    const ids = new Set(results.map((r) => r.json?.workshop?.id).filter(Boolean));
    const allOk = results.every((r) => r.status === 200);
    check("5 appels concurrents identiques -> un seul atelier, tous 200", allOk && ids.size === 1, [...ids]);
  }

  console.log("\n7) owner exclusivement dérivé du claim vérifié sub");
  {
    const r = await callFn(accessToken, { name: null, owner_id: "99999999-9999-9999-9999-999999999999" });
    check("owner_id du body jamais utilisé comme propriétaire réel", r.json?.workshop?.owner_id === userId, r.json);
  }

  console.log("\nNettoyage des données de test…");
  await resetTestUserWorkshops(userId);

  console.log(`\n${passed} test(s) OK, ${failed} échec(s).`);
  if (failed > 0) {
    console.log("Échecs :", failures.join(", "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("ERREUR SCRIPT:", err);
  process.exitCode = 1;
});
