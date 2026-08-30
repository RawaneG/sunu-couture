# Phase 1 — Plan de migration de Tayoo (local → cloud, offline-first)

> À lire après `01-AUDIT.md`. Ce document décrit **comment** on transforme l'app
> sans la réécrire, phase par phase, avec migrations, tests et retour en arrière.
> **Aucune modification destructive n'est faite tant que ce plan n'est pas validé.**
>
> **Mis à jour le 2026-08-29** après validation des décisions D1–D11 et des
> corrections A–Q : voir **`03-DECISIONS.md`**, qui est la référence canonique.
> En cas de divergence, `03-DECISIONS.md` fait foi.
>
> **Révision du soir** : D1 réaligné sur le projet réel `sunu-couture-dev`
> (`eu-west-1`, PG 17, non relié) ; Phase 2 refaite avec migrations horodatées,
> RLS activée en migration, durcissement sécurité, seed abonnement retiré.
>
> **Révision de nuit — Phase 2 = « candidate »** : isolation multi-atelier par FK
> composites (K), brouillon 100 % local + `create_fiche_from_draft()` (L),
> `modeles.nom` non vide (M), `signature_path` supprimée → `media_assets` (N),
> `owner_id` canonique + déclencheurs (O), ADP-fonctions no-op documenté (P).
>
> **Passe statique finale** : transfert de propriétaire sûr (O) ; `create_fiche_from_draft`
> sans `DEFAULT` + règle métier anti-fiche-vide, **`allocate_fiche_number` supprimée**
> (porte unique — L) ; index de préfixe exact + `fiches → carnets` en `ON DELETE NO ACTION`
> (K) ; `ALTER DEFAULT PRIVILEGES` schema-scoped retiré (P) ; frontière `service_role`
> = exigence bloquante Phases 3–4 (Q). Tests : **35 groupes**.
>
> **Correction documentaire 2026-08-30 (aucun changement SQL/applicatif)** : D1
> distingue désormais explicitement `sunu-couture-dev` (**dev/staging**, `db push
> --dry-run` autorisé après validation locale, `db push` réel seulement après revue
> + confirmation du porteur) du futur **projet de production** (créé après RLS +
> isolation + pilote) ; Phase 4 documentée comme livrant **`GRANT` + RLS dans la
> même migration** (sans `GRANT`, une politique RLS ne rend pas une table
> accessible par la Data API) ; provenance des migrations clarifiée (rédigées à la
> main, validées par la CLI réelle sur PG 17, non recréées) ; ligne `subscriptions`
> de la correspondance de schéma corrigée (aucune souscription créée en Phase 2,
> reporté Phase 14).
>
> **Déploiement réel 2026-08-30** : Dashboard vérifié (déploiement auto désactivé)
> → `link` → `db push --dry-run` (revue) → **confirmation explicite du porteur** →
> `db push` réel → **9/9 migrations appliquées** sur `sunu-couture-dev`,
> `migration list` local==remote, `db advisors --linked` 0 WARN/0 ERROR, structure
> et privilèges vérifiés en base (15 tables, RLS 15/15, 2 vues `security_invoker`,
> `app_hidden` 6 fonctions, `service_role` seul sur `create_fiche_from_draft`/
> `provision_workshop`, `rls_auto_enable()` réel révoqué pour `anon`/`authenticated`,
> `ensure_rls` actif, 0 politique métier), **35/35 tests SQL rejoués contre le
> distant réel** (0 ligne résiduelle), `npm test`/`tsc -b` OK. Test T16 durci pour
> accepter aussi `insufficient_privilege` (le distant n'a pas de `GRANT` pour
> `authenticated` — refus encore plus strict, cohérent Phase 4). **Statut :
> « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev ».**

---

## 1. Principes directeurs

