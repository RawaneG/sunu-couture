#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios d'isolation Storage de Phase 8B
// (catalogue de modèles : `public.modeles`/`public.modele_medias` + branche
// MODELE des 2 policies `storage.objects` partagées avec Phase 8A) contre le
// stack Supabase LOCAL uniquement — même structure que
// `scripts/test-phase-8a-media.mjs` (deux utilisateurs de test réels,
// fixtures créées directement via la clé secrète, jamais de vraie donnée).
//
// Prérequis : npx supabase start (functions serve non nécessaire — Phase 8B
// n'utilise aucune Edge Function, comme Phase 8A).
//
// Usage : node scripts/test-phase-8b-catalog.mjs

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

  function userClient(accessToken) {
    return createClient(API_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  function anonClient() {
    return createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  const path = (workshopId, modeleId, fileId) => `workshops/${workshopId}/modeles/${modeleId}/${fileId}`;
  const testBlob = () => Buffer.from("phase-8b-test-bytes");

  console.log("Phase 8B — isolation Storage catalogue de modèles — suite automatisée\n");

  console.log("0) Connexion des deux utilisateurs de test + nettoyage");
  const user1 = await login(TEST_PHONE_1);
  const user2 = await login(TEST_PHONE_2);
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

  const clientA = userClient(user1.accessToken);
  const clientB = userClient(user2.accessToken);

  console.log("\n1) Fixtures : atelier A (owner=user1), atelier B (owner=user2) — modèles créés par A/B eux-mêmes (RLS réelle, pas service_role)");
  const workshopA = await createWorkshop(user1.userId, "Atelier Catalogue Test A");
  const workshopB = await createWorkshop(user2.userId, "Atelier Catalogue Test B");

  console.log("\n2) Scénario modèle A — A insère son propre modèle (RLS/grant utilisateur réel)");
  let modeleA;
  {
    const { data, error } = await clientA.from("modeles").insert({ workshop_id: workshopA, nom: "Robe wax A" }).select().single();
    check("A insert modeles réussit pour son propre atelier", !error && Boolean(data?.id), error);
    modeleA = data;
  }

  console.log("\n3) Scénario modèle B — B insère son propre modèle");
  let modeleB;
  {
    const { data, error } = await clientB.from("modeles").insert({ workshop_id: workshopB, nom: "Robe wax B" }).select().single();
    check("B insert modeles réussit pour son propre atelier", !error && Boolean(data?.id), error);
    modeleB = data;
  }

  console.log("\n4) Isolation modèle — A ne voit pas le modèle de B, B ne voit pas celui de A");
  {
    const { data: aSeesB } = await clientA.from("modeles").select("id").eq("id", modeleB.id);
    check("A ne voit pas le modèle de B (0 ligne)", (aSeesB ?? []).length === 0);
    const { data: bSeesA } = await clientB.from("modeles").select("id").eq("id", modeleA.id);
    check("B ne voit pas le modèle de A (0 ligne)", (bSeesA ?? []).length === 0);
  }

  const pathA = path(workshopA, modeleA.id, crypto.randomUUID());
  const pathB = path(workshopB, modeleB.id, crypto.randomUUID());

  console.log("\n5) A upload dans son propre modèle -> autorisé");
  {
    const { error } = await clientA.storage.from(BUCKET).upload(pathA, testBlob(), { contentType: "image/png" });
    check("upload A dans son propre modèle réussit", !error, error);
  }

  console.log("\n6) A insert modele_medias (kind=photo) -> autorisé");
  let mediaRowId;
  {
    const { data, error } = await clientA
      .from("modele_medias")
      .insert({ workshop_id: workshopA, modele_id: modeleA.id, kind: "photo", storage_path: pathA, mime_type: "image/png", size_bytes: testBlob().length, position: 0, metadata: { checksum: "test" } })
      .select()
      .single();
    check("insert modele_medias réussit pour A", !error && Boolean(data?.id), error);
    mediaRowId = data?.id;
  }

  console.log("\n7) A signed URL + téléchargement -> fonctionne (2xx réel)");
  {
    const { data, error } = await clientA.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl réussit pour A sur son propre média modèle", !error && Boolean(data?.signedUrl), error);
    if (data?.signedUrl) {
      const res = await fetch(data.signedUrl);
      check(`téléchargement de l'URL signée réussit (code réel : ${res.status})`, res.status >= 200 && res.status < 300, { status: res.status });
    }
  }

  console.log("\n8) A upload dans le path du modèle de B -> refusé");
  {
    const foreignPath = path(workshopB, modeleB.id, crypto.randomUUID());
    const { error } = await clientA.storage.from(BUCKET).upload(foreignPath, testBlob(), { contentType: "image/png" });
    check(`upload de A dans le modèle de B refusé (code réel observé)`, Boolean(error), { error });
  }

  console.log("\n9) A -> couple incohérent (modèle A sous atelier B dans le path) -> refusé");
  {
    const mismatched = path(workshopB, modeleA.id, crypto.randomUUID());
    const { error } = await clientA.storage.from(BUCKET).upload(mismatched, testBlob(), { contentType: "image/png" });
    check("couple workshop/modèle incohérent refusé (vérifie le COUPLE, pas juste modeleId)", Boolean(error), { error });
  }

  console.log("\n10) B ne peut pas signer/lire le média modèle de A");
  {
    const { data, error } = await clientB.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl de B sur le média modèle de A échoue", Boolean(error) || !data?.signedUrl, { error, data });
  }

  console.log("\n11) anon -> refusé (upload ET lecture)");
  {
    const anon = anonClient();
    const { error: uploadError } = await anon.storage.from(BUCKET).upload(pathB, testBlob(), { contentType: "image/png" });
    check("upload anon refusé", Boolean(uploadError), { uploadError });
    const { data: signData, error: signError } = await anon.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("createSignedUrl anon refusé", Boolean(signError) || !signData?.signedUrl, { signError, signData });
  }

  console.log("\n12) Détacher (DELETE modele_medias) -> succès, objet Storage TOUJOURS présent");
  {
    const { error: deleteError } = await clientA.from("modele_medias").delete().eq("id", mediaRowId);
    check("DELETE modele_medias réussit (grant Phase 4, pas de UPDATE nécessaire)", !deleteError, deleteError);

    const { data: rowAfter } = await clientA.from("modele_medias").select("id").eq("id", mediaRowId);
    check("la row a bien disparu (DELETE physique, pas soft-delete)", (rowAfter ?? []).length === 0);

    const { data: signAfter, error: signAfterError } = await clientA.storage.from(BUCKET).createSignedUrl(pathA, 60);
    check("l'objet Storage est TOUJOURS présent après le détachement (aucun storage.remove())", !signAfterError && Boolean(signAfter?.signedUrl), signAfterError);
  }

  console.log("\n13) Soft-delete du modèle -> l'accès Storage à un NOUVEAU média de ce modèle est refusé");
  let path2;
  let mediaRow2Id;
  {
    // Nouveau média (le précédent a été détaché à l'étape 12) pour observer
    // l'effet du soft-delete du modèle indépendamment du détachement.
    path2 = path(workshopA, modeleA.id, crypto.randomUUID());
    const { error: uploadError } = await clientA.storage.from(BUCKET).upload(path2, testBlob(), { contentType: "image/png" });
    check("upload d'un second média AVANT soft-delete réussit", !uploadError, uploadError);

    const { data: mediaRow2, error: insertError } = await clientA
      .from("modele_medias")
      .insert({ workshop_id: workshopA, modele_id: modeleA.id, kind: "photo", storage_path: path2, mime_type: "image/png", size_bytes: testBlob().length, position: 1, metadata: {} })
      .select()
      .single();
    check("insert modele_medias du second média réussit (row elle-même PAS soft-deleted)", !insertError && Boolean(mediaRow2?.id), insertError);
    mediaRow2Id = mediaRow2?.id;

    const { error: softDeleteError } = await clientA.from("modeles").update({ deleted_at: new Date().toISOString() }).eq("id", modeleA.id);
    check("soft-delete du modèle réussit", !softDeleteError, softDeleteError);

    const { data: signAfterDelete, error: signAfterDeleteError } = await clientA.storage.from(BUCKET).createSignedUrl(path2, 60);
    check(
      "signature refusée après soft-delete du modèle parent (policy Storage exige modèle actif — code réel observé)",
      Boolean(signAfterDeleteError) || !signAfterDelete?.signedUrl,
      { signAfterDeleteError, signAfterDelete },
    );
  }

  console.log("\n14) Vérification directe de la requête `listActiveModeleMedias` (jointure !inner PostgREST réelle, §29)");
  {
    // Même forme de requête que `gateway.listActiveModeleMedias()` — la row
    // elle-même n'est PAS soft-deleted (deleted_at IS NULL), mais son
    // modèle PARENT l'est : la jointure !inner + le filtre sur
    // modeles.deleted_at doit l'exclure, jamais un filtrage frontend a
    // posteriori qui laisserait passer une ligne dont Storage refuserait
    // ensuite la signature (déjà confirmé à l'étape 13).
    const { data, error } = await clientA
      .from("modele_medias")
      .select("*, modeles!inner(deleted_at)")
      .eq("workshop_id", workshopA)
      .is("deleted_at", null)
      .is("modeles.deleted_at", null);
    check("la requête réelle (jointure !inner) exclut bien le média dont le modèle parent est soft-deleted", !error && (data ?? []).every((r) => r.id !== mediaRow2Id), { error, data });
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
