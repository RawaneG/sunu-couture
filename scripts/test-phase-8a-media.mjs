#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios d'isolation Storage de Phase 8A
// (bucket privé `media`, policies `storage.objects`) contre le stack
// Supabase LOCAL — même structure que
// `scripts/test-create-fiche-from-draft.mjs` (lecture dynamique de
// `supabase status`, deux utilisateurs de test réels, fixtures créées
// directement via la clé secrète, jamais de vraie donnée).
//
// Prérequis : npx supabase start (functions serve non nécessaire — Phase 8A
// n'utilise aucune Edge Function, §57).
//
// Usage : node scripts/test-phase-8a-media.mjs
//
// Ce script utilise `@supabase/supabase-js` (même version que le front) pour
// des opérations Storage réelles (upload/createSignedUrl) authentifiées par
// utilisateur — plus fidèle qu'un appel REST brut pour ce périmètre.

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const TEST_PHONE_1 = "221770000099";
const TEST_PHONE_2 = "221770000098";
const TEST_CODE = "123456";
const BUCKET = "media";

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

async function main() {
  const env = getLocalConfig();
  const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = env;
  if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    console.error("Config locale incomplète (API_URL/PUBLISHABLE_KEY/SECRET_KEY manquants).");
    process.exit(1);
  }

  function adminHeaders(extra = {}) {
    return { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json", ...extra };
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
      throw new Error(`Échec de connexion (${phone}) — Réponse: ${JSON.stringify(body)}`);
    }
    return { userId: body.user.id, accessToken: body.access_token };
  }

  async function deleteWorkshopsOwnedBy(userId) {
    await fetch(`${API_URL}/rest/v1/workshops?owner_id=eq.${userId}`, { method: "DELETE", headers: adminHeaders() });
  }

  async function createWorkshop(ownerId, name) {
    const res = await fetch(`${API_URL}/rest/v1/workshops`, {
      method: "POST",
      headers: adminHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ owner_id: ownerId, name }),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(`createWorkshop a échoué: ${JSON.stringify(rows)}`);
    return rows[0].id;
  }

  async function createFiche(workshopId, garment) {
    const res = await fetch(`${API_URL}/rest/v1/rpc/create_fiche_from_draft_api`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ p_workshop_id: workshopId, p_client_id: null, p_fiche: { garment } }),
    });
    const row = await res.json();
    if (!res.ok) throw new Error(`createFiche a échoué: ${JSON.stringify(row)}`);
    return row.id;
  }

  function userClient(accessToken) {
    return createClient(API_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  function anonClient() {
    return createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  const path = (workshopId, ficheId, fileId) => `workshops/${workshopId}/fiches/${ficheId}/${fileId}`;
  const testBlob = () => Buffer.from("phase-8a-test-bytes");

  console.log("Phase 8A — isolation Storage — suite automatisée\n");

  console.log("0) Connexion des deux utilisateurs de test + nettoyage");
  const user1 = await login(TEST_PHONE_1);
  const user2 = await login(TEST_PHONE_2);
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

  console.log("\n1) Fixtures : atelier A (owner=user1) + fiche A, atelier B (owner=user2) + fiche B");
  const workshopA = await createWorkshop(user1.userId, "Atelier Media Test A");
  const workshopB = await createWorkshop(user2.userId, "Atelier Media Test B");
  const ficheA = await createFiche(workshopA, "Fiche A — média test");
  const ficheB = await createFiche(workshopB, "Fiche B — média test");

  const clientA = userClient(user1.accessToken);
  const clientB = userClient(user2.accessToken);
  const pathA = path(workshopA, ficheA, crypto.randomUUID());
  const pathB = path(workshopB, ficheB, crypto.randomUUID());

  console.log("\n2) A upload dans fiche A -> autorisé");
  {
    const { error } = await clientA.storage.from(BUCKET).upload(pathA, testBlob(), { contentType: "image/png" });
    check("upload A dans sa propre fiche réussit", !error, error);
  }

  console.log("\n3) A insert media_assets (fiche A) -> autorisé");
  let mediaRowId;
  {
    const { data, error } = await clientA
      .from("media_assets")
      .insert({
        workshop_id: workshopA,
        fiche_id: ficheA,
        type: "fabric_photo",
        storage_path: pathA,
        mime_type: "image/png",
        size_bytes: testBlob().length,
        metadata: { checksum: "test" },
      })
      .select()
      .single();
    check("insert media_assets réussit pour A", !error && Boolean(data?.id), error);
    mediaRowId = data?.id;
  }

  console.log("\n4) A signed URL -> fonctionne");
  {
    const { data, error } = await clientA.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl réussit pour A sur son propre objet", !error && Boolean(data?.signedUrl), error);
    if (data?.signedUrl) {
      const res = await fetch(data.signedUrl);
      check("l'URL signée est effectivement accessible (200)", res.status === 200, { status: res.status });
    }
  }

  console.log("\n5) A upload dans path atelier B / fiche B -> refusé");
  {
    const foreignPath = path(workshopB, ficheB, crypto.randomUUID());
    const { error } = await clientA.storage.from(BUCKET).upload(foreignPath, testBlob(), { contentType: "image/png" });
    check("upload de A dans le path de B est refusé", Boolean(error), { error });
  }

  console.log("\n6) B ne peut pas signer/lire l'objet de A");
  {
    const { data, error } = await clientB.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl de B sur l'objet de A échoue", Boolean(error) || !data?.signedUrl, { error, data });
  }

  console.log("\n7) anon -> refusé");
  {
    const anon = anonClient();
    const { error: uploadError } = await anon.storage.from(BUCKET).upload(pathB, testBlob(), { contentType: "image/png" });
    check("upload anon refusé", Boolean(uploadError), { uploadError });
    const { data: signData, error: signError } = await anon.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl anon refusé", Boolean(signError) || !signData?.signedUrl, { signError, signData });
  }

  console.log("\n8) soft-delete media row -> row inactive, fichier Storage encore présent");
  {
    const { error: updateError } = await clientA.from("media_assets").update({ deleted_at: new Date().toISOString() }).eq("id", mediaRowId);
    check("soft-delete (deleted_at) réussit", !updateError, updateError);

    const { data: rowAfter, error: readError } = await clientA.from("media_assets").select("deleted_at").eq("id", mediaRowId).single();
    check("la row est bien marquée inactive (deleted_at non nul)", !readError && rowAfter?.deleted_at !== null, { readError, rowAfter });

    const { data: signAfter, error: signAfterError } = await clientA.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("le fichier Storage est TOUJOURS présent après soft-delete (aucun storage.remove())", !signAfterError && Boolean(signAfter?.signedUrl), signAfterError);
  }

  console.log("\n9) URL signée très courte -> fonctionne avant expiration, refuse après");
  {
    const shortPath = path(workshopA, ficheA, crypto.randomUUID());
    await clientA.storage.from(BUCKET).upload(shortPath, testBlob(), { contentType: "image/png" });
    const { data, error } = await clientA.storage.from(BUCKET).createSignedUrl(shortPath, 1);
    check("création d'une URL signée à 1s réussit", !error && Boolean(data?.signedUrl), error);

    if (data?.signedUrl) {
      const before = await fetch(data.signedUrl);
      check("l'URL signée fonctionne immédiatement (avant expiration)", before.status === 200, { status: before.status });

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const after = await fetch(data.signedUrl);
      // Ne jamais présumer 403 : rapporter le code HTTP réel renvoyé par le
      // runtime Storage local une fois l'URL expirée.
      check(`l'URL signée est refusée après expiration (code réel observé : ${after.status})`, after.status >= 400 && after.status < 500, {
        status: after.status,
      });
    }
  }

  console.log("\nNettoyage des données de test…");
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

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
