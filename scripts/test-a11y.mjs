#!/usr/bin/env node
// Test d'accessibilité automatisé et reproductible des 3 écrans Auth
// (/connexion, /connexion/code, /connexion/atelier), états normal ET erreur.
//
// PRÉREQUIS LOCAUX (non démarrés par ce script) :
//   1. La stack Supabase locale doit tourner :         npx supabase start
//   2. Le serveur de dev Vite doit tourner :            npm run dev
//      (par défaut sur http://localhost:5173 — voir VITE_BASE_URL ci-dessous
//      pour pointer ailleurs)
//   3. Le navigateur Chromium de Playwright doit être installé (une seule
//      fois après npm install) :                        npx playwright install chromium
//
// Ce script ne modifie AUCUNE donnée réelle : les appels réseau vers
// Supabase Auth / l'Edge Function sont interceptés (page.route) pour
// produire les états normal et erreur de façon déterministe, sans dépendre
// du numéro de test `auth.sms.test_otp` ni écrire dans la base.
//
// Usage : npm run test:a11y
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.VITE_BASE_URL ?? "http://localhost:5173";
const AXE_TAGS = ["wcag2a", "wcag2aa"];

let failures = 0;

async function checkServerReachable() {
  try {
    const res = await fetch(BASE, { method: "GET" });
    if (!res.ok && res.status !== 304) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`\n❌ Le serveur de dev Vite n'est pas joignable sur ${BASE}.`);
    console.error(`   Démarre-le avec: npm run dev`);
    console.error(`   (et la stack Supabase locale avec: npx supabase start)\n`);
    console.error(`   Détail: ${err.message}`);
    process.exit(1);
  }
}

async function runAxe(page, label) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const violations = results.violations;
  const incompleteContrast = results.incomplete.filter((i) => i.id === "color-contrast");

  console.log(`\n=== ${label} ===`);
  if (violations.length === 0) {
    console.log(`  ✅ 0 violation (${AXE_TAGS.join(", ")})`);
  } else {
    failures += violations.length;
    for (const v of violations) {
      console.log(`  ❌ [${v.impact}] ${v.id}: ${v.description}`);
      for (const node of v.nodes) {
        console.log(`       ${node.target.join(" ")} — ${node.failureSummary?.replace(/\n/g, " ")}`);
      }
    }
  }
  if (incompleteContrast.length) {
    // Limite connue d'axe : il ne peut pas résoudre le contraste réel derrière
    // un fond `backdrop-filter: blur()` (glass-card) et le classe "incomplete"
    // plutôt que pass/fail. Ce n'est PAS une violation — les ratios réels sont
    // vérifiés séparément (mesure par échantillonnage de pixels rendus, voir
    // le rapport de la Ronde 4). On le signale sans le compter comme un échec.
    console.log(`  ⚠️  ${incompleteContrast.length} nœud(s) color-contrast marqué(s) "incomplete" par axe (fond flouté, non résolu automatiquement — non compté comme échec)`);
  }
  return results;
}

/** Intercepte l'appel OTP pour forcer un succès sans toucher au vrai réseau/backend. */
async function mockOtpSendSuccess(page) {
  await page.route("**/auth/v1/otp", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

/** Intercepte l'appel OTP pour forcer un échec (état d'erreur PhoneEntry). */
async function mockOtpSendFailure(page) {
  await page.route("**/auth/v1/otp", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      headers: { "x-sb-error-code": "sms_send_failed" },
      body: JSON.stringify({ code: "sms_send_failed", msg: "Error sending confirmation OTP to provider" }),
    }),
  );
}

/** Intercepte la vérification du code pour forcer un échec (état d'erreur OtpVerify). */
async function mockVerifyFailure(page) {
  await page.route("**/auth/v1/verify", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "otp_expired", msg: "Token has expired or is invalid" }),
    }),
  );
}

/** Intercepte la création d'atelier pour forcer un échec (état d'erreur WorkshopName). */
async function mockProvisionFailure(page) {
  await page.route("**/functions/v1/provision-workshop", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "INTERNAL" }),
    }),
  );
}

/** @axe-core/playwright exige une page issue d'un `browser.newContext()`
 * explicite (`browser.newPage()` direct n'est pas supporté par AxeBuilder). */
async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  return { context, page };
}

async function main() {
  await checkServerReachable();
  const browser = await chromium.launch();

  // --- /connexion : état normal ---
  {
    const { context, page } = await newPage(browser);
    await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
    await runAxe(page, "/connexion — état normal");
    await context.close();
  }

  // --- /connexion : état erreur (échec d'envoi simulé) ---
  {
    const { context, page } = await newPage(browser);
    await mockOtpSendFailure(page);
    await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
    await page.fill("#phone-input", "77 000 00 01");
    await page.getByRole("button", { name: /Recevoir mon code/i }).click();
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 10000 });
    await runAxe(page, "/connexion — état erreur (échec d'envoi)");
    await context.close();
  }

  // --- /connexion/code : état normal + état erreur ---
  // Atteint par un vrai parcours de clic (l'écran redirige vers /connexion si
  // l'état de route ne contient pas de numéro) ; l'envoi OTP est intercepté en
  // succès pour ne dépendre d'aucun état réel côté Supabase.
  {
    const { context, page } = await newPage(browser);
    await mockOtpSendSuccess(page);
    await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
    await page.fill("#phone-input", "77 000 00 01");
    await page.getByRole("button", { name: /Recevoir mon code/i }).click();
    await page.waitForURL(/\/connexion\/code/, { timeout: 10000 });
    await runAxe(page, "/connexion/code — état normal");

    await mockVerifyFailure(page);
    await page.fill("#otp-input", "000000");
    await page.getByRole("button", { name: /Vérifier le code/i }).click();
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 10000 });
    await runAxe(page, "/connexion/code — état erreur (code refusé)");
    await context.close();
  }

  // --- /connexion/atelier : état normal + état erreur ---
  // Navigation directe : cet écran ne dépend pas de `location.state` pour son
  // rendu (seule la soumission appelle `provisionWorkshop`, interceptée).
  {
    const { context, page } = await newPage(browser);
    await page.goto(`${BASE}/connexion/atelier`, { waitUntil: "networkidle" });
    await runAxe(page, "/connexion/atelier — état normal");

    await mockProvisionFailure(page);
    await page.fill("#workshop-name-input", "Atelier de test");
    await page.getByRole("button", { name: /Créer mon atelier/i }).click();
    await page.getByRole("alert").waitFor({ state: "visible", timeout: 10000 });
    await runAxe(page, "/connexion/atelier — état erreur (création échouée)");
    await context.close();
  }

  await browser.close();

  console.log(`\n${"=".repeat(50)}`);
  if (failures > 0) {
    console.log(`❌ ${failures} violation(s) d'accessibilité — voir le détail ci-dessus.`);
    process.exitCode = 1;
  } else {
    console.log(`✅ 0 violation d'accessibilité (wcag2a, wcag2aa) sur les 6 scénarios (3 écrans × 2 états).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
