#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios de l'auth PIN Tayoo (Edge Function
// `tayoo-pin-auth`) contre le stack Supabase LOCAL uniquement — aucun vrai
// SMS, aucun fournisseur OTP. Chaque scénario utilise un `X-Forwarded-For`
// synthétique DISTINCT (corr. Gate Auth §27) pour que le throttle scopé « ip »
// d'un scénario ne contamine jamais le suivant — seul le scénario dédié au
// lockout doit voir son propre compteur IP augmenter.
//
// Prérequis : `npx supabase start` (le secret `TAYOO_PIN_AUTH_SECRET` doit
// être présent dans `supabase/functions/.env`, auto-chargé au démarrage).
//
// Usage : node scripts/test-pin-auth.mjs

import { execSync } from "node:child_process";

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
    console.log(`  ❌ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function decodeJwtPayload(jwt) {
  const [, payload] = jwt.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

async function main() {
  const env = getLocalConfig();
  const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = env;
  if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    console.error("Config locale incomplète (API_URL/PUBLISHABLE_KEY/SECRET_KEY manquants).");
    process.exit(1);
  }

  function dbQueryRows(sql) {
    const escaped = sql.replace(/"/g, '\\"');
    const out = execSync(`npx supabase db query --local "${escaped}"`, { encoding: "utf8" });
    const parsed = JSON.parse(out);
    if (parsed && parsed._tag === "Error") throw new Error(`db query --local a échoué: ${JSON.stringify(parsed)}`);
    return parsed.rows ?? [];
  }

  /** Pour GRANT/REVOKE/DELETE (sans SELECT) — `db query --local` renvoie une
   * simple ligne de statut texte ("REVOKE", "DELETE 6", …), jamais du JSON. */
  function dbExec(sql) {
    const escaped = sql.replace(/"/g, '\\"');
    execSync(`npx supabase db query --local "${escaped}"`, { encoding: "utf8" });
  }

  async function callPinAuth(action, phone, pin, fakeIp) {
    const res = await fetch(`${API_URL}/functions/v1/tayoo-pin-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PUBLISHABLE_KEY,
        Origin: "http://localhost:5173",
        "X-Forwarded-For": fakeIp,
      },
      body: JSON.stringify({ action, phone, pin }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  // Numéros/IP de fixture — DISTINCTS par scénario pour isoler les portées
  // de throttle (jamais un vrai numéro de tailleur).
  const PHONE_A = "77 000 09 01";
  const PHONE_B = "77 000 09 02";
  const PHONE_LOCKOUT = "77 000 09 04";
  const PHONE_COMPENSATION = "77 000 09 05";
  const PHONE_MISSING = "77 000 09 99"; // jamais inscrit

  const IP_A = "10.0.0.1";
  const IP_B = "10.0.0.2";
  const IP_DUP = "10.0.0.3";
  const IP_LOCKOUT = "10.0.0.4";
  const IP_COMPENSATION = "10.0.0.5";
  const IP_MISSING = "10.0.0.6";
  const IP_FORMAT = "10.0.0.7";

  console.log("Phase Gate Auth — pivot PIN (téléphone + PIN 4 chiffres) — suite automatisée\n");

  console.log("1) REGISTER valide — auth user + pin_auth_account + workshop + membership + vraie session");
  let userAId;
  let workshopAId;
  {
    const { status, body } = await callPinAuth("register", PHONE_A, "1234", IP_A);
    check("register A -> 200", status === 200, { status, body });
    check("register A -> access_token + refresh_token présents", Boolean(body.access_token) && Boolean(body.refresh_token), body);
    check("register A -> ne renvoie jamais email/password/salt/phoneKey/secret techniques", !("email" in body) && !("password" in body) && !("salt" in body) && !("phoneKey" in body), body);

    const claims = body.access_token ? decodeJwtPayload(body.access_token) : {};
    check("register A -> session role = authenticated", claims.role === "authenticated", claims.role);
    userAId = claims.sub;

    const rows = dbQueryRows(
      `select (select count(*) from auth.users) as users, (select count(*) from app_hidden.pin_auth_accounts) as pin_accounts, (select count(*) from public.workshops) as workshops, (select count(*) from public.workshop_members) as memberships;`,
    );
    check("register A -> auth.users = 1", rows[0]?.users === 1, rows[0]);
    check("register A -> pin_auth_accounts = 1", rows[0]?.pin_accounts === 1, rows[0]);
    check("register A -> workshops = 1", rows[0]?.workshops === 1, rows[0]);
    check("register A -> workshop_members = 1", rows[0]?.memberships === 1, rows[0]);

    const wsRows = dbQueryRows(`select id from public.workshops where owner_id = '${userAId}';`);
    workshopAId = wsRows[0]?.id;
    check("register A -> workshop trouvé pour cet owner", Boolean(workshopAId), wsRows);
  }

  console.log("\n2) Aucune donnée brute sensible stockée (corr. Gate Auth §26/§62)");
  {
    const rows = dbQueryRows(`select phone_key, password_salt from app_hidden.pin_auth_accounts where user_id = '${userAId}';`);
    const row = rows[0] ?? {};
    const serialized = JSON.stringify(row);
    check("pin_auth_accounts -> aucun numéro brut (770000901/0770000901)", !serialized.includes("770000901") && !serialized.includes("0770000901"), row);
    check("pin_auth_accounts -> aucun PIN en clair (1234)", !serialized.includes("1234"), row);
    check("pin_auth_accounts -> pas de colonne technical_password", !("technical_password" in row) && !("technicalPassword" in row), row);
  }

  console.log("\n3) LOGIN correct -> session authenticated, AUCUNE duplication d'atelier");
  {
    const { status, body } = await callPinAuth("login", PHONE_A, "1234", IP_A);
    check("login A correct -> 200", status === 200, { status, body });
    const claims = body.access_token ? decodeJwtPayload(body.access_token) : {};
    check("login A -> même user_id qu'à l'inscription", claims.sub === userAId, { expected: userAId, got: claims.sub });

    const rows = dbQueryRows(`select count(*) as workshops from public.workshops where owner_id = '${userAId}';`);
    check("login A -> toujours exactement 1 atelier (idempotent, §36)", rows[0]?.workshops === 1, rows[0]);
  }

  console.log("\n4) Numéro second utilisateur (isolation basique, pas de collision de compte)");
  let userBId;
  {
    const { status, body } = await callPinAuth("register", PHONE_B, "5678", IP_B);
    check("register B -> 200", status === 200, { status, body });
    const claims = body.access_token ? decodeJwtPayload(body.access_token) : {};
    userBId = claims.sub;
    check("register B -> user différent de A", userBId && userBId !== userAId, { userAId, userBId });
  }

  console.log("\n5) Inscription DUPLIQUÉE -> refus contrôlé, sans exposer email/user id/phoneKey (corr. Gate Auth §33)");
  {
    const { status, body } = await callPinAuth("register", PHONE_A, "0000", IP_DUP);
    check("register duplicate A -> refus (409 attendu)", status === 409, { status, body });
    check("register duplicate A -> code phone_in_use", body.error === "phone_in_use", body);
    check("register duplicate A -> aucune fuite (email/userId/phoneKey)", !("email" in body) && !("userId" in body) && !("phoneKey" in body), body);
  }

  console.log("\n6) LOGIN mauvais PIN -> erreur générique (corr. Gate Auth §34)");
  {
    const { status, body } = await callPinAuth("login", PHONE_A, "9999", IP_A);
    check("login mauvais PIN -> 401", status === 401, { status, body });
    check("login mauvais PIN -> message générique 'Numéro ou code incorrect.'", body.message === "Numéro ou code incorrect.", body);
  }

  console.log("\n7) LOGIN numéro inexistant -> EXACTEMENT le même comportement qu'un mauvais PIN (aucune distinction publique)");
  {
    const { status, body } = await callPinAuth("login", PHONE_MISSING, "1234", IP_MISSING);
    check("login numéro inexistant -> 401", status === 401, { status, body });
    check("login numéro inexistant -> message générique identique", body.message === "Numéro ou code incorrect.", body);
    check("login numéro inexistant -> code identique (invalid_credentials)", body.error === "invalid_credentials", body);
  }

  console.log("\n8) Formats invalides -> refusés AVANT toute tentative d'authentification");
  {
    const badPhone = await callPinAuth("register", "12", "1234", IP_FORMAT);
    check("register numéro invalide -> 400", badPhone.status === 400, badPhone);
    const badPin = await callPinAuth("register", "77 000 09 88", "12a4", IP_FORMAT);
    check("register PIN invalide (non numérique) -> 400", badPin.status === 400, badPin);
    const shortPin = await callPinAuth("register", "77 000 09 88", "123", IP_FORMAT);
    check("register PIN invalide (3 chiffres) -> 400", shortPin.status === 400, shortPin);
  }

  console.log("\n9) THROTTLE — plusieurs échecs -> verrouillage réel (corr. Gate Auth §27/§28/§61)");
  {
    const results = [];
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await callPinAuth("login", PHONE_LOCKOUT, "0000", IP_LOCKOUT);
      results.push(r);
    }
    const lockedResults = results.filter((r) => r.body.error === "locked");
    check("échecs répétés -> au moins un verrouillage déclenché (seuil 5)", lockedResults.length > 0, results.map((r) => r.body.error));
    check("verrouillage -> message générique 'Trop d'essais…'", lockedResults[0]?.body.message === "Trop d'essais. Réessaie dans quelques minutes.", lockedResults[0]);
    check("verrouillage -> code 429", lockedResults[0] ? results[results.length - 1].status === 429 : false, results[results.length - 1]);

    // Pendant le verrou : même avec le BON PIN, aucune session n'est établie
    // (aucune tentative Supabase Auth réelle supplémentaire ne doit passer).
    const { status: statusWhileLocked, body: bodyWhileLocked } = await callPinAuth("login", PHONE_LOCKOUT, "0000", IP_LOCKOUT);
    check("pendant le verrou -> toujours refusé (429 locked), même PIN correct hypothétique", statusWhileLocked === 429 && bodyWhileLocked.error === "locked", bodyWhileLocked);
  }
  console.log(
    "  ℹ️  Le déverrouillage APRÈS la fenêtre de blocage est prouvé au niveau SQL (10_schema_tests.sql, « clock injection » sur app_hidden.pin_auth_throttle_status) — jamais en attendant réellement plusieurs minutes ici (corr. Gate Auth §61).",
  );

  console.log("\n10) Compensation — échec DB après auth.admin.createUser() -> AUCUN utilisateur orphelin (corr. Gate Auth §32)");
  {
    // Révoque temporairement l'EXECUTE de service_role sur le wrapper
    // d'insertion pour forcer l'échec de CETTE étape précise, sans toucher au
    // reste du flux (createUser() aura déjà réussi à ce moment-là).
    dbExec(`revoke execute on function public.pin_auth_register_account_api(uuid, text, text) from service_role;`);
    try {
      const before = dbQueryRows(`select count(*) as n from auth.users;`)[0]?.n;
      const { status, body } = await callPinAuth("register", PHONE_COMPENSATION, "2468", IP_COMPENSATION);
      check("register avec échec DB simulé -> refus (pas un succès silencieux)", status >= 400, { status, body });
      const after = dbQueryRows(`select count(*) as n from auth.users;`)[0]?.n;
      check("register avec échec DB simulé -> AUCUN utilisateur orphelin créé (compensation appliquée)", after === before, { before, after });
    } finally {
      dbExec(`grant execute on function public.pin_auth_register_account_api(uuid, text, text) to service_role;`);
    }
    // Le numéro doit rester réellement disponible après la compensation.
    const { status: retryStatus } = await callPinAuth("register", PHONE_COMPENSATION, "2468", IP_COMPENSATION);
    check("après compensation -> le même numéro peut RÉELLEMENT s'inscrire (rien n'est resté à moitié créé)", retryStatus === 200, retryStatus);
  }

  console.log(`\n${passed} test(s) OK, ${failed} échec(s).`);
  if (failed > 0) console.log("Échecs :", failures.join(", "));

  console.log("\n--- Nettoyage exact des fixtures ---");
  // Nettoyage PAR ID EXACT — jamais par nom/pattern. `workshops` cascade sur
  // workshop_members/pin_auth_accounts (FK -> auth.users ON DELETE CASCADE)
  // via la suppression de l'utilisateur Auth (admin), donc l'ordre correct
  // est : lister tous les userId créés par CE run, puis
  // `admin.auth.admin.deleteUser()` sur chacun (cascade complète en base).
  const cleanupRows = dbQueryRows(
    `select u.id from auth.users u join app_hidden.pin_auth_accounts pa on pa.user_id = u.id;`,
  );
  for (const row of cleanupRows) {
    // `workshops.owner_id` référence `auth.users(id)` en `ON DELETE RESTRICT`
    // (protection délibérée, corr. Phase 2) — l'atelier EXACT de cet owner
    // doit disparaître AVANT l'utilisateur, jamais l'inverse. Cascade ensuite
    // sur `workshop_members` (FK atelier) ; `pin_auth_accounts` cascade,
    // séparément, sur la suppression de l'utilisateur lui-même (FK
    // `auth.users`, `ON DELETE CASCADE`).
    dbExec(`delete from public.workshops where owner_id = '${row.id}';`);
    const res = await fetch(`${API_URL}/auth/v1/admin/users/${row.id}`, {
      method: "DELETE",
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    });
    console.log(`  cleanup: user ${row.id} -> ${res.status === 200 ? "supprimé" : `échec (${res.status})`}`);
  }

  // `pin_auth_throttle` ne contient AUCUNE donnée identifiante en clair
  // (uniquement des clés opaques HMAC + compteurs, corr. Gate Auth §27) et
  // n'est écrite que par CE script en local — un DELETE complet ici n'est pas
  // le même risque qu'un DELETE générique sur une table métier partagée
  // (jamais fait ailleurs dans ce dépôt). Nécessaire car ce script ne connaît
  // pas `TAYOO_PIN_AUTH_SECRET` : il ne peut pas recalculer les clés exactes
  // à supprimer une par une (scénarios verrouillage §9 / login inexistant §7
  // laissent des lignes résiduelles par construction).
  dbExec(`delete from app_hidden.pin_auth_throttle;`);

  const baseline = dbQueryRows(
    `select (select count(*) from auth.users) as users, (select count(*) from app_hidden.pin_auth_accounts) as pin_accounts, (select count(*) from app_hidden.pin_auth_throttle) as throttle, (select count(*) from public.workshops) as workshops, (select count(*) from public.workshop_members) as memberships;`,
  )[0];
  console.log("Baseline post-cleanup :", JSON.stringify(baseline));
  const allZero = baseline && Object.values(baseline).every((v) => v === 0);
  console.log(allZero ? "BASELINE POST-CLEANUP = TOUS COMPTEURS À 0" : "BASELINE POST-CLEANUP = RÉSIDU DÉTECTÉ");

  if (failed > 0 || !allZero) process.exitCode = 1;
}

main().catch((err) => {
  console.error("ERREUR SCRIPT:", err);
  process.exitCode = 1;
});
