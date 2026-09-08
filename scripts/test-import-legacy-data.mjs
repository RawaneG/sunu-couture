#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios de l'Edge Function `import-legacy-data`
// (Phase 6B0) contre le stack Supabase LOCAL uniquement — aucune donnée
// legacy réelle, uniquement des fixtures synthétiques. Suit le même style que
// `scripts/test-pin-auth.mjs` (JWT réels obtenus via `tayoo-pin-auth`, jamais
// l'ancien mécanisme OTP de test défunt utilisé par
// `scripts/test-create-fiche-from-draft.mjs`).
//
// Prérequis : `npx supabase start` (stack locale à jour avec la migration
// 20260908194925_harden_legacy_import_idempotency.sql appliquée).
//
// Usage : node scripts/test-import-legacy-data.mjs

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

// 1×1 PNG transparent minimal — fixture média, jamais un vrai fichier legacy.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

  async function callImport(jwtOrNull, payload, extraHeaders = {}) {
    const res = await fetch(`${API_URL}/functions/v1/import-legacy-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PUBLISHABLE_KEY,
        Origin: "http://localhost:5173",
        ...(jwtOrNull ? { Authorization: `Bearer ${jwtOrNull}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  async function storageObjectExists(path) {
    const res = await fetch(`${API_URL}/storage/v1/object/info/media/${path}`, {
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    });
    return res.status === 200;
  }
  async function deleteStorageObject(path) {
    await fetch(`${API_URL}/storage/v1/object/media/${path}`, {
      method: "DELETE",
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    });
  }

  console.log("Phase 6B0 — import-legacy-data — suite automatisée\n");

  console.log("1) Fixtures : deux propriétaires distincts (workshop A, workshop B) via tayoo-pin-auth");
  let jwtA, userAId, workshopAId;
  let jwtB, userBId, workshopBId;
  {
    const regA = await callPinAuth("register", "77 000 20 01", "1234", "10.1.0.1");
    check("register owner A -> 200", regA.status === 200, regA);
    jwtA = regA.body.access_token;
    userAId = jwtA ? decodeJwtPayload(jwtA).sub : undefined;
    workshopAId = dbQueryRows(`select id from public.workshops where owner_id = '${userAId}';`)[0]?.id;
    check("owner A -> workshop trouvé", Boolean(workshopAId), workshopAId);

    const regB = await callPinAuth("register", "77 000 20 02", "1234", "10.1.0.2");
    check("register owner B -> 200", regB.status === 200, regB);
    jwtB = regB.body.access_token;
    userBId = jwtB ? decodeJwtPayload(jwtB).sub : undefined;
    workshopBId = dbQueryRows(`select id from public.workshops where owner_id = '${userBId}';`)[0]?.id;
    check("owner B -> workshop trouvé", Boolean(workshopBId), workshopBId);
  }

  console.log("\n2) Sécurité — absence d'Authorization -> refusé");
  {
    const { status, body } = await callImport(null, { workshopId: workshopAId, operation: { type: "modele", legacyId: "x", nom: "x" } });
    check("sans Authorization -> 401", status === 401, { status, body });
  }

  console.log("\n3) Sécurité — JWT invalide -> refusé");
  {
    const { status, body } = await callImport("ceci-n-est-pas-un-jwt", { workshopId: workshopAId, operation: { type: "modele", legacyId: "x", nom: "x" } });
    check("JWT invalide -> 401", status === 401, { status, body });
  }

  console.log("\n4) Sécurité — utilisateur non-membre de l'atelier ciblé -> refusé (avant tout ajout de membre)");
  {
    const { status, body } = await callImport(jwtB, { workshopId: workshopAId, operation: { type: "modele", legacyId: "x", nom: "x" } });
    check("B (non-membre de A) -> 403", status === 403, { status, body });
    check("B (non-membre de A) -> forbidden", body.error === "forbidden", body);
  }

  console.log("\n5) Sécurité — owner de A -> atelier B refusé (cross-workshop)");
  {
    const { status, body } = await callImport(jwtA, { workshopId: workshopBId, operation: { type: "modele", legacyId: "x", nom: "x" } });
    check("A (non-membre de B) -> 403", status === 403, { status, body });
  }

  console.log("\n6) Sécurité — payload invalide -> 4xx contrôlé (jamais 500)");
  {
    const r1 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "modele" } });
    check("modele sans legacyId/nom -> 400", r1.status === 400, r1);
    const r2 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "inconnu" } });
    check("type d'opération inconnu -> 400", r2.status === 400, r2);
    const r3 = await callImport(jwtA, { workshopId: "pas-un-uuid-mais-plausible", operation: { type: "modele", legacyId: "x", nom: "x" } });
    check("workshopId non-membre/malformé -> refusé (400 ou 403, jamais 500)", r3.status === 400 || r3.status === 403, r3);
  }

  console.log("\n7) Sécurité — un ASSISTANT est refusé pour TOUTE opération d'import (plus strict que create-fiche-from-draft)");
  {
    // L'owner A ajoute directement B comme assistant de SON atelier (policy
    // `workshop_members_insert_owner`, Phase 4) — fixture de test, pas le
    // chemin testé ici.
    dbExec(`insert into public.workshop_members (workshop_id, user_id, role) values ('${workshopAId}', '${userBId}', 'assistant');`);
    const { status, body } = await callImport(jwtB, { workshopId: workshopAId, operation: { type: "modele", legacyId: "assistant-test", nom: "x" } });
    check("assistant de A -> 403 (jamais autorisé à importer)", status === 403, { status, body });
    check("assistant de A -> forbidden", body.error === "forbidden", body);
  }

  console.log("\n8) client — création + IDEMPOTENCE (retry -> même id, aucun doublon)");
  let clientId;
  {
    const r1 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "client", legacyId: "legacy-client-1", displayName: "Fatou Diop" },
    });
    check("import client -> 200", r1.status === 200, r1);
    clientId = r1.body.result?.id;
    check("import client -> display_name verbatim (pas de découpage heuristique)", r1.body.result?.display_name === "Fatou Diop", r1.body.result);

    const r2 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "client", legacyId: "legacy-client-1", displayName: "Fatou Diop" },
    });
    check("retry client -> même id", r2.body.result?.id === clientId, { first: clientId, second: r2.body.result?.id });

    const rows = dbQueryRows(`select count(*) as n from public.clients where workshop_id = '${workshopAId}' and metadata->>'legacy_id' = 'legacy-client-1';`);
    check("retry client -> exactement 1 ligne en base", rows[0]?.n === 1, rows[0]);
  }

  console.log("\n9) Isolation multi-atelier — même legacy_id dans l'atelier B -> UUID DIFFÉRENT, aucune collision");
  {
    const r = await callImport(jwtB, {
      workshopId: workshopBId,
      operation: { type: "client", legacyId: "legacy-client-1", displayName: "Fatou Diop (atelier B)" },
    });
    check("import client atelier B -> 200", r.status === 200, r);
    check("client atelier B -> id différent de l'atelier A", r.body.result?.id && r.body.result.id !== clientId, { a: clientId, b: r.body.result?.id });
  }

  console.log("\n10) carnet + fiches — préservation EXACTE des trous historiques (1, 2, 5), next_number correct");
  let carnetId, fiche1Id, fiche2Id, fiche5Id;
  {
    const rc = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "carnet", number: 1, nextNumber: 6 } });
    check("import carnet -> 200", rc.status === 200, rc);
    carnetId = rc.body.result?.id;

    const rf1 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche", carnetId, clientId, legacyId: "legacy-fiche-1", number: 1, legacyStatus: "recu" },
    });
    check("import fiche #1 -> 200", rf1.status === 200, rf1);
    fiche1Id = rf1.body.result?.id;
    check("fiche #1 -> status mappé 'received' (D8)", rf1.body.result?.status === "received", rf1.body.result);

    const rf2 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche", carnetId, clientId: null, legacyId: "legacy-fiche-2", number: 2, legacyStatus: "couture" },
    });
    check("import fiche #2 (sans client, D4) -> 200", rf2.status === 200, rf2);
    fiche2Id = rf2.body.result?.id;
    check("fiche #2 -> status mappé 'sewing' (D8)", rf2.body.result?.status === "sewing", rf2.body.result);
    check("fiche #2 -> client_id null accepté (D4)", rf2.body.result?.client_id === null, rf2.body.result);

    const rf2Retry = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche", carnetId, clientId: null, legacyId: "legacy-fiche-2", number: 2, legacyStatus: "couture" },
    });
    check("retry fiche #2 -> même id", rf2Retry.body.result?.id === fiche2Id, { first: fiche2Id, second: rf2Retry.body.result?.id });

    const rf5 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche", carnetId, clientId, legacyId: "legacy-fiche-5", number: 5, legacyStatus: "livre" },
    });
    check("import fiche #5 -> 200", rf5.status === 200, rf5);
    fiche5Id = rf5.body.result?.id;
    check("fiche #5 -> status mappé 'delivered' (D8)", rf5.body.result?.status === "delivered", rf5.body.result);
    check("fiche #5 -> page/slot cohérents (page=2, slot=1)", rf5.body.result?.page_number === 2 && rf5.body.result?.slot_number === 1, rf5.body.result);

    const numbers = dbQueryRows(`select array_agg(number order by number) as numbers from public.fiches where carnet_id = '${carnetId}';`)[0]?.numbers;
    check("carnet -> numéros EXACTEMENT [1,2,5], jamais [1,2,3]", JSON.stringify(numbers) === JSON.stringify([1, 2, 5]), numbers);

    const nextNumberRow = dbQueryRows(`select next_number from public.carnets where id = '${carnetId}';`)[0];
    check("carnet -> next_number = 6 (jamais réalloué automatiquement)", nextNumberRow?.next_number === 6, nextNumberRow);

    // Retry (idempotence fiche).
    const rf1Retry = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche", carnetId, clientId, legacyId: "legacy-fiche-1", number: 1, legacyStatus: "recu" },
    });
    check("retry fiche #1 -> même id", rf1Retry.body.result?.id === fiche1Id, { first: fiche1Id, second: rf1Retry.body.result?.id });
    const ficheRows = dbQueryRows(`select count(*) as n from public.fiches where workshop_id = '${workshopAId}' and metadata->>'legacy_id' = 'legacy-fiche-1';`);
    check("retry fiche #1 -> exactement 1 ligne en base", ficheRows[0]?.n === 1, ficheRows[0]);
  }

  console.log("\n11) payment — au plus UN paiement legacy par fiche, retry -> pas de doublon");
  {
    const r1 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "payment", ficheId: fiche5Id, amount: 15000 } });
    check("import payment -> 200", r1.status === 200, r1);
    check("payment -> note D6 exacte", r1.body.result?.note === "Reprise du carnet — date du versement inconnue", r1.body.result);
    check("payment -> method null (D6)", r1.body.result?.method === null, r1.body.result);
    check("payment -> paid_at null (D6)", r1.body.result?.paid_at === null, r1.body.result);

    const r2 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "payment", ficheId: fiche5Id, amount: 15000 } });
    check("retry payment -> même id", r2.body.result?.id === r1.body.result?.id, r2.body);

    const r3 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "payment", ficheId: fiche5Id, amount: 0 } });
    check("payment montant <= 0 -> refusé (jamais un paiement à 0/négatif)", r3.status !== 200, r3);

    const rows = dbQueryRows(`select count(*) as n from public.client_payments where fiche_id = '${fiche5Id}' and metadata->>'source' = 'legacy_import';`);
    check("retry payment -> exactement 1 ligne en base", rows[0]?.n === 1, rows[0]);
  }

  console.log("\n12) modele — idempotence, jamais dédupliqué par nom seul");
  let modeleId;
  {
    const r1 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "modele", legacyId: "legacy-modele-1", nom: "Boubou brodé" } });
    check("import modele -> 200", r1.status === 200, r1);
    modeleId = r1.body.result?.id;

    const r2 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "modele", legacyId: "legacy-modele-1", nom: "Boubou brodé" } });
    check("retry modele -> même id", r2.body.result?.id === modeleId, r2.body);

    // Même NOM, legacy_id DIFFÉRENT -> un second modèle distinct (jamais dédupliqué par nom seul).
    const r3 = await callImport(jwtA, { workshopId: workshopAId, operation: { type: "modele", legacyId: "legacy-modele-2", nom: "Boubou brodé" } });
    check("même nom, legacy_id différent -> modèle DISTINCT", r3.body.result?.id && r3.body.result.id !== modeleId, { first: modeleId, second: r3.body.result?.id });
  }

  console.log("\n13) fiche_media — chemin déterministe, idempotence Storage + DB, jamais model_photo dans media_assets");
  {
    const r1 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche_media", ficheId: fiche5Id, kind: "fabric_photo", ordinal: 1, mimeType: "image/png", contentBase64: TINY_PNG_BASE64 },
    });
    check("import fiche_media -> 200", r1.status === 200, r1);
    const expectedPath = `workshops/${workshopAId}/fiches/${fiche5Id}/legacy-fabric_photo-1`;
    check("fiche_media -> storage_path déterministe attendu", r1.body.result?.storage_path === expectedPath, r1.body.result);

    const r2 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche_media", ficheId: fiche5Id, kind: "fabric_photo", ordinal: 1, mimeType: "image/png", contentBase64: TINY_PNG_BASE64 },
    });
    check("retry fiche_media -> 200 (reprise, pas une erreur)", r2.status === 200, r2);
    check("retry fiche_media -> même storage_path, même id media_assets", r2.body.result?.id === r1.body.result?.id && r2.body.result?.storage_path === expectedPath, r2.body.result);

    const rows = dbQueryRows(`select count(*) as n from public.media_assets where storage_path = '${expectedPath}';`);
    check("retry fiche_media -> exactement 1 ligne media_assets", rows[0]?.n === 1, rows[0]);

    const objectExists = await storageObjectExists(expectedPath);
    check("fiche_media -> objet Storage réellement présent au chemin déterministe", objectExists, expectedPath);

    const rModelPhoto = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "fiche_media", ficheId: fiche5Id, kind: "model_photo", ordinal: 2, mimeType: "image/png", contentBase64: TINY_PNG_BASE64 },
    });
    check("fiche_media kind='model_photo' -> refusé (réservé aux modèles)", rModelPhoto.status === 400, rModelPhoto);

    const modelPhotoRows = dbQueryRows(`select count(*) as n from public.media_assets where type = 'model_photo';`);
    check("media_assets -> AUCUNE ligne type='model_photo' (valeur enum intentionnellement inutilisée)", modelPhotoRows[0]?.n === 0, modelPhotoRows[0]);
  }

  console.log("\n14) modele_media — même garanties, table SÉPARÉE de media_assets");
  {
    const r1 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "modele_media", modeleId, kind: "photo", ordinal: 1, mimeType: "image/png", contentBase64: TINY_PNG_BASE64 },
    });
    check("import modele_media -> 200", r1.status === 200, r1);
    const expectedPath = `workshops/${workshopAId}/modeles/${modeleId}/legacy-photo-1`;
    check("modele_media -> storage_path déterministe attendu", r1.body.result?.storage_path === expectedPath, r1.body.result);

    const r2 = await callImport(jwtA, {
      workshopId: workshopAId,
      operation: { type: "modele_media", modeleId, kind: "photo", ordinal: 1, mimeType: "image/png", contentBase64: TINY_PNG_BASE64 },
    });
    check("retry modele_media -> même id", r2.body.result?.id === r1.body.result?.id, r2.body);

    const rows = dbQueryRows(`select count(*) as n from public.modele_medias where storage_path = '${expectedPath}';`);
    check("retry modele_media -> exactement 1 ligne modele_medias", rows[0]?.n === 1, rows[0]);
  }

  console.log("\n15) CONCURRENCE via HTTP — 10 requêtes simultanées, même legacy_id -> exactement 1 ligne, même id");
  {
    const N = 10;
    const promises = [];
    for (let i = 0; i < N; i++) {
      promises.push(
        callImport(jwtA, {
          workshopId: workshopAId,
          operation: { type: "client", legacyId: "legacy-race", displayName: "Client de Course HTTP" },
        }),
      );
    }
    const results = await Promise.all(promises);
    check("concurrence HTTP -> toutes les réponses 200", results.every((r) => r.status === 200), results.map((r) => r.status));
    const ids = new Set(results.map((r) => r.body.result?.id));
    check("concurrence HTTP -> un SEUL id résultant pour toutes les requêtes", ids.size === 1, [...ids]);
    const rows = dbQueryRows(`select count(*) as n from public.clients where workshop_id = '${workshopAId}' and metadata->>'legacy_id' = 'legacy-race';`);
    check("concurrence HTTP -> exactement 1 ligne en base", rows[0]?.n === 1, rows[0]);
  }

  console.log(`\n${passed} test(s) OK, ${failed} échec(s).`);
  if (failed > 0) console.log("Échecs :", failures.join(", "));

  console.log("\n--- Nettoyage exact des fixtures ---");
  // Storage d'abord (objets physiques, jamais couverts par le CASCADE SQL).
  await deleteStorageObject(`workshops/${workshopAId}/fiches/${fiche5Id}/legacy-fabric_photo-1`);
  await deleteStorageObject(`workshops/${workshopAId}/modeles/${modeleId}/legacy-photo-1`);

  // `workshops.owner_id` -> `auth.users(id)` en `ON DELETE RESTRICT` : l'atelier
  // de chaque owner doit disparaître AVANT l'utilisateur (cascade sur
  // carnets/clients/fiches/client_payments/modeles/modele_medias/media_assets/
  // workshop_members via `workshop_id` FK `on delete cascade`).
  for (const uid of [userAId, userBId]) {
    if (!uid) continue;
    dbExec(`delete from public.workshops where owner_id = '${uid}';`);
  }
  for (const uid of [userAId, userBId]) {
    if (!uid) continue;
    const res = await fetch(`${API_URL}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
    });
    console.log(`  cleanup: user ${uid} -> ${res.status === 200 ? "supprimé" : `échec (${res.status})`}`);
  }
  dbExec(`delete from app_hidden.pin_auth_register_throttle;`);
  dbExec(`delete from app_hidden.pin_auth_throttle;`);

  const baseline = dbQueryRows(
    `select (select count(*) from public.workshops where id in ('${workshopAId}','${workshopBId}')) as workshops, (select count(*) from public.clients where workshop_id in ('${workshopAId}','${workshopBId}')) as clients, (select count(*) from public.fiches where workshop_id in ('${workshopAId}','${workshopBId}')) as fiches, (select count(*) from public.client_payments where workshop_id in ('${workshopAId}','${workshopBId}')) as payments, (select count(*) from public.modeles where workshop_id in ('${workshopAId}','${workshopBId}')) as modeles, (select count(*) from public.media_assets where workshop_id in ('${workshopAId}','${workshopBId}')) as media_assets, (select count(*) from public.modele_medias where workshop_id in ('${workshopAId}','${workshopBId}')) as modele_medias, (select count(*) from auth.users where id in ('${userAId}','${userBId}')) as users;`,
  )[0];
  console.log("Baseline post-cleanup (fixtures de ce run uniquement) :", JSON.stringify(baseline));
  const allZero = baseline && Object.values(baseline).every((v) => v === 0);
  console.log(allZero ? "BASELINE POST-CLEANUP = TOUS COMPTEURS À 0" : "BASELINE POST-CLEANUP = RÉSIDU DÉTECTÉ");

  if (failed > 0 || !allZero) process.exitCode = 1;
}

main().catch((err) => {
  console.error("ERREUR SCRIPT:", err);
  process.exitCode = 1;
});
