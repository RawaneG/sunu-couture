#!/usr/bin/env node
// Rejoue AUTOMATIQUEMENT les scénarios d'isolation du ledger de paiements
// Phase 11A (`public.client_payments` + vue `public.fiche_balances`) contre
// le stack Supabase LOCAL uniquement — même structure que
// `scripts/test-phase-8b-catalog.mjs` (deux utilisateurs de test réels,
// fixtures créées via la clé secrète UNIQUEMENT pour le setup/cleanup, les
// assertions RLS passent par les vrais clients A/B authentifiés).
//
// Prérequis : npx supabase start (aucune Edge Function nécessaire — Phase
// 11A n'en utilise aucune, comme 8A/8B).
//
// Usage : node scripts/test-phase-11a-payments.mjs

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
    if (!res.ok) throw new Error(`Échec de connexion (${phone}) — Réponse: ${JSON.stringify(body)}`);
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

  console.log("Phase 11A — isolation ledger de paiements — suite automatisée\n");

  console.log("0) Connexion des deux utilisateurs de test + nettoyage");
  const user1 = await login(TEST_PHONE_1);
  const user2 = await login(TEST_PHONE_2);
  await deleteWorkshopsOwnedBy(user1.userId);
  await deleteWorkshopsOwnedBy(user2.userId);

  const clientA = userClient(user1.accessToken);
  const clientB = userClient(user2.accessToken);

  console.log("\n1) Fixtures : atelier A (owner=A) + fiche A prix=10000, atelier B (owner=B) + fiche B prix=5000");
  const workshopA = await createWorkshop(user1.userId, "Atelier Paiements Test A");
  const workshopB = await createWorkshop(user2.userId, "Atelier Paiements Test B");
  const ficheA = await createFiche(workshopA, "Fiche A — paiements test");
  const ficheB = await createFiche(workshopB, "Fiche B — paiements test");

  // Prix fixé via une vraie écriture authentifiée (même chemin que
  // PrixChampCell → FicheRepository.setInfo → UPDATE fiches), pas via le
  // service role — `total_price` n'est pas réglable à la création.
  {
    const { error } = await clientA.from("fiches").update({ total_price: 10000 }).eq("id", ficheA);
    if (error) throw new Error(`fixation du prix fiche A échouée: ${error.message}`);
  }
  {
    const { error } = await clientB.from("fiches").update({ total_price: 5000 }).eq("id", ficheB);
    if (error) throw new Error(`fixation du prix fiche B échouée: ${error.message}`);
  }

  console.log("\n2) Scénario 1 — A ajoute un versement (RLS réelle, pas service_role) sur sa propre fiche -> succès");
  let payment1Id;
  {
    const { data, error } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: 3000 }).select().single();
    check("A ajoute un versement sur fiche A", !error && Boolean(data?.id), error);
    payment1Id = data?.id;
  }

  console.log("\n3) Scénario 2/3 — isolation lecture : A ne voit pas les paiements de B, B ne voit pas ceux de A");
  {
    const { data: aSeesB } = await clientA.from("client_payments").select("id").eq("fiche_id", ficheB);
    check("A ne voit pas les paiements de B (0 ligne)", (aSeesB ?? []).length === 0);
    const { data: bSeesA } = await clientB.from("client_payments").select("id").eq("fiche_id", ficheA);
    check("B ne voit pas les paiements de A (0 ligne)", (bSeesA ?? []).length === 0);
  }

  console.log("\n4) Scénario — balance A après 1er versement : total_paid=3000, reste=7000 (vue fiche_balances réelle)");
  {
    const { data, error } = await clientA.from("fiche_balances").select("*").eq("fiche_id", ficheA).single();
    check("balance A lisible", !error && Boolean(data), error);
    check("balance A total_paid = 3000 (vraie vue SQL, jamais recalculé côté client)", data?.total_paid === 3000, data);
    check("balance A reste = 7000", data?.reste === 7000, data);
  }

  console.log("\n5) Scénario 7 — second versement A : total_paid = somme réelle, reste recalculé par la vue");
  {
    const { data, error } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: 2000 }).select().single();
    check("second versement A réussit", !error && Boolean(data?.id), error);

    const { data: balance } = await clientA.from("fiche_balances").select("*").eq("fiche_id", ficheA).single();
    check("total_paid = 5000 (3000+2000, §52)", balance?.total_paid === 5000, balance);
    check("reste = 5000 (10000-5000)", balance?.reste === 5000, balance);
  }

  console.log("\n6) Scénario — surpaiement : reste devient NÉGATIF, jamais tronqué (§52)");
  {
    const { error } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: 7000 }).select().single();
    check("versement de surpaiement (total 12000 > prix 10000) accepté par le schéma", !error, error);

    const { data: balance } = await clientA.from("fiche_balances").select("*").eq("fiche_id", ficheA).single();
    check("total_paid = 12000", balance?.total_paid === 12000, balance);
    check("reste = -2000 (surpaiement, jamais tronqué à 0)", balance?.reste === -2000, balance);
  }

  console.log("\n7) Scénario 8 — A tente un versement sur la fiche de B -> refus (fiche hors atelier A)");
  {
    const { error } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheB, amount: 1000 });
    check("A → fiche B refusé (code réel observé)", Boolean(error), { error });
  }

  console.log("\n8) Scénario 9 — faux couple : workshop_id=A + fiche_id=B -> refusé par la FK composite (workshop_id, fiche_id)");
  {
    const { error } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheB, amount: 1000 });
    check("couple workshop A / fiche B incohérent refusé (FK composite, pas juste fiche_id)", Boolean(error), { error });
  }

  console.log("\n9) Scénario 10/11 — anon refusé (lecture ET écriture)");
  {
    const anon = anonClient();
    const { data: selectData, error: selectError } = await anon.from("client_payments").select("id").eq("fiche_id", ficheA);
    check("anon SELECT refusé (0 ligne ou permission_denied — code réel observé)", Boolean(selectError) || (selectData ?? []).length === 0, { selectError, selectData });

    const { error: insertError } = await anon.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: 1000 });
    check("anon INSERT refusé", Boolean(insertError), { insertError });
  }

  console.log("\n10) Scénario 12/13 — amount 0 et négatif refusés par la contrainte CHECK");
  {
    const { error: zeroError } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: 0 });
    check("amount=0 refusé", Boolean(zeroError), { zeroError });

    const { error: negError } = await clientA.from("client_payments").insert({ workshop_id: workshopA, fiche_id: ficheA, amount: -500 });
    check("amount négatif refusé", Boolean(negError), { negError });
  }

  console.log("\n11) Scénario 14/15 — ledger immuable : UPDATE et DELETE par A refusés (aucun GRANT)");
  {
    const { error: updateError } = await clientA.from("client_payments").update({ amount: 9999 }).eq("id", payment1Id);
    check("UPDATE paiement refusé (client_payments immuable)", Boolean(updateError), { updateError });

    const { error: deleteError } = await clientA.from("client_payments").delete().eq("id", payment1Id);
    check("DELETE paiement refusé", Boolean(deleteError), { deleteError });

    const { data: stillThere } = await clientA.from("client_payments").select("id").eq("id", payment1Id);
    check("la ligne existe toujours (aucune mutation n'a réellement eu lieu)", (stillThere ?? []).length === 1, stillThere);
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