1. **Progressif, jamais de big-bang.** Chaque phase est livrable, testable et réversible seule.
2. **Couche Repository obligatoire.** Les composants ne parlent plus jamais à `localStorage` ni à Supabase directement. Ils parlent à une interface (`ClientRepository`, `FicheRepository`, `PaymentRepository`, `MediaRepository`, `SubscriptionRepository`). Aujourd'hui une implémentation `LocalStorageRepository`, demain `SupabaseRepository`, plus tard `NestApiRepository` — sans toucher aux pages.
3. **Offline-first réel.** Écriture locale (IndexedDB) d'abord, puis file de synchronisation vers Supabase. L'UI dit toujours la vérité sur l'état de sauvegarde.
4. **Aucune étape destructive sans : (a) export JSON de secours, (b) prévisualisation chiffrée, (c) confirmation explicite de l'utilisateur.**
5. **`localStorage` métier conservé en lecture seule** jusqu'à validation explicite de l'import. **Pas de dual-write** `localStorage + cloud` (correction D, décision D11).
6. **Drapeau de build** `VITE_BACKEND=local | supabase` (correction D) : injecté **au build** par Vite → **ce n'est pas** un basculement instantané sans redéploiement. Usages : développement, tests, migration, build de secours. **En production, l'utilisateur ne bascule pas librement** entre stockage legacy local et cloud (sinon deux sources de vérité). Le retour arrière production passe par le **rollback du déploiement Vercel** + la **sauvegarde historique en lecture seule** + le **mode hors ligne IndexedDB** quand le cloud est indisponible.
7. **Zustand reste**, mais uniquement pour l'**état d'interface éphémère** (onglet actif, sheet ouverte, brouillon en cours d'édition, file de synchro observable). Plus de données métier dedans.

---

## 2. Cible technique

```
┌─────────────────────────────────────────────────────────┐
│  Composants React (pages/, components/)                  │
│     └── hooks: useClients(), useFiche(id), usePayments() │
├─────────────────────────────────────────────────────────┤
│  Couche Repository (interfaces)                          │
│   ClientRepo · FicheRepo · PaymentRepo · MediaRepo ·     │
│   CarnetRepo · SubscriptionRepo · AuthRepo               │
├───────────────┬─────────────────────────────────────────┤
│ LocalStorage  │  Offline-first Repo (cible)             │
│ Repo (actuel, │   ├── IndexedDB : cache, brouillons,     │
│ fallback)     │   │   médias en attente, file d'ops,     │
│               │   │   état de synchro                     │
│               │   └── SyncEngine → Supabase              │
│               │        ├── @supabase/supabase-js         │
│               │        ├── Auth (session appareil)       │
│               │        ├── PostgREST + RLS               │
│               │        ├── Storage (buckets privés)      │
│               │        └── Edge Functions (privilégié)   │
└───────────────┴─────────────────────────────────────────┘
```

**Nouvelles dépendances** : `@supabase/supabase-js`, `idb` (wrapper IndexedDB), `zod` (validation aux frontières Repository), `uuid` (ou `crypto.randomUUID`).

**Variables d'environnement**

Projet réel : **`sunu-couture-dev`** — `https://nffcdygtqzlivsresuuk.supabase.co` (`eu-west-1`, PG 17). **Clés API modernes** (décision D1).

| Variable | Portée | Rôle |
|---|---|---|
| `VITE_BACKEND` | front (**build**) | `local` (défaut) / `supabase` — sélection d'implémentation au build, **pas** un interrupteur runtime (correction D) |
| `VITE_SUPABASE_URL` | front (build) | `https://nffcdygtqzlivsresuuk.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | front (build) | clé **publishable** (`sb_publishable_…`) — **remplace** l'`anon key`. Ne plus utiliser `VITE_SUPABASE_ANON_KEY`. |
| *(serveur)* clé **secret** (`sb_secret_…`) | **Edge Functions uniquement** | remplace `service_role` — **jamais** dans le front, **jamais** affichée/transmise |
| *(serveur)* mot de passe PostgreSQL | `supabase link` (saisie locale) | **jamais** committé, **jamais** transmis |
| `PAYMENT_PROVIDER_SECRET` / `PAYMENT_WEBHOOK_SECRET` | Edge Functions (phase paiement auto) | jamais côté front |

> Règle : tout ce qui n'est pas `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` est **interdit** dans le bundle front. Revue automatique (grep `sb_secret`, `service_role`, `SECRET`, `PASSWORD`) dans la CI avant déploiement. La **ref projet** n'est pas secrète (elle est dans l'URL) mais n'est pas committée dans `config.toml` pour éviter tout `db push` accidentel.

---

## 3. Schéma PostgreSQL cible — correspondance avec l'existant

> Aligné sur `03-DECISIONS.md` (D2, D3, D6, D7, D8, D9, correction G).

| Table cible | Origine dans l'app actuelle | Transformation |
|---|---|---|
| `workshops` | *n'existe pas* | 1 atelier créé par pilote pendant l'onboarding ; `owner_id` = compte du tailleur ; `is_demo boolean default false` (correction G) |
| `workshop_members` | *n'existe pas* | 1 ligne `owner` par pilote ; RLS **non récursive** (correction E) |
| `carnets` | `Fiche.carnetNumero` (nombre) | 1 ligne par `carnetNumero` distinct ; `number` = ce nombre ; `status = 'active'` pour le plus grand, `'archived'` sinon ; **`next_number`** = `MAX(numero du carnet) + 1` au moment de l'import, jamais réutilisé (D9) |
| `clients` | `Client` | `name` → **`display_name` (obligatoire, verbatim)** + `first_name`/`last_name`/`nickname` facultatifs (D2) ; `name` d'origine → `metadata.legacy_name` ; `phone` → **`phone_e164`** (E.164) + `phone_display` + `metadata.legacy_phone` (D3) ; `photo` **ignorée** (jamais persistée) ; `colorSeed` → `metadata.color_seed` |
| `fiches` | `Fiche` | voir table détaillée §3.1 |
| `client_payments` | `Fiche.avance` (nombre) | si `avance > 0` : 1 versement `{ amount: avance, paid_at: null, recorded_at: fiche.createdAt, method: null, note: "Reprise du carnet — date du versement inconnue", metadata.source: "legacy_import" }` (D6) |
| `media_assets` | `Fiche.tissuPhotos[]`, `Fiche.signature`, `Fiche.voiceNote`, `Modele.photos[]`, `Modele.patronPhotos[]` | **import effectif en Phase 6B**, après les buckets privés (correction B). Chaque base64 → upload Storage → 1 ligne `media_assets` (`type` ∈ `fabric_photo`/`signature`/`voice_note`/`model_photo`) ; durée/dimensions/codec/checksum → `metadata jsonb` (D7) |
| `subscriptions` | `entitlements.ts` (stub) | **aucune souscription ni offre active créée en Phase 2** — les offres, limites et tarifs (dont `plan_code = 'decouverte'` / 20 fiches) restent **expérimentaux** ; migration + activation reportées à la **Phase 14**, après validation métier (corr. I) |
| `subscription_transactions` | *n'existe pas* | vide au départ |
| `sync_conflicts` | *n'existe pas* | vide au départ ; matérialise un conflit de synchro **sans** créer de fiche visible/numérotée (correction F) |
| *(catalogue)* `modeles` + `modele_medias` | `Modele` | table équivalente scoping `workshop_id` (non détaillée dans le cahier des charges mais nécessaire) |

### 3.1 `fiches` — correspondance champ à champ

| Colonne cible | Source | Note |
|---|---|---|
| `id` | *nouveau `uuid`* | map `legacyId (f.id)` → `uuid` mémorisée pour l'idempotence |
| `workshop_id` | atelier du pilote | |
| `carnet_id` | `carnets` créé pour `f.carnetNumero` | |
| `client_id` | map depuis `f.clientId` (uuid) ou `null` | |
| `number` | `f.numero` | contrainte unique `(carnet_id, number)` |
| `page_number` / `slot_number` | dérivés de `number` | `page = ceil(number/4)`, `slot = ((number-1) % 4) + 1` |
| `state` | enum **`active/cancelled/archived`** ; `'active'` à l'import (pas de `'draft'` serveur — corr. L) | brouillons = purement locaux |
| `measurements` (jsonb) | `f.champs` | garde `{ [key]: { valeur, historique } }` tel quel |
| `garment` / `description` / `fabric_notes` | `f.garment` / `f.description` / `f.champs.tissusDeposes.valeur` | |
| `quantity` | *nouveau* | défaut `1` |
| `status` | `f.status` mappé | enum `received/sewing/ready/delivered` : `recu→received`, `couture→sewing`, `pret→ready`, `livre→delivered` (D8) ; libellés écran restent FR |
| `due_date` | `f.dueDate` | peut être `null` |
| `total_price` | `f.price` | entier FCFA |
| `settled_at` | `f.soldeLe` | |
| *(signature)* | `f.signature` → `media_assets` `type='signature'` (**Phase 6B**), 1 max/fiche — **plus de colonne `signature_path`** (corr. N) | absente si pas de signature |
| `version` | `1` | optimistic lock |
| `created_at` / `updated_at` | `f.createdAt` / `now()` | |
| `deleted_at` | `null` | |
| *(non repris)* `f.late` | — | **dérivé à l'affichage**, plus jamais stocké (D8) |
| *(non repris)* `f.fabricColor` | → `metadata.fabric_color` | spécificité Tayoo à préserver |
| `f.nom/prenom/telephone` | → stratégie hybride (D4) : créer/retrouver un client léger si exploitable, sinon `client_id = null` ; **jamais** de client `"Sans nom"` | identité d'origine dans `metadata.legacy_identity` |
| `f.voiceNote` | → `media_assets(type='voice_note')`, `metadata.duration_seconds` (D7) | import en Phase 6B |

---

## 4. Découpage en phases

Chaque phase suit le même gabarit : **Objectif · Changements · Migrations SQL · Env · Tests · Déploiement · Rollback**.
L'ordre reprend celui du cahier des charges (§ « Ordre d'implémentation »).

---

### Phase 1 — Audit & plan de migration ✅ *(validée le 2026-08-29)*
- **Livrables** : `01-AUDIT.md`, `02-PLAN-MIGRATION.md`, `03-DECISIONS.md`.
- **Aucune modification de code applicatif** (`src/` intact).
- **Rollback** : sans objet.

---

### Phase 2 — Schéma Supabase & migrations SQL — **statut : « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev »**
- **Objectif** : le schéma cible existe **en local**, versionné au **format horodaté**
  officiel de `supabase migration new`. Les 9 migrations initiales ont été
  **rédigées manuellement** dans ce format, puis **validées par la CLI réelle**
  (`supabase db reset --local` sur l'image Supabase PostgreSQL 17) — elles ne seront
  **ni recréées ni renommées** ; toute **future** migration devra être créée via
  `npx supabase migration new <nom>`. RLS **activée** ; **`GRANT` explicites +
  politiques** = Phase 4 (voir plus bas). `sunu-couture-dev` est l'environnement
  **dev/staging** : après validation locale complète, `supabase link` puis
  `supabase db push --dry-run` sont autorisés ; un `db push` **réel** exige la revue
  du dry-run et une confirmation explicite du porteur ; **aucune donnée réelle de
  tailleur** avant la Phase 4 ; le futur **projet de production** n'est créé/modifié
  qu'après les politiques RLS, les tests d'isolation et le pilote technique (D1).
- **Changements** :
  - `supabase/config.toml` versionné (`project_id = "sunu-couture-dev"`, `[db].major_version = 17`, `[db.seed].enabled = false`, `[api].schemas = ["public","graphql_public"]`) ; ref distante **non commitée**.
  - `supabase/migrations/` — **9 fichiers** **horodatés**, ordre logique :
    | Fichier | Contenu |
    |---|---|
    | `…120000_enable_extensions_and_enums.sql` | `pgcrypto` **dans le schéma `extensions`** (jamais `public` — advisor `extension_in_public`), schéma privé **`app_hidden`** (aucun `ALTER DEFAULT PRIVILEGES` — no-op PG retiré, corr. P), **10 enums** (`fiche_state` sans `'draft'` — corr. L) |
    | `…120100_create_core_schema.sql` | `workshops` (`owner_id` canonique), `workshop_members`, `carnets` (`next_number`), `clients` (E.164), `fiches` (**pas de `signature_path`** — corr. N), `client_payments` (**`amount > 0`**), `media_assets` (**1 signature/fiche**), `modeles` (**`nom` non vide** — corr. M), `modele_medias`. **`UNIQUE (workshop_id, id)`** sur carnets/clients/fiches/modeles + **FK composites `(workshop_id, <parent_id>)`** sur fiches/client_payments/media_assets/modele_medias (corr. K), avec **index de préfixe exact** ; `fiches → carnets` en **`ON DELETE NO ACTION`** (carnet non supprimable si fiches ; `DELETE workshops` propre) |
    | `…120200_create_subscription_schema.sql` | `subscription_plans`, `subscriptions`, `subscription_transactions`, `promo_codes` — **aucun seed** (corr. I) |
    | `…120300_create_sync_and_reminders.sql` | `sync_conflicts` (**FK composite** vers `fiches` — corr. K), `reminders` |
    | `…120400_create_functions_and_triggers.sql` | `app_hidden.*` (**6 fonctions** — `allocate_fiche_number` **supprimée**, passe statique) : `set_updated_at`, `sync_owner_membership` + `protect_owner_membership` (transfert de propriétaire + anti-divergence — corr. O), `current_workshop_ids` (UNION owner_id ∪ membres, `EXECUTE`→`authenticated`), **`create_fiche_from_draft(uuid, uuid, jsonb)`** (SEULE porte n° + fiche, `p_fiche` **sans `DEFAULT`**, règle métier anti-fiche-vide, `service_role` — corr. L), `provision_workshop` (`service_role` — corr. O) ; `COMMENT ON FUNCTION` = frontière `service_role` (corr. Q) ; triggers `updated_at` |
    | `…120500_create_derived_views.sql` | `fiche_balances`, `fiches_view` — **`WITH (security_invoker = on)`** |
    | `…120600_enable_row_level_security.sql` | `ENABLE ROW LEVEL SECURITY` sur **les 15 tables**, explicitement (pas via Dashboard). Sans politique ⇒ refus par défaut. |
    | `…120700_security_hardening.sql` | révoque écritures des rôles clients sur `subscription_*` / `promo_codes` ; blanket revoke `app_hidden` |
    | `…120800_secure_rls_auto_enable.sql` | **avertissement Supabase** : `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated` via `to_regprocedure()`/`to_regrole()` (compatible « absent ») ; **event trigger `ensure_rls` NON touché** ; `.down` = no-op (corr. H, passe statique) |
  - `supabase/migrations_down/` — 9 `*.down.sql` miroir (rollback manuel ; le CLI est forward-only ; `…120800.down` = no-op).
  - `supabase/seeds/draft_subscription_plans.sql` — brouillon `is_active = false`, **non câblé** dans `config.toml`.
  - `supabase/tests/10_schema_tests.sql` — **35 groupes** d'assertions ; `run.sh` / `run.ps1` ; `00_local_auth_shim.sql` (Postgres nu, **complément** — ne remplace pas `supabase db reset`).
- **Env** : `sunu-couture-dev` **déployé** (dev/staging) ; production toujours inexistante.
- **Validé local (2026-08-30, Supabase CLI 2.116.0, stack Docker locale réelle, image `supabase/postgres:17.6.1.165` = PostgreSQL 17.6)** : `supabase start` + `db reset --local` → 9/9 migrations rejouées depuis une base vide · `migration list --local` local==remote · `db lint --local` sans erreur · `db advisors --local` 0 WARN/0 ERROR (37 INFO attendus) · 35/35 tests SQL exécutés sur le `DB_URL` réel avec les rôles `anon`/`authenticated`/`service_role` et le vrai `auth.uid()` · `npm test` 19/19 · `tsc -b` OK.
- **Déployé et vérifié distant (2026-08-30)** : Dashboard vérifié (déploiement auto désactivé) → `supabase link --project-ref nffcdygtqzlivsresuuk` → `db push --dry-run` (revue) → **confirmation explicite du porteur** → `db push` réel → **9/9 migrations appliquées**, `migration list` local==remote, `db advisors --linked` 0 WARN/0 ERROR (37 INFO identiques). Vérifié en base (`db query --linked`, sans mot de passe) : 15 tables, RLS 15/15, 2 vues `security_invoker`, `app_hidden` 6 fonctions, `create_fiche_from_draft`/`provision_workshop` = `service_role` seul, `rls_auto_enable()` réel révoqué pour `anon`/`authenticated`, `ensure_rls` actif, 0 politique métier. **35/35 tests SQL rejoués contre le distant réel** (0 ligne résiduelle après coup) ; `npm test` 19/19, `tsc -b` OK. Test **T16 durci** (accepte aussi `insufficient_privilege`, cas du distant réel sans `GRANT` pour `authenticated`).
- **Statut : « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev ».** Prochaine étape : Phase 3 (authentification/ateliers), avec la Phase 4 (`GRANT` + politiques RLS) bloquante avant toute donnée réelle.
- **Tests (authoritatifs, exécutés)** : local — `supabase --version` → `supabase start` → `supabase db reset --local` → `supabase migration list --local` → `supabase db lint --local` → `supabase db advisors --local --type all` → `psql "$DB_URL" -f supabase/tests/10_schema_tests.sql` → `npm test` → `tsc -b`. Distant — `supabase link` → `supabase db push --dry-run` → `supabase db push` → `supabase migration list` → `supabase db advisors --linked --type all` → `supabase db query --linked` (structure/privilèges + `-f` pour les 35 tests) → `npm test` → `tsc -b`.
- **Déploiement** : **aucun**.
- **Rollback** : `supabase db reset` ; `supabase/migrations_down/*` en ordre inverse.

---

### Phase 3 — Authentification & ateliers
- **Objectif** : un pilote se connecte par **téléphone + OTP Supabase** (D5), un `workshop` + `workshop_member(owner)` est provisionné, la session persiste sur l'appareil ; PIN local = **verrou visuel** uniquement.
- **Changements** :
  - `src/lib/auth/` : **`AuthRepository`** (interface) + `SupabasePhoneOtpAuthRepository` ; une implémentation de repli `SupabaseMagicLinkAuthRepository` reste possible si le fournisseur SMS n'est pas prêt (D5).
  - Onboarding accompagné (numéro → OTP → création atelier). UI inclusive (icônes, audio, texte court).
  - PIN local → `IndexedDB` (hashé, **jamais** envoyé au serveur) ; verrouille l'app après inactivité. L'UI ne le présente **pas** comme une protection cryptographique des données.
  - Action MVP **« Déconnecter tous les appareils »** → révoque les **refresh tokens** ; message UI : « le jeton d'accès courant peut rester valide jusqu'à son expiration ». **Pas** de gestion appareil-par-appareil pour l'instant (D5).
  - Edge Function `provision-workshop` : appelle `app_hidden.provision_workshop()` (`service_role`).
  - **Frontière `service_role` — exigences BLOQUANTES (corr. Q)** : les Edge Functions appelant `app_hidden.provision_workshop` / `app_hidden.create_fiche_from_draft` **doivent** (1) dériver l'identité (`p_owner`, et l'utilisateur pour le contrôle) d'un **JWT vérifié**, jamais d'un paramètre de requête ; (2) pour `create_fiche_from_draft`, **vérifier l'appartenance + le rôle** de l'utilisateur à `p_workshop_id` **avant** l'appel ; (3) ne jamais accepter `p_owner` / `p_workshop_id` fournis librement par le client.
- **Migrations SQL** : aucune nouvelle table (schéma en place Phase 2) ; **aucun** trigger automatique sur `auth.users` — provisioning via Edge Function contrôlée.
- **Env** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` ; clé **secret** (`sb_secret_…`) sur l'Edge Function uniquement ; fournisseur SMS configuré côté Supabase.
- **Tests** : OTP valide → session ; session survit à un reload ; PIN erroné bloque l'écran (pas l'accès réseau) ; « Déconnecter tous les appareils » invalide les refresh tokens ; `provision-workshop` idempotente ; **un JWT d'un autre atelier ne peut pas déclencher `create_fiche_from_draft` sur `p_workshop_id`** (contrôle Edge Function).
- **Déploiement** : Edge Functions en local/`dev` seulement.
- **Rollback** : build `VITE_BACKEND=local` → app actuelle sans compte.

---

### Phase 4 — GRANT + RLS & tests d'isolation
- **Objectif** : aucune fuite inter-ateliers. **Bloquant avant toute donnée réelle.**
- **Pré-requis** : RLS est **déjà activée** (Phase 2, `…120600`), **sans** politique ni
  `GRANT` table sur les 15 tables métier — ni `anon` ni `authenticated` n'ont
  aujourd'hui de privilège SQL dessus.
- ⚠️ **`GRANT` et RLS sont deux couches distinctes.** PostgREST (la Data API
  Supabase) vérifie d'abord le **privilège SQL standard** (`GRANT SELECT/INSERT/…`)
  puis, seulement s'il est présent, évalue les **politiques RLS**. **Sans `GRANT`,
  une politique RLS ne suffit pas** à rendre une table accessible par la Data API —
  la requête échoue avant même que Postgres regarde les lignes. Cette phase doit
  donc livrer les deux couches **dans la même migration**, jamais l'une sans l'autre.
- **Changements** — nouvelle migration horodatée `…_grants_and_rls_policies.sql`,
  contenant :
  1. **`GRANT` explicites minimaux pour `authenticated`**, table par table et
     opération par opération (`SELECT`/`INSERT`/`UPDATE`/`DELETE` selon le besoin
     réel — pas de `GRANT ALL`), sur les 15 tables métier.
  2. **Aucun `GRANT` métier pour `anon`** : ni lecture ni écriture sur les tables
     applicatives (seul `public`/`graphql_public` reste exposé au niveau schéma,
     sans qu'aucun privilège de table ne soit accordé à `anon`).
  3. Les **politiques RLS** correspondant exactement à ces `GRANT` — **anti-récursion
     (correction E)** :
     - `workshop_members` : politiques basées sur **`user_id = auth.uid()`** (un
       membre voit/gère sa propre ligne ; l'`owner` gère les membres via
       `EXISTS (SELECT 1 FROM public.workshops w WHERE w.id = workshop_members.workshop_id AND w.owner_id = auth.uid())`
       — **jamais** en relisant `workshop_members`).
     - Autres tables : appartenance via **`app_hidden.current_workshop_ids()`**
       (créée en Phase 2 : `security definer`, `stable`, `search_path=''`,
       `EXECUTE`→`authenticated`) qui renvoie les `workshop_id` de `auth.uid()` sans
       réentrer dans la RLS.
     - **Toute politique `UPDATE`** déclare `USING` **et** `WITH CHECK` (interdit de
       déplacer une ligne vers un autre `workshop_id`).
  4. **Droits différenciés `owner` / `assistant`** (D10) : `assistant` reçoit les
     mêmes `GRANT`/politiques métier que `owner` **sauf** sur `subscriptions` /
     `subscription_transactions` / `promo_codes` (déjà sans écriture pour les rôles
     clients depuis Phase 2, `…120700`) et sur `workshop_members` (gestion des
     membres et suppression d'atelier réservées à `owner` — `GRANT`/politiques plus
     restrictifs pour `assistant` sur cette table).
  5. **`GRANT USAGE, SELECT` sur les séquences** utilisées par les colonnes qui en
     dépendent, si l'audit de cette phase en révèle (les tables actuelles utilisent
     `uuid`/`gen_random_uuid()` en clé primaire — aucune séquence connue à ce jour,
     à reconfirmer avant d'écrire la migration).
  6. Politiques Storage : chemin `workshops/{workshopId}/...` vérifié contre
     l'appartenance.
- **Migrations SQL** : `…_grants_and_rls_policies.sql` (+ `.down.sql` = `REVOKE …` /
  `DROP POLICY …`, jamais `DISABLE RLS` en prod).
- **Tests (obligatoires, cahier des charges § Tests de sécurité)** :
  - Créer ateliers **A** et **B**, 1 utilisateur chacun.
  - A ne lit jamais B (SELECT → 0 ligne) ; A ne modifie jamais B (UPDATE/DELETE → 0 ligne affectée) ;
  - un `assistant` ne peut pas écrire dans `subscriptions` **ni** dans `workshop_members` (D10) ;
  - **non-récursion** : une requête simple sur `workshop_members` répond sous un seuil de temps et ne lève pas `infinite recursion detected in policy` ;
  - un membre **ne peut pas s'ajouter lui-même** à un autre atelier (INSERT `workshop_members` refusé) ;
  - une URL signée expire (test temporel) ;
  - `anon` → 0 ligne sur `fiches`, `clients`, `media_assets`.
  - **Frontière `service_role` (corr. Q)** : `create_fiche_from_draft` / `provision_workshop` refusent tout appel où l'identité n'est pas dérivée d'un JWT vérifié et où l'appartenance/rôle n'a pas été contrôlée en amont — **exigence bloquante**, testée au niveau Edge Function.
  - Suite automatisée `tests/rls/*.test.ts` (client `supabase-js` avec 2 JWT distincts) — **exécutée en CI, bloquante**.
- **Déploiement** : `sunu-couture-dev` (après validation finale de D1) puis `prod` seulement quand la suite RLS passe à 100 %.
- **Rollback** : `DROP POLICY` via le `.down.sql` (local uniquement — jamais désactiver RLS en prod).

---

### Phase 5 — Couche Repository (front)
- **Objectif** : les pages ne dépendent plus de `useStore` pour les données métier.
- **Changements** :
  - `src/repositories/` : interfaces `ClientRepository`, `FicheRepository`, `CarnetRepository`, `PaymentRepository`, `MediaRepository`, `SubscriptionRepository`.
  - `LocalStorageRepository` : **enveloppe l'actuel `store.ts`** (aucune régression, aucune perte de données).
  - Hooks : `useClients`, `useClient(id)`, `useFiches`, `useFiche(id)`, `usePayments(ficheId)`, `useCarnet()` — abonnés au Repository, pas au store.
  - Validation `zod` aux frontières (entrées/sorties du Repository).
  - `store.ts` conserve **uniquement** : brouillons, état UI, file de synchro observable.
- **Migrations SQL** : aucune.
- **Tests** : les 19 tests existants restent verts ; nouveaux tests de contrat sur `LocalStorageRepository` (mêmes assertions que `store.test.ts` mais via l'interface) ; tests de rendu (`jsdom` à configurer dans `vite.config.ts`) : « ouvrir la fiche n'appelle aucune écriture ».
- **Déploiement** : transparent (comportement identique).
- **Rollback** : revert du commit ; `store.ts` intact dessous.

---

### Phase 6A — Export, analyse & prévisualisation (assistant, sans écriture cloud)
> Détail complet en **§5** ci-dessous. Scindée de la 6B pour respecter l'ordre des médias (correction B).
- **Objectif** : sécuriser les données actuelles et montrer au pilote ce qui sera importé — **aucune écriture Supabase**.
- **Changements** :
  - **Sauvegarde (correction A)** : (1) **fichier JSON téléchargé** `tayoo-sauvegarde-<date>.json` → (2) copie IndexedDB **si `navigator.storage.estimate()` le permet** → (3) **vérification** (relecture + comparaison des compteurs). Chaque écriture de secours **gère et affiche** `QuotaExceededError`. **Pas** de duplication systématique dans une autre clé `localStorage`.
  - Lecture via `migrateLegacyState()` (9 tests) → `{ clients, fiches, modeles }` normalisés.
  - Différenciation **démo / réel** (correction G) : la seed intacte est marquée `demo` ; l'utilisateur voit 2 listes avec bascule par ligne.
  - Prévisualisation chiffrée (« X clients, Y fiches, Z modèles importés ; N éléments démo ignorés »).
- **Rollback** : sans objet (lecture seule + fichier exporté).

### Phase 6B — Import effectif dans le cloud
- **Pré-requis** : Phases 7 (clients/fiches cloud) **et 8** (buckets privés + politiques Storage + tests) **terminées** — **aucun média importé avant** (correction B).
- **Objectif** : importer les vraies données une seule fois, sans perte, de façon idempotente.
- **Changements** :
  - Confirmation explicite (pas de coche pré-cochée).
  - `migrationMap` (`legacyId → uuid`) en IndexedDB → idempotence (upsert sur `metadata.legacy_id`).
  - Ordre : `clients` → `carnets` (+ `next_number` calculé) → `fiches` → `client_payments` (depuis `avance`, `paid_at = null`, D6) → **upload médias → `media_assets`** (Storage privé).
  - Vérification post-import : recomptage serveur vs prévisualisation, rapport affiché.
  - `localStorage["tayoo-migration-v1"] = { done, at, counts }`.
- **Migrations SQL** : aucune.
- **Tests (cahier des charges)** : aucun doublon si l'import est rejoué ; compteurs identiques ; une fiche sans identité exploitable reste `client_id = null`.
- **Rollback** : `sunu-couture` **conservé** (jamais supprimé sans confirmation « J'ai vérifié mes fiches ») + fichier `tayoo-sauvegarde-*.json` ; build `VITE_BACKEND=local` restaure l'app d'avant.

---

### Phase 7 — Clients & fiches dans le cloud
- **Objectif** : `SupabaseRepository` actif pour clients + fiches, avec cache IndexedDB en lecture.
- **Changements** : `SupabaseClientRepository`, `SupabaseFicheRepository` ; lecture = cache IndexedDB d'abord puis rafraîchissement réseau ; écriture = passe par le `SyncEngine` (Phase 12) ou, transitoirement, écriture directe si en ligne.
- **Migrations SQL** : aucune (schéma déjà là).
- **Tests** : CRUD client/fiche en ligne ; relecture après reload = données du cloud ; parité des 19 tests métier.
- **Rollback** : flag `local`.

---

### Phase 8 — Stockage privé des médias
- **Objectif** : photos / vocaux / signatures dans des buckets **privés**, plus de base64 en base. **Pré-requis de la Phase 6B.**
- **Changements** :
  - Buckets `media` privés ; chemin `workshops/{workshopId}/fiches/{ficheId}/{fileId}`.
  - `SupabaseMediaRepository` : upload → `media_assets` (durée/dimensions/codec/checksum dans `metadata jsonb`, D7) ; lecture via **URL signée courte durée** (60–300 s), cache mémoire.
  - `MediaRepository` local : garde les blobs en IndexedDB pour l'offline (Phase 12).
  - Compression avant upload (réutilise `image.ts`) ; détection du type MIME audio réellement supporté.
- **Migrations SQL** : aucune (colonne `metadata jsonb` de `media_assets` créée en Phase 2).
- **Tests** : upload/lecture d'une photo ; URL signée expirée → 403 ; politique Storage : atelier A ne lit pas le chemin de B ; suppression logique (`deleted_at`) n'efface pas le fichier immédiatement.
- **Rollback** : build `local` (médias base64 conservés dans le backup Phase 6A).

---

### Phase 9 — Correction de « Nouvelle fiche » (brouillon)
- **Objectif** : ouvrir le formulaire ne crée **aucune** donnée persistante.
- **Changements** :
  - `FicheNew` ne fait **plus** `addFiche()` en `useEffect`. Il ouvre un **brouillon** (`draftStore` en mémoire + sauvegarde IndexedDB locale, pas de `number` réservé).
  - Le `number` (et l'écriture cloud) n'est attribué qu'à la **1re information utile** ou sur **bouton « Enregistrer la fiche »**. La **règle métier serveur** (corr. L) refuse une fiche qui n'a **ni client valide, ni** information significative (`garment` / `description` / `measurements` / `legacy_identity`, chaînes blanches exclues).
  - Brouillon abandonné → n'apparaît pas dans le carnet, non compté comme commande, ne consomme pas de numéro.
  - Même traitement pour `ModeleNew`.
  - `CarnetList.handleAdd` et `Fab` d'`OrdersList` → naviguent vers le brouillon, n'appellent plus `addFiche()`.
  - **Promotion** du brouillon → **1 seul appel** à **`app_hidden.create_fiche_from_draft(p_workshop_id, p_client_id, p_fiche jsonb)`** (les 3 args requis, pas de `DEFAULT`), via Edge Function `service_role` (frontière corr. Q), ou un wrapper `public` `SECURITY INVOKER` vérifiant l'appartenance. **`allocate_fiche_number()` n'existe plus** (porte unique — corr. L).
- **Migrations SQL** : aucune — `create_fiche_from_draft()` créée en Phase 2 (`…120400`). `fiche_state` n'a **pas** de valeur `'draft'` (corr. L) : les brouillons sont purement locaux (IndexedDB / état d'UI) et n'existent en base qu'une fois promus `'active'`.
- **Tests (cahier des charges)** : « fiche vide non créée » ; ouvrir puis quitter → 0 fiche ; saisir 1 mesure → 1 fiche `active` avec `number` attribué ; numérotation 1→120 inchangée.
- **Rollback** : revert ; l'ancien `FicheNew` est trivial à restaurer.

---

### Phase 10 — Commande intégrée à la fiche + parcours unifié
- **Objectif** : une seule action `Nouvelle fiche` → `Client déjà connu` / `Nouveau client` ; la commande (vêtement, quantité, tissu, modèle, statut, retrait, prix) vit **dans** la fiche ; « Commandes » = vue filtrée.
- **Changements** :
  - Rebrancher **`ClientPickerSheet`** (déjà codé, aujourd'hui mort) dans le parcours brouillon.
  - Client existant : recherche nom/téléphone, dernières fiches, **proposition de reprendre les dernières mesures avec confirmation avant copie**.
  - Nouveau client : nom/surnom + téléphone facultatif ; **anti-doublon** : si `phone_normalized` existe déjà → proposer le client existant (Edge Function ou requête indexée).
  - Création client + fiche dans une **transaction** (Edge Function `create-fiche-with-client` ou RPC transactionnelle).
  - Champs commande ajoutés à `FicheDetail` (quantité, modèle sélectionné, statut, retrait) — sections courtes.
  - Nettoyage : supprimer `OrdersEmptyState`/`OrderToFicheRedirect` devenus inutiles, retirer les composants morts non réutilisés.
- **Migrations SQL** : `quantity` (défaut 1) déjà prévu ; RPC `create_fiche_with_client`.
- **Tests** : « client existant réutilisé » ; doublon téléphone → propose l'existant ; « ancienne mesure non écrasée » (copie = nouvelles valeurs, `historique` intact) ; cliquer une commande ouvre toujours sa fiche.
- **Rollback** : revert ; le parcours texte libre actuel reste fonctionnel.

---

### Phase 11 — Paiements du client au tailleur
- **Objectif** : remplacer `avance` (1 nombre) par un **historique de versements**.
- **Changements** :
  - `PaymentRepository` : `list(ficheId)`, `add({amount, paidAt, method?, note?})`, `remove(id)` (logique).
  - `FicheDetail` : `AvanceChampCell` → liste de versements + bouton « Ajouter un versement » ; `reste = total_price − Σ amount` (jamais stocké).
  - Garde-fous : montant `≥ 0` (UI + `check` SQL) ; versement > reste → **message clair** (« Ce paiement dépasse le reste de X F ») sans modification silencieuse.
  - Montants = **entiers FCFA**.
  - Message type : « Le paiement de 5 000 F a été ajouté. Il reste 10 000 F. »
- **Migrations SQL** : `client_payments` déjà en place (Phase 2) ; vue `fiche_balances` (`total_price`, `total_paid`, `reste`).
- **Tests (cahier des charges)** : plusieurs versements ; reste nul ; paiement supérieur au prix (signalé, non tronqué) ; montant négatif rejeté.
- **Rollback** : revert ; `avance` reste calculable = `Σ` versements (rétro-compat via la vue).

---

### Phase 12 — IndexedDB & moteur de synchronisation
- **Objectif** : usage temporaire **sans connexion**, puis synchro unique au retour du réseau, sans doublon.
- **Changements** :
  - IndexedDB (`idb`) : stores `cache` (fiches/clients synchronisés), `drafts`, `pendingMedia`, `opQueue`, `syncState`.
  - Chaque opération = `{ id: uuid (idempotent), type, payload, baseVersion, createdAt, status }`.
  - `SyncEngine` : rejoue la file en ligne, `UPDATE … WHERE id = $1 AND version = $base` ; 0 ligne → conflit enregistré dans **`sync_conflicts`** (`fiche_id`, `local_version`, `remote_version`, `conflicting_fields`, `detected_at`, `resolution_state`). La résolution **modifie la fiche d'origine**, **sans** créer de fiche visible/numérotée (correction F).
  - États affichés (exactement le vocabulaire du cahier des charges) : `Enregistré sur ce téléphone` · `Synchronisation…` · `Sauvegardé` · `Connexion nécessaire` · `Échec — réessayer`.
  - **Ne jamais** afficher « sauvegardé » quand la donnée n'est que locale.
  - **Service worker (correction C)** : gère **app shell + fichiers statiques + page de secours hors ligne** uniquement. **Aucun cache Workbox** sur les requêtes Supabase **authentifiées**. Les données métier privées sont mises en cache **uniquement dans IndexedDB**, **partitionnées par `user_id` + `workshop_id`**. Au **logout** ou **changement d'atelier** → **purge / isolation stricte** du cache IndexedDB correspondant.
- **Migrations SQL** : `sync_conflicts` (créée en Phase 2, `…120300_create_sync_and_reminders.sql`) ; colonnes `version` déjà là.
- **Tests (cahier des charges)** : création hors ligne → fermeture/réouverture → retour réseau → **une seule** synchro, **aucun doublon** ; photo/vocal en attente puis envoyés ; conflit entre deux téléphones → ligne `sync_conflicts`, fiche d'origine résolue, **numéro inchangé** ; logout → cache IndexedDB de l'atelier purgé.
- **Rollback** : build `local` ; la file IndexedDB est vidée proprement (`syncState.reset()`).

---

### Phase 13 — UX inclusive & aide vocale
- **Objectif** : interface universelle, aide progressive, sans dark patterns.
- **Changements** :
  - Icône « écouter » à côté des actions importantes ; **contenus wolof enregistrés/validés par un locuteur** (pas de synthèse auto publiée).
  - Accueil priorisé : **retraits du jour · retards · tenues prêtes · restes à encaisser · bouton Nouvelle fiche** ; chaque rappel ouvre la fiche.
  - Rappels configurables (type, heure, on/off, silencieux/sonore) — pas de série quotidienne, pas de culpabilisation.
  - Messages concrets (« La photo sera envoyée quand Internet reviendra. », « Cette fiche sera déplacée dans les archives. »).
  - Suppression **logique** + bouton **« Annuler »** (remplace la suppression dure) ; `deleted_at` / `state='archived'` — un numéro archivé n'est jamais libéré (D9).
  - Vérifs : 360 px, zoom 200 %, contraste WCAG, cibles ≥ 44 px, jamais la couleur seule.
- **Migrations SQL** : aucune (`reminders` créée en Phase 2, `…120300_create_sync_and_reminders.sql`) ; préférences non sensibles (thème, langue, aide vue) restent en `localStorage`.
- **Tests** : tests de rendu accessibilité (rôle/label) ; « Annuler » restaure une fiche archivée ; snapshot 360 px.
- **Rollback** : revert par écran (chaque changement est isolé).

---

### Phase 14 — Abonnement configurable
- **Objectif** : offres pilotées par la base, jamais en dur.
- **Changements** :
  - `subscription_plans` (code, libellé, prix, période, `trial_fiche_limit`) lus via `SubscriptionRepository`.
  - `entitlements.ts` : `peutCreerNouvelleFiche()` interroge l'abonnement (fiches `active` < limite, ou plan payant actif, ou période de grâce).
  - Alerte à **15 fiches**, compteur de fiches restantes, prix expliqué, **pas de blocage surprise**.
  - Après expiration : consultation + export + récupération maintenus ; **7 jours de grâce** ; blocage **uniquement** des nouvelles fiches / fonctions payantes ; **jamais** de suppression de données.
  - Codes promo / tarif Fondateur.
- **Migrations SQL** : nouvelle migration horodatée qui **réintroduit les offres validées** (`INSERT INTO subscription_plans …`, corr. I) + éventuel ajustement de colonnes ; `subscription_plans` / `promo_codes` (tables) créées en Phase 2 (`…120200_create_subscription_schema.sql`).
- **Tests** : 20 fiches gratuites → 21e bloquée avec message ; alerte à 15 ; expiration → lecture/export OK, création KO ; code promo applique le tarif Fondateur.
- **Rollback** : `peutCreerNouvelleFiche()` → `true` (comportement pilote actuel).

---

### Phase 15 — Paiement manuel (pilote)
- **Objectif** : l'administrateur valide un paiement, la période s'active côté serveur, la validation est journalisée.
- **Changements** :
  - Edge Function `activate-subscription` (`service_role`) : écrit `subscription_transactions` (`provider='manual'`, `idempotency_key`), met à jour `subscriptions.current_period_*`, journalise `validated_by`.
  - Petit écran admin (hors app tailleur) ou script CLI.
  - Abstraction `PaymentProvider` posée (interface), implémentation `ManualPaymentProvider` seulement.
- **Migrations SQL** : `subscription_transactions` déjà là ; `check(idempotency_key unique)`.
- **Tests** : double appel avec même `idempotency_key` → une seule transaction ; un `assistant` ne peut pas activer ; période correctement bornée.
- **Rollback** : désactiver l'Edge Function ; les abonnements restent en l'état.

---

### Phase 16 — Tests complets
- Métier, sécurité/RLS, hors-ligne, UX terrain (cf. cahier des charges § Tests obligatoires) réunis en suites CI. **Aucune phase déclarée terminée sans sa suite verte.**

---

### Phase 17 — Pilote terrain
- Déploiement `prod`, comptes créés en accompagnement, import assisté, collecte des tâches réalisées sans aide.

---

### Phase 18 — Paiement automatisé
- **Seulement après validation commerciale.** Implémentations `PaymentProvider` (Wave / PayDunya / PayTech), webhooks signés côté serveur, idempotence, réconciliation. Jamais de PIN/OTP mobile money stocké.

---

## 5. Assistant de migration des données `sunu-couture` (Phases 6A / 6B, détail)

### 5.1 Étapes (conformes au cahier des charges § « Migration des données actuelles »)

**Phase 6A — sans écriture cloud :**

1. **Sauvegarde de secours (correction A)** — au tout premier écran, avant toute lecture/écriture :
   1. **Fichier JSON téléchargé** `tayoo-sauvegarde-<date>.json` = copie brute de `localStorage["sunu-couture"]` + clés annexes.
   2. **Puis seulement si `navigator.storage.estimate()` laisse de la marge** : copie dans **IndexedDB** (`store backups`). **Aucune** duplication systématique dans une autre clé `localStorage` (le quota peut déjà être saturé).
   3. **Vérification** : relire le fichier exporté et comparer les compteurs (clients / fiches / modèles).
   - Toute écriture de secours est encadrée par un `try/catch` qui **affiche explicitement** `QuotaExceededError` (« Mémoire du téléphone pleine — libérez de l'espace, puis réessayez »).
2. **Lecture** via `migrateLegacyState()` (9 tests) → `{ clients, fiches }` + `modeles`.
3. **Différenciation démo / réel (correction G)** :
   - **démo** = seed **intacte** : `id ∈ {c1..c5}` / `{f1..f6}` avec champs identiques à `seedClients` / `seedFiches`.
   - donnée **différente** de la seed, ou `id` généré par `uid()` (horodaté) → **réelle**.
   - 2 listes (Réel / Démo), **bascule par ligne**. Les éléments `demo` ne sont **jamais** importés dans l'atelier réel.
4. **Prévisualisation chiffrée** : « X clients, Y fiches, Z modèles seront importés. N éléments de démonstration seront ignorés. »

**Phase 6B — écriture cloud (après Phases 7 et 8) :**

5. **Confirmation explicite** (bouton « Importer maintenant », pas de coche pré-cochée).
6. **Import avec UUID** :
   - Provisioning atelier (Phase 3) si pas déjà fait.
   - Création `carnets` (1 par `carnetNumero`) + `next_number = MAX(numero du carnet) + 1` (D9).
   - `migrationMap` (`legacyId → uuid`) en IndexedDB → **idempotence** (upsert sur `metadata.legacy_id`).
   - Ordre : `clients` (D2/D3) → `carnets` → `fiches` (D4/D8) → `client_payments` (depuis `avance`, `paid_at = null`, D6) → **upload médias → `media_assets`** (Storage privé, D7).
   - Reprise là où la `migrationMap` s'est arrêtée en cas d'échec réseau.
7. **Vérification** : recompter côté serveur (`count(clients)`, `count(fiches)`, `Σ client_payments`) vs prévisualisation → rapport.
8. **Marquer la migration terminée** : `localStorage["tayoo-migration-v1"] = { done: true, at, counts }`. La bascule cloud effective se fait par un **build `VITE_BACKEND=supabase`** (correction D) — pas d'interrupteur runtime.
9. **Suppression de l'ancienne sauvegarde locale** : **seulement après** confirmation explicite (« J'ai vérifié mes fiches, supprimer la copie sur ce téléphone »). Par défaut : **conservée** en lecture seule.

### 5.2 `name` → `display_name` / `first_name` / `last_name` / `nickname` — voir **D2**
- `Client.name` **toujours** recopié intégralement dans `display_name` ; original dans `metadata.legacy_name`.
- `first_name` / `last_name` alimentés **uniquement** depuis un couple `fiche.prenom` + `fiche.nom` distinct et non vide d'une fiche liée.
- Contradiction entre fiches → `display_name` seul, détaillés vides, ou confirmation dans l'assistant.
- **Aucune** heuristique « premier mot = prénom ». Champ d'interface : **« Nom ou surnom »**.

### 5.3 Fiches sans `clientId` — voir **D4** (stratégie hybride retenue)
- Identité exploitable (nom / surnom / téléphone) → créer/retrouver un client léger ; dedup **d'abord** par `phone_e164`, puis par nom normalisé **avec confirmation** si plusieurs candidats.
- Sinon `client_id = null` (autorisé, fiche rattachable plus tard). **Jamais** de client `"Sans nom"`.
- Identité d'origine conservée dans `fiches.metadata.legacy_identity`.

---

## 6. Stratégie de conflit hors-ligne (rappel Phase 12 — correction F)

- Chaque `fiche` porte `version` (int) + `updated_at`.
- Écriture : `UPDATE … WHERE id = $1 AND version = $baseVersion` → si 0 ligne, conflit.
- Conflit **non ambigu** (champs disjoints) : merge automatique, `version++`.
- Conflit **ambigu** (même champ, deux valeurs) : écrire une ligne **`sync_conflicts`** (`fiche_id`, `local_version`, `remote_version`, `conflicting_fields`, `detected_at`, `resolution_state`) et **demander à l'utilisateur** de choisir. La résolution **met à jour la fiche d'origine**, **sans** créer de fiche visible ni consommer de numéro. Jamais d'écrasement silencieux.

---

## 7. Ordre de bascule recommandé (résumé)

```
2 Schéma (local) ─► 3 Auth/Ateliers ─► 4 RLS + tests A/B ─► 5 Repository (local) ─►
6A Export + prévisualisation ─► 7 Clients/Fiches cloud ─► 8 Médias privés ─►
6B Import effectif ─► 9 Brouillon « Nouvelle fiche » ─► 10 Parcours unifié + commande ─►
11 Versements ─► 12 IndexedDB + Sync ─► 13 UX inclusive ─►
14 Abonnement ─► 15 Paiement manuel ─► 16 Tests ─► 17 Pilote ─► 18 Paiement auto
```

- **6A** peut être fait tôt (dès que l'assistant existe) ; **6B** attend **7 + 8** (correction B).
- Phases **9, 11, 13** peuvent démarrer en parallèle dès que **5** (Repository) est en place, même avant que le cloud soit branché (elles marchent sur `LocalStorageRepository`).
- Phase **4** est un **jalon bloquant** : aucune donnée réelle en `prod` avant que la suite d'isolation A/B soit verte.

---

## 8. Retour en arrière — vue d'ensemble

| Niveau | Mécanisme |
|---|---|
| Fonctionnalité front | **rollback du déploiement Vercel** vers le build précédent (correction D — `VITE_BACKEND` est un choix de build, pas un interrupteur runtime que l'utilisateur active) |
| Cloud temporairement indisponible | **mode hors ligne IndexedDB** (file de synchro en attente), pas de retour au store legacy |
| Données du pilote | fichier `tayoo-sauvegarde-*.json` + copie IndexedDB (si créée en 6A) + `sunu-couture` d'origine conservé en **lecture seule** jusqu'à validation explicite |
| Schéma SQL | migrations **horodatées** + `migrations_down/*.down.sql` ; `supabase db reset` en local ; en `prod` (plus tard), migrations additives uniquement, jamais de `DROP` destructif sans `pg_dump` |
| RLS | `*.down.sql` (`DROP POLICY`) en local seulement ; en `prod`, RLS ne se désactive jamais |
| Déploiement auto | aucun `.github/` workflow ; `supabase/` non committé pendant la correction ; avant tout commit de `supabase/`, vérifier côté Dashboard que le déploiement auto des migrations est désactivé (corr. J) |
| Edge Functions | désactivation immédiate (message « fonction indisponible » côté front) |
| Import | idempotent via `migrationMap` — un import interrompu se reprend, ne duplique pas |

---

## 9. Décisions — **validées** (voir `03-DECISIONS.md`)

| # | Sujet | Décision |
|---|---|---|
| D1 | Projet Supabase | **`sunu-couture-dev`** (ref `nffcdygtqzlivsresuuk`, `eu-west-1`, PG 17) = environnement **dev/staging**, schéma **déployé** (2026-08-30, après dry-run revu + confirmation explicite du porteur) ; aucune donnée réelle de tailleur avant la Phase 4 ; **CLI local** ; migrations horodatées ; clés API modernes (`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`) ; projet de **production** créé/modifié seulement après RLS + tests d'isolation + pilote technique ; ne jamais toucher le projet `E-commerce` |
| D2 | Identité client | `display_name` obligatoire (verbatim) + `first_name`/`last_name`/`nickname` facultatifs ; `metadata.legacy_name` ; **pas d'heuristique** |
| D3 | Téléphone | **E.164** canonique (`phone_e164`) + `phone_display` + `metadata.legacy_phone` ; index unique **partiel** `(workshop_id, phone_e164)` |
| D4 | Fiches sans client | **hybride** : client léger si exploitable (dedup `phone_e164` puis nom + confirmation), sinon `client_id = null` ; jamais `"Sans nom"` |
| D5 | Auth pilote | **téléphone + OTP Supabase** ; PIN local = verrou visuel ; action « Déconnecter tous les appareils » ; gestion par appareil reportée |
| D6 | Import avance | 1 `client_payments` `amount = avance` (**`CHECK (amount > 0)`**), **`paid_at = null`**, `recorded_at = createdAt`, note « date inconnue », `metadata.source = legacy_import` |
| D7 | Médias | `media_assets.metadata jsonb` (durée, dimensions, codec, checksum) ; colonnes dédiées `type/mime_type/size_bytes/storage_path` |
| D8 | Statuts | `recu→received`, `couture→sewing`, `pret→ready`, `livre→delivered` ; libellés FR ; **`late` non stocké** |
| D9 | Numérotation | `carnets.next_number`, allocation atomique `FOR UPDATE` **dans `create_fiche_from_draft` — SEULE porte** (`allocate_fiche_number` supprimée, passe statique) ; aucun numéro sans fiche ; numéro jamais réutilisé (archive/suppression logique incluses) |
| D10 | Rôles | `owner` / `assistant` ; l'assistant ne touche ni abonnement, ni transactions, ni rôles, ni membres |
| D11 | Hébergement | Vercel (front) + Edge Functions ; **import unique**, ancienne sauvegarde lecture seule, **pas de dual-write** |

Corrections intégrées : **A** (sauvegarde : fichier JSON d'abord, gestion quota) · **B** (médias importés en 6B, après les buckets) · **C** (pas de cache Workbox sur Supabase authentifié ; IndexedDB partitionné `user_id`+`workshop_id`, purge au logout) · **D** (`VITE_BACKEND` = build, rollback = Vercel) · **E** (RLS non récursive sur `workshop_members` ; UPDATE `USING`+`WITH CHECK`) · **F** (`sync_conflicts`, pas de fiche fantôme) · **G** (données démo marquées `demo`, atelier réel = carnet vide) · **H** (schéma reproductible : RLS activée en migration ; **`rls_auto_enable()` : EXECUTE révoqué via migration dédiée `…120800`, event trigger `ensure_rls` intact** ; fonctions dans `app_hidden` ; vues `security_invoker`) · **I** (seed abonnement retiré, brouillon non actif) · **J** (aucun déploiement auto pendant la correction) · **K** (isolation multi-atelier : FK composites `(workshop_id, id)`) · **L** (brouillon 100 % local, `fiche_state` sans `'draft'`, `create_fiche_from_draft()`) · **M** (`modeles.nom` non vide) · **N** (`signature_path` supprimée → `media_assets(type='signature')`) · **O** (`workshops.owner_id` canonique + déclencheurs anti-divergence, `current_workshop_ids()` = UNION ; **transfert de propriétaire** : rétrograder avant promouvoir + invariant « un seul owner » + `workshop_id`/`user_id` de la ligne owner non modifiables) · **P** (`ALTER DEFAULT PRIVILEGES` schema-scoped **retiré** ; enforcement per-fonction ; validation CLI 2.116.0 locale ET distante (`sunu-couture-dev`) OK ; Phase 2 = « clôturée — schéma déployé et vérifié sur sunu-couture-dev ») · **Q** (frontière `service_role` : `create_fiche_from_draft` / `provision_workshop` — identité dérivée d'un JWT vérifié, contrôle appartenance/rôle en amont ; exigence **bloquante** Phases 3–4). Passe statique aussi : `create_fiche_from_draft` **sans `DEFAULT`** + **règle métier anti-fiche-vide** ; **`allocate_fiche_number` supprimée** (porte unique) ; index de **préfixe exact** pour les FK composites ; `fiches → carnets` en **`ON DELETE NO ACTION`**.

*Fin du plan de migration mis à jour — Phase 1 close ; **Phase 2 = « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev »** (Supabase CLI 2.116.0 : validation locale complète sur la vraie stack Docker PG 17.6, puis déploiement réel sur `sunu-couture-dev` — dev/staging, pas la production — après dry-run revu et confirmation explicite du porteur : 9/9 migrations appliquées, `migration list` local==remote, `db advisors --linked` 0 WARN/0 ERROR, structure et privilèges vérifiés en base, 35/35 tests SQL rejoués contre le distant réel avec 0 ligne résiduelle, `npm test` 19/19, `tsc -b` OK). La Phase 3 (authentification/ateliers) peut démarrer ; la Phase 4 (`GRANT` + politiques RLS) et la frontière `service_role` (corr. Q) restent des exigences bloquantes avant toute donnée réelle.*
