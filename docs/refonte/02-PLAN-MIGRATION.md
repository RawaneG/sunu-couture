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
>
> **Gel du graphe cloud post-preflight Phase 7 (trois audits architecturaux,
> CAS C confirmé — 2026-09-05)** : avant tout code Phase 7, un preflight
> obligatoire (revue exhaustive de l'architecture réellement mergée : Phase 4
> `GRANT`+RLS, `AuthProvider`/`RepositoryProvider`, contrats Repository
> synchrones, mapping `Fiche`↔`public.fiches`, schéma réel `media_assets`/
> `modele_medias`, corps exact de `create_fiche_from_draft`) a révélé que la
> séquence **Phase 7 → Phase 8 → Phase 6B** telle que décrite ci-dessous ne
> peut PAS être exécutée sans soit violer la Phase 4 (GRANT/RLS déjà mergée),
> soit commencer silencieusement une autre phase, soit produire des données
> cloud fausses (solde à 0 F, catalogue invisible, numérotation legacy
> écrasée). **Le graphe d'exécution est donc désormais figé** comme suit —
> il remplace, partout dans ce document, toute mention contraire de
> « Phase 7 puis Phase 8 puis Phase 6B » :
>
> ```
> 7A → 9A → 7B → 8A → 8B → 11A → [Gate VITE_BACKEND=supabase] → 6B0 → 6B
> ```
>
> La **numérotation officielle des phases** (héritée du cahier des charges,
> §4 ci-dessous) ne change pas — Phase 6B reste « Phase 6B », Phase 9 reste
> « Phase 9 », etc. Ce qui change est (a) l'**ordre d'exécution réel**, déjà
> différent de la numérotation avant ce gel (Phase 6B s'exécutait déjà avant
> Phase 9 — voir §7), et (b) l'introduction de **sous-phases** (7A/7B, 8A/8B,
> 9A, 11A) et d'une **nouvelle phase 6B0** entre 11A et 6B. Détail complet :
> §4 (chaque phase), §7 (nouveau diagramme d'ordre), `03-DECISIONS.md`
> correction **R**. **Aucun code, aucune migration SQL, aucune Edge Function
> n'a été créé pour ce gel — uniquement une mise à jour documentaire.**

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
| `media_assets` | `Fiche.tissuPhotos[]`, `Fiche.signature`, `Fiche.voiceNote` | **FICHES UNIQUEMENT** — `media_assets.fiche_id` est `not null` avec FK composite vers `fiches` : aucun média de modèle ne peut y transiter (voir ligne `modele_medias` ci-dessous). **Import effectif en Phase 6B**, après la Phase 8A (buckets privés — correction B). Chaque base64 → upload Storage → 1 ligne `media_assets` (`type` ∈ `fabric_photo`/`signature`/`voice_note` — la valeur d'enum `model_photo` reste **inutilisée par ce chemin**, voir ligne `modele_medias`) ; durée/dimensions/codec/checksum → `metadata jsonb` (D7) |
| `subscriptions` | `entitlements.ts` (stub) | **aucune souscription ni offre active créée en Phase 2** — les offres, limites et tarifs (dont `plan_code = 'decouverte'` / 20 fiches) restent **expérimentaux** ; migration + activation reportées à la **Phase 14**, après validation métier (corr. I) |
| `subscription_transactions` | *n'existe pas* | vide au départ |
| `sync_conflicts` | *n'existe pas* | vide au départ ; matérialise un conflit de synchro **sans** créer de fiche visible/numérotée (correction F) |
| `modeles` | `Modele.nom` | table équivalente scoping `workshop_id`, `nom` non vide (corr. M) ; **import effectif en Phase 6B** (aucune exclusion — corr. R) ; `metadata jsonb` (avec `legacy_id`) **ajoutée par une migration dédiée de la Phase 6B0**, la colonne n'existe pas dans le schéma actuel |
| *(catalogue)* `modele_medias` | `Modele.photos[]`, `Modele.patronPhotos[]` | **MODÈLES UNIQUEMENT** — table dédiée déjà créée en Phase 2 (`kind` ∈ `photo`/`patron`, `position`, `storage_path` unique), indépendante de `media_assets`. Import effectif en Phase 6B, après la Phase 8B (buckets privés catalogue — corr. R) |

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

### Phase 6B0 — Infrastructure d'import legacy sécurisé *(nouvelle phase — corr. R)*
> Exécutée après **11A** et avant **6B** (voir §7, nouveau diagramme). Distincte et
> indispensable : `app_hidden.create_fiche_from_draft()` alloue **elle-même** le
> numéro suivant depuis `carnets.next_number` — elle n'accepte aucun numéro en
> paramètre. Rejouer un carnet legacy `1, 2, 5` via 3 appels produirait `1, 2, 3`
> (numéros perdus), pas `1, 2, 5` : **cette fonction est donc interdite pour
> l'import**, elle reste exclusivement la porte de la création métier normale
> (Phase 9A/9). L'import a besoin d'un **chemin serveur entièrement distinct**.
- **Objectif** : fournir un chemin d'import serveur qui (a) préserve les numéros
  legacy exacts, (b) garantit une idempotence au niveau base de données (pas
  seulement dans `migrationMap`/IndexedDB), (c) ne réutilise ni n'affaiblit la
  porte de création métier normale.
- **Pourquoi côté serveur uniquement** : sur le projet réel, `service_role` n'a
  **aucun privilège de table direct généralisé** — seul un `GRANT SELECT` ciblé
  sur `public.workshops` existe (`…212932_grant_provision_workshop_service_role_select.sql`),
  ajouté au cas par cas pour `provision_workshop_api`. Une Edge Function d'import
  ne peut donc **pas** faire de simples `INSERT` bruts avec la clé secrète : il
  faut de **nouvelles fonctions `app_hidden.import_legacy_*` `SECURITY DEFINER`**
  (même schéma que `create_fiche_from_draft`/`provision_workshop`), avec
  `EXECUTE` accordé **au seul `service_role`**, appelées par une Edge Function
  dédiée qui vérifie le JWT et l'appartenance/rôle **avant** d'appeler
  `service_role` (même frontière — corr. Q — que `create-fiche-from-draft`, 9A).
- **Changements** :
  - Edge Function `import-legacy-data` (ou orchestration serveur équivalente) :
    1. vérifie le JWT, dérive l'utilisateur ;
    2. vérifie que l'utilisateur est `owner` de l'atelier cible (jamais un
       `workshop_id` accepté aveuglément depuis le client) ;
    3. appelle les fonctions `app_hidden.import_legacy_*` en `service_role` ;
    4. jamais l'inverse (aucun `INSERT` brut depuis l'Edge Function elle-même).
  - `app_hidden.import_legacy_carnet(p_workshop_id, p_number, p_next_number)` —
    crée le carnet avec le **`number` legacy exact** et `next_number = MAX(numero
    legacy de ce carnet) + 1` **en une seule fois** (pas incrémentalement comme
    `create_fiche_from_draft`). `ON CONFLICT (workshop_id, number) DO NOTHING` —
    la contrainte `unique(workshop_id, number)` déjà existante (Phase 2) est la
    clé d'idempotence naturelle, **aucune migration nécessaire pour les carnets**.
  - `app_hidden.import_legacy_fiche(...)` — insère la fiche avec le **`number`
    legacy exact** (pas d'allocation automatique), calcule `page_number`/
    `slot_number` à partir de ce numéro (même formule que `create_fiche_from_draft`),
    et est **idempotente par `(workshop_id, metadata->>'legacy_id')`** sous
    verrou advisory (même principe que `provision_workshop_api`) **et** une
    contrainte `UNIQUE` serveur (voir migration ci-dessous) — l'IndexedDB
    `migrationMap` n'est jamais la seule garantie.
  - `app_hidden.import_legacy_client(...)` / `app_hidden.import_legacy_modele(...)`
    — même principe, idempotents par `(workshop_id, metadata->>'legacy_id')`.
  - `app_hidden.import_legacy_payment(...)` — idempotent par construction : au
    plus un versement importé par fiche (D6), protégé par une contrainte
    `UNIQUE(fiche_id) WHERE metadata->>'source' = 'legacy_import'`.
  - **Médias — deux étapes distinctes, jamais confondues** : l'upload d'un
    fichier dans Storage **n'est pas** une écriture PostgreSQL, et
    `service_role` n'a par ailleurs aucun `INSERT` brut sur les tables
    métier (voir plus haut) — la ligne DB correspondante passe donc, comme
    tout le reste de 6B0, par une fonction `app_hidden` dédiée :
    ```
    médias fiche  : Edge Function → upload Storage (storage_path déterministe)
                    → app_hidden.import_legacy_media_asset(...) → public.media_assets
    médias modèle : Edge Function → upload Storage (storage_path déterministe)
                    → app_hidden.import_legacy_modele_media(...) → public.modele_medias
    ```
    - `app_hidden.import_legacy_media_asset(...)` / `app_hidden.import_legacy_modele_media(...)`
      — même schéma que les fonctions ci-dessus (`security definer`, `EXECUTE`
      → `service_role` seul, `search_path=''`) ; **non créées à ce jour**,
      contrat documenté par anticipation pour la future Phase 6B0. L'Edge
      Function `import-legacy-data` orchestre le fichier (upload Storage) et
      la transaction métier (appel de ces fonctions) — elle ne fait **jamais**
      d'`INSERT` brut `service_role` dans `public.media_assets` ni
      `public.modele_medias`.
    - Idempotence : le `storage_path` de l'upload doit être **déterministe**,
      dérivé d'un segment sûr et stable (identifiant legacy de l'entité + type
      de média + index ordinal dans le tableau — jamais une chaîne legacy
      brute non assainie, jamais un id aléatoire régénéré à chaque tentative).
      Un retry produit alors **exactement le même `storage_path`** — les
      contraintes `UNIQUE(storage_path)` déjà existantes (Phase 2) sont la
      garantie serveur : `import_legacy_media_asset`/`import_legacy_modele_media`
      doivent être écrites en conséquence (si le `storage_path` n'existe pas
      → créer la ligne ; s'il existe déjà pour cette donnée importée →
      retrouver/retourner la ligne existante ; jamais une seconde ligne avec
      un nouveau chemin lors d'un retry). Aucune migration supplémentaire
      requise pour les médias — signatures SQL détaillées non fixées ici, au-delà
      de ce contrat.
- **Migrations SQL nécessaires** (nouvelle migration horodatée `…_harden_legacy_import_idempotency.sql`,
  la seule migration de tout ce graphe cloud, justifiée par un manque réel du
  schéma actuel, pas créée par défaut) :
  - `public.modeles` : **ajouter `metadata jsonb not null default '{}'::jsonb`**
    (colonne absente aujourd'hui — vérifié dans `20260829120100_create_core_schema.sql`,
    la table `modeles` n'a que `id/workshop_id/nom/created_at/updated_at/deleted_at`).
  - Remplacer l'index simple `fiches_legacy_id_idx` par un index **`UNIQUE`
    partiel tenant-aware** : `unique (workshop_id, (metadata->>'legacy_id')) where metadata ? 'legacy_id'`
    (l'index actuel n'est **pas** `UNIQUE` — vérifié, il n'empêche aucun doublon).
  - Ajouter un index `UNIQUE` partiel équivalent sur `clients` (téléphone
    insuffisant seul comme clé d'idempotence — absent/malformé/plusieurs
    identités legacy possibles, D4) et sur `modeles` (le `nom` seul n'est pas
    fiable, deux modèles peuvent porter le même nom).
  - Ajouter `unique (fiche_id) where metadata->>'source' = 'legacy_import'` sur
    `client_payments` — défense en profondeur **obligatoire** (corr. R), pas
    optionnelle : protège un retry après crash, une reprise sur un second
    appareil, ou un appel concurrent.
  - `database.types.ts` régénéré à ce moment (nouvelle colonne `modeles.metadata`) ;
    `GRANT EXECUTE` de **toutes** les fonctions `app_hidden.import_legacy_*`
    (y compris `import_legacy_media_asset`/`import_legacy_modele_media`)
    réservé à `service_role` — même schéma que les fonctions existantes.
- **Principe d'idempotence, acté définitivement (corr. R)** : `migrationMap`
  (IndexedDB) est un **accélérateur et un état de reprise local** — jamais
  l'autorité. **Le serveur (contraintes `UNIQUE` + fonctions idempotentes sous
  verrou) est la seule autorité d'idempotence.** Effacer IndexedDB, changer de
  navigateur ou crasher entre l'`INSERT` serveur et l'écriture de `migrationMap`
  ne doit **jamais** produire de doublon.
- **Tests** : rejouer un import déjà réussi → 0 doublon sur `clients`/`carnets`/
  `fiches`/`client_payments`/`media_assets`/`modeles`/`modele_medias` ; simuler
  une suppression d'IndexedDB en cours d'import → reprise sans doublon (test qui
  exploite réellement les contraintes serveur, pas seulement `migrationMap`) ;
  appel concurrent (deux onglets) sur le même `legacy_id` → un seul gagne.
- **Rollback** : nouvelles fonctions `app_hidden.import_legacy_*` supprimables
  indépendamment (elles ne sont appelées par aucun autre chemin) ; `.down.sql`
  miroir pour la migration de durcissement, comme les migrations Phase 2.

---

### Phase 6B — Import effectif dans le cloud
- **Pré-requis (corr. R)** : Phases **7B** (création/lecture/update fiche cloud),
  **8A** (médias fiche), **8B** (catalogue cloud), **11A** (paiements cloud
  minimal) **et 6B0** (infrastructure d'import sécurisé) **terminées** — **aucun
  média importé avant 8A/8B**, **aucun paiement importé avant 11A** (sinon le
  solde affiché serait faussé à l'écran, voir Phase 11A), **aucune fiche/aucun
  modèle importés avant 6B0** (sinon les numéros legacy seraient réattribués et
  perdus, voir Phase 6B0).
- **Objectif** : importer **toutes** les données métier réelles prévisualisées
  en Phase 6A une seule fois, sans perte, de façon idempotente — **y compris le
  catalogue de modèles** : la prévisualisation Phase 6A promet explicitement
  « X clients, Y fiches, **Z modèles** importés », cette promesse doit être
  honorée intégralement, pas partiellement. Seuls les éléments classés `demo`
  en Phase 6A restent exclus (correction G — jamais mélangés aux vraies données).
- **Changements** :
  - Confirmation explicite (pas de coche pré-cochée).
  - `migrationMap` (`legacyId → uuid`) en IndexedDB → **accélérateur de reprise
    côté client** ; l'idempotence réelle est garantie côté serveur par les
    fonctions et contraintes de la **Phase 6B0**, pas par cette map seule
    (corr. R — voir principe d'idempotence, Phase 6B0).
  - Ordre : `clients` → `carnets` (+ `next_number` calculé) → `fiches` →
    `client_payments` (depuis `avance`, `paid_at = null`, D6) → **médias fiches
    → `media_assets`** (Storage privé, chemin déterministe) → **`modeles`** →
    **médias modèles/patrons → `modele_medias`** (Storage privé, chemin
    déterministe, `kind` ∈ `photo`/`patron`).
  - **Toutes les écritures dans les tables métier `public.*` de l'import**
    passent par les fonctions `app_hidden.import_legacy_*` de la Phase 6B0 —
    **jamais** `app_hidden.create_fiche_from_draft()` (voir Phase 6B0 pour la
    raison : perte des numéros legacy). **Précision médias (corr. R)** : un
    upload Storage n'est pas une écriture PostgreSQL — les blobs sont
    uploadés par l'Edge Function dans Storage privé avec des `storage_path`
    déterministes ; la ligne DB correspondante est ensuite créée ou
    retrouvée via `app_hidden.import_legacy_media_asset` (fiches) ou
    `app_hidden.import_legacy_modele_media` (modèles) — jamais un `INSERT`
    brut `service_role`.
  - Vérification post-import : recomptage serveur vs prévisualisation (y
    compris `count(modeles)`), rapport affiché.
  - `localStorage["tayoo-migration-v1"] = { done, at, counts }`.
- **Migrations SQL** : aucune **dans cette phase** — le durcissement nécessaire
  (idempotence, colonne `modeles.metadata`) est livré en amont, en **Phase 6B0**.
- **Tests (cahier des charges)** : aucun doublon si l'import est rejoué (clients/
  carnets/fiches/paiements/médias/**modèles**) ; compteurs identiques ; une
  fiche sans identité exploitable reste `client_id = null` ; les numéros de
  carnet/fiche legacy (y compris les trous, ex. `1, 2, 5`) sont préservés
  exactement, `next_number` correctement positionné après le plus grand numéro
  importé.
- **Rollback** : `sunu-couture` **conservé** (jamais supprimé sans confirmation « J'ai vérifié mes fiches ») + fichier `tayoo-sauvegarde-*.json` ; build `VITE_BACKEND=local` restaure l'app d'avant.

---

### Phase 7A — Fondations cloud clients & fiches (lecture/update, sans création)
> S'exécute **avant** 9A/7B (voir §7). Atteint « cloud infrastructure implemented »
> **sans** atteindre « cloud backend activated » (corr. R) — ces deux états sont
> délibérément distincts : 7A ne rend jamais l'app utilisable de bout en bout
> avec `VITE_BACKEND=supabase`, ce n'est pas son rôle.
- **Objectif** : construire les fondations cloud (mappers, cache, contrats async,
  ordre des providers) sans création de fiche cloud et sans activation globale
  du backend.
- **Changements** :
  - `SupabaseClientRepository` — `list`/`get`/`add`/`remove`/`removeMany` réels
    (Phase 4 accorde déjà `SELECT`/`INSERT`/`UPDATE` sur `clients` à `authenticated`).
  - `SupabaseFicheRepository` — **lecture et mise à jour uniquement** (`list`/
    `get`/`setInfo`/`setChamp`/`setStatus`/`remove` sur les colonnes que la
    Phase 4 autorise réellement en `UPDATE` : `status`, `measurements`,
    `garment`, `description`, `fabric_notes`, `quantity`, `due_date`,
    `total_price`, `settled_at`, `metadata`, `deleted_at`). **`add()` n'est pas
    implémentée en 7A** — voir Phase 7B.
  - `SupabaseCarnetRepository` — **lecture seule** (`carnets.number`/`status`/
    `next_number`, `GRANT SELECT` déjà accordé). Nécessaire dès 7A : aucune vue
    SQL (`fiches_view`) ne joint `carnets.number` à `fiches.carnet_id` — sans ce
    Repository de lecture, `Fiche.carnetNumero` ne peut pas être reconstitué
    côté client. Aucune migration SQL requise (lecture pure, GRANT existant).
  - Mappers DB ↔ domaine (`Client`/`Fiche`) + validation Zod aux frontières
    réseau (étend `src/repositories/schemas.ts`) — une row cloud incompatible
    produit une erreur contrôlée, jamais une coercition silencieuse.
  - Cache IndexedDB (lecture) : hydrater → rendre le snapshot → notifier →
    rafraîchir réseau → remplacer si changement réel. Namespace explicite par
    `workshopId`. Une erreur réseau conserve le cache existant, ne le supprime
    jamais.
  - `useFiche`/`useClient` exposent un état `loading` **distinct** de
    « introuvable » — sans quoi une hydratation asynchrone provoquerait une
    redirection intempestive (`FicheDetail` fait aujourd'hui `if (!fiche) return
    <Navigate to="/" />` de façon synchrone).
  - Réordonnancement : `RepositoryProvider` passe **sous** `AuthProvider` (il est
    aujourd'hui au-dessus, `App.tsx`) ; le conteneur de repositories est
    reconstruit quand `workshop.id` change (connexion, changement d'atelier,
    déconnexion) — jamais un `workshopId` choisi arbitrairement.
  - **Contrats Repository asynchrones** — migration `string/void → Promise<string>/Promise<void>`
    pour **toutes** les interfaces Repository, faite **une seule fois, ici**
    (pas répétée à chaque sous-phase suivante). Consumers impactés, vérifiés
    dans le code réel : `FicheNew.tsx`, `CarnetList.tsx` (`handleAdd`,
    `handleBulkDelete`), `ClientDetail.tsx` (`handleNewFiche`, `handleDelete`),
    `ClientNew.tsx` (`handleSubmit`), `FicheDetail.tsx` (tous les `onChange`
    d'écriture, `handleDelete`, `handleAddPhoto`, `handlePickModele`),
    `ModeleNew.tsx`/`ModeleDetail.tsx` (branchés plus tard, 8B). Les
    `Local*Repository` enveloppent leurs retours actuels dans `Promise.resolve(...)`
    — comportement métier inchangé. **Aucun write réseau fire-and-forget.**
- **Migrations SQL** : aucune.
- **Tests** : contrat clients (list/get/add/soft-remove) ; mapper fiche (lecture,
  tous statuts, `is_late` dérivé, jointure `carnetNumero` via `SupabaseCarnetRepository`) ;
  cache/hydratation (`fake-indexeddb`, aucune fausse redirection) ; parité des
  tests métier existants.
- **Interdit en 7A** : `SupabaseFicheRepository.add()` ; `VITE_BACKEND=supabase`
  global ; toute donnée de Phase 6B ; médias ; paiements cloud ; catalogue cloud.
- **Rollback** : flag `local`.

---

### Phase 9A — Brouillon fiche & porte de création sécurisée *(sous-ensemble minimal de Phase 9 — corr. R)*
> S'exécute **avant** 7B, **après** 7A (voir §7) — malgré la numérotation
> héritée du cahier des charges qui place « Phase 9 » après « Phase 8 ». Comme
> pour l'ordre 6B/9 déjà présent avant ce gel (§7), la numérotation officielle
> des phases ne reflète pas l'ordre d'exécution.
- **Objectif** : permettre une création de fiche cloud fiable, sans fiche vide
  au tap et sans affaiblir la Phase 4 (aucun `GRANT INSERT` sur `fiches`).
  Strictement limité à ce qui débloque la création — **ne couvre pas** le reste
  de la Phase 9 (voir Phase 9 ci-dessous), ni `ClientPickerSheet`, ni la reprise
  de mesures, ni l'anti-doublon téléphone, ni la Phase 10.
- **Changements** :
  - `FicheNew.tsx`, `CarnetList.tsx` (`handleAdd`), `ClientDetail.tsx`
    (`handleNewFiche`) n'appellent **plus** `ficheRepository.add()` de façon
    synchrone et immédiate (comportement actuel vérifié dans le code : les
    trois créent une fiche vide au montage/au tap). Le brouillon reste **100 %
    local** (IndexedDB / état d'UI), ne possède **aucun numéro**, ne crée
    **aucun carnet**, tant qu'il n'est pas promu.
  - Promotion = information significative saisie **ou** validation explicite.
  - **Frontière serveur de création (choix architectural définitif — corr. R)** :
    **Edge Function dédiée `create-fiche-from-draft`** — pas un wrapper SQL
    `public` comme porte principale (un wrapper `SECURITY INVOKER` ne peut par
    construction pas vérifier lui-même la provenance du JWT, comme le
    reconnaît déjà le commentaire de tête de `provision_workshop_api`). Elle :
    1. vérifie le JWT ;
    2. dérive l'identité (`auth.uid()`) depuis ce JWT, jamais un paramètre de
       requête ;
    3. vérifie l'appartenance/le rôle de cet utilisateur à `p_workshop_id`
       **avant** tout appel `service_role` (frontière corr. Q, exigence
       bloquante) ;
    4. n'accepte jamais un `workshop_id` fourni librement par le client sans
       cette vérification ;
    5. appelle `app_hidden.create_fiche_from_draft(...)` en `service_role`
       **uniquement après** ces contrôles.
  - `app_hidden.create_fiche_from_draft()` (créée Phase 2) reste inchangée et
    reste **exclusivement** la porte de la **création métier normale** — elle
    ne sera **jamais** utilisée pour l'import legacy (Phase 6B0/6B, raison
    détaillée dans la section 6B0).
- **Migrations SQL** : aucune — `create_fiche_from_draft()` créée en Phase 2
  (`…120400`). `fiche_state` n'a **pas** de valeur `'draft'` (corr. L) : les
  brouillons sont purement locaux et n'existent en base qu'une fois promus
  `'active'`.
- **Tests** : « ouvrir puis abandonner le brouillon → 0 fiche, 0 carnet, 0
  numéro consommé » ; « brouillon significatif validé → exactement 1 fiche,
  numéro serveur attribué » ; l'Edge Function refuse un appel sans JWT valide
  ou sans appartenance vérifiée.
- **Rollback** : revert ; l'ancien `FicheNew` est trivial à restaurer.

---

### Phase 7B — Création métier fiche cloud
> S'exécute après 9A (voir §7).
- **Objectif** : `SupabaseFicheRepository.add()` branché sur la porte 9A —
  la création cloud normale devient possible.
- **Changements** : `SupabaseFicheRepository.add()` appelle l'Edge Function
  `create-fiche-from-draft` (9A) et attend sa réponse (`Promise`, contrat async
  déjà migré en 7A) avant de considérer la fiche créée.
- **Migrations SQL** : aucune.
- **Tests** : CRUD fiche en ligne complet ; relecture après reload = données du
  cloud ; parité des tests métier existants ; gate détaillé en 9A.
- **Interdit en 7B** : `VITE_BACKEND=supabase` global (attend 8A+8B+11A, voir
  §7/Gate) ; toute donnée de Phase 6B.
- **Rollback** : flag `local`.

---

### Phase 8A — Médias fiche *(anciennement « Phase 8 » — renommée, corr. R)*
- **Objectif** : photos tissu / vocaux / signatures dans des buckets **privés**,
  plus de base64 en base. Couvre **exclusivement** `Fiche.tissuPhotos`,
  `Fiche.signature`, `Fiche.voiceNote` — **pas** le catalogue de modèles (voir
  Phase 8B).
- **Changements** :
  - Buckets `media` privés ; chemin `workshops/{workshopId}/fiches/{ficheId}/{fileId}`.
  - `SupabaseMediaRepository` (fiches) : upload → `media_assets` (`type` ∈
    `fabric_photo`/`signature`/`voice_note` ; durée/dimensions/codec/checksum
    dans `metadata jsonb`, D7) ; lecture via **URL signée courte durée**
    (60–300 s), cache mémoire.
  - `MediaRepository` local : garde les blobs en IndexedDB pour l'offline (Phase 12).
  - Compression avant upload (réutilise `image.ts`) ; détection du type MIME audio réellement supporté.
- **Migrations SQL** : aucune (colonne `metadata jsonb` de `media_assets` créée en Phase 2).
- **Tests** : upload/lecture d'une photo ; URL signée expirée → 403 ; politique Storage : atelier A ne lit pas le chemin de B ; suppression logique (`deleted_at`) n'efface pas le fichier immédiatement.
- **Rollback** : build `local` (médias base64 conservés dans le backup Phase 6A).

---

### Phase 8B — Catalogue cloud *(nouvelle phase, désormais OBLIGATOIRE avant 6B — corr. R)*
> Rendue obligatoire par la décision de ne **pas** exclure les modèles de la
> Phase 6B (corr. R) — la prévisualisation Phase 6A promet explicitement des
> modèles importés, cette promesse doit être honorée.
- **Objectif** : rendre le catalogue de modèles réellement cloud-compatible.
- **Correction de mapping obligatoire (corr. R)** : `public.media_assets.fiche_id`
  est **`not null`** avec FK composite vers `fiches` — un média de modèle ne
  peut structurellement **pas** y être stocké (cela exigerait une fiche
  factice, interdit). Le mapping canonique, vérifié sur le schéma réel, est :
  ```
  médias Fiche   → media_assets   (type ∈ fabric_photo / voice_note / signature)
  médias Modèle  → modele_medias  (kind ∈ photo / patron)
  ```
  `modele_medias` existe déjà, complète et indépendante, depuis la Phase 2
  (`modele_id`, `kind`, `storage_path`, `mime_type`, `size_bytes`, `position`,
  `metadata`, `deleted_at`, `storage_path` déjà `UNIQUE`). La valeur d'enum
  `media_type = 'model_photo'` reste **inutilisée** par ce chemin — **aucune
  migration n'est créée uniquement pour la retirer ou l'utiliser**.
- **Changements** :
  - `SupabaseModeleRepository` : `list`/`get`/`add`/`setNom` (rename)/`remove`
    (soft-delete) sur `modeles`.
  - Médias modèle/patron : `SupabaseMediaRepository` (variante catalogue) sur
    `modele_medias`, `kind` ∈ `photo`/`patron`, `position` conservée.
  - Storage : bucket privé, chemin `workshops/{workshopId}/modeles/{modeleId}/{fileId}`.
  - **`ModeleNew.tsx`** : comportement actuel vérifié dans le code —
    `modeleRepository.add()` au montage, sans nom (même défaut que `FicheNew`
    avant 9A ; `modeles.nom` a la même contrainte stricte non-vide côté SQL,
    corr. M). Ce correctif appartient à **8B** (pas à un sous-lot Phase 9
    séparé — plus petit lot cohérent : même phase que le Repository qu'il
    active) : le brouillon de modèle reste local tant qu'un nom valide n'est
    pas fourni.
  - **GRANT** : l'état SQL actuel de `modele_medias` n'autorise que `SELECT,
    INSERT, DELETE` pour `authenticated` — **pas `UPDATE`** (vérifié,
    `20260830231638_grants_and_rls_policies.sql`, justifié à l'époque par
    « aucune nécessité démontrée »). Si 8B a réellement besoin de modifier
    `position`/`metadata` sans supprimer/recréer la ligne, une migration
    minimale `GRANT UPDATE (position, metadata) ON modele_medias TO authenticated`
    (+ politique RLS correspondante) sera introduite **à ce moment**, après
    tests RLS appropriés — **aucune migration créée dans ce gel documentaire**.
- **Migrations SQL** : aucune dans ce document (voir note GRANT ci-dessus, à
  trancher au moment de l'implémentation de 8B si le besoin se confirme).
- **Tests** : CRUD modèle en ligne ; upload/lecture photo et patron ; « ouvrir
  puis abandonner `ModeleNew` → 0 modèle créé » ; isolation atelier A/B.
- **Rollback** : build `local` (catalogue conservé dans le backup Phase 6A).

---

### Phase 9 — Correction complète de « Nouvelle fiche » (brouillon)
> Le sous-ensemble minimal nécessaire à la création cloud fiable est livré en
> **Phase 9A** (voir ci-dessus), exécutée avant 7B. Cette Phase 9 couvre le
> **reste**, après 6B, comme dans l'ordre originel du cahier des charges.
- **Objectif** : ouvrir le formulaire ne crée **aucune** donnée persistante —
  achever ce que 9A a commencé pour tous les cas restants (`ModeleNew` déjà
  traité en 8B).
- **Changements** :
  - Base déjà posée par 9A (`FicheNew`/`CarnetList.handleAdd`/`ClientDetail.handleNewFiche`
    ne créent plus de fiche vide, promotion via `create-fiche-from-draft`).
  - `Fab` d'`OrdersList` → navigue vers le brouillon, n'appelle plus `addFiche()`.
- **Migrations SQL** : aucune.
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

### Phase 11A — Paiements cloud minimal *(nouvelle sous-phase, obligatoire avant 6B — corr. R)*
> S'exécute après 8B, avant le Gate `VITE_BACKEND=supabase` et avant 6B0/6B
> (voir §7). Sans elle, un atelier réel migré en 6B afficherait un solde à
> 0 F pour chaque fiche payée : `PaymentRepository` local lit aujourd'hui
> `useStore.getState().fiches` (vérifié dans `LocalStoragePaymentRepository.ts`)
> — un identifiant de fiche cloud n'y sera jamais trouvé.
- **Objectif** : rendre les paiements cloud-cohérents, **sans** construire
  l'UX historique complète de la Phase 11 (liste détaillée, suppression/
  correction avancée, messages de dépassement dédiés — tout ça reste Phase 11).
- **Changements** :
  - `SupabasePaymentRepository.list(ficheId)` — lit `client_payments` réel.
  - `SupabasePaymentRepository.getBalance(ficheId)` — lit la vue `fiche_balances`
    (`total_price`, `total_paid`, `reste`, déjà créée et accordée en Phase 2/4) ;
    jamais recalculé côté client à partir de données locales.
  - **Écriture = action explicite, jamais liée à la frappe (corr. R)** :
    `AvanceChampCell`/`MontantChampCell` déclenchent aujourd'hui `onChange` à
    **chaque caractère tapé** (vérifié dans `FichePaiementCells.tsx`) — un
    branchement naïf sur un `add()` réseau créerait plusieurs versements pour
    un seul montant tapé (ex. « 5000 » → 4 lignes `client_payments`, interdit :
    `client_payments` est un historique **insert-only**, immuable, sans
    `UPDATE`/`DELETE` accordés). `AvanceChampCell` change de comportement
    (correctif ciblé de ce seul composant, pas une refonte) : état local non
    commité pendant la saisie, puis **un seul appel** sur validation explicite
    (bouton « Ajouter ») :
    ```ts
    add({ ficheId, amount, paidAt?, method?, note? }): Promise<Payment>
    ```
  - Affichage minimal acceptable avant la Phase 11 complète : `Total versé : X F`
    / `Reste : Y F` + action « Ajouter un versement ».
- **Migrations SQL** : aucune (`client_payments`, `fiche_balances`, `GRANT
  SELECT/INSERT` déjà en place depuis les Phases 2/4).
- **Tests** : `getBalance()` cloud ne renvoie jamais `0 F` par défaut pour une
  fiche réellement payée ; taper un montant multi-chiffres ne crée **jamais**
  plus d'une ligne `client_payments` ; l'ajout respecte `CHECK(amount > 0)`.
- **Rollback** : build `local`.

---

### Phase 11 — Paiements du client au tailleur (UX complète)
> Le sous-ensemble minimal nécessaire à des paiements cloud honnêtes est livré
> en **Phase 11A** (ci-dessus), exécutée avant le Gate backend et avant 6B.
> Cette Phase 11 couvre le **reste** : l'historique complet, après 6B, comme
> dans l'ordre originel du cahier des charges.
- **Objectif** : remplacer `avance` (1 nombre) par un **historique de versements** affiché en détail.
- **Changements** :
  - `PaymentRepository` : `list(ficheId)` (déjà cloud depuis 11A), `add({amount, paidAt, method?, note?})` (déjà cloud depuis 11A), `remove(id)` (logique — nouveau en Phase 11, `client_payments` n'accorde aujourd'hui aucun `DELETE`, une évolution de GRANT/politique sera nécessaire ici si la suppression logique est retenue).
  - `FicheDetail` : `AvanceChampCell` → liste de versements détaillée + bouton « Ajouter un versement » (le commit explicite existe déjà depuis 11A, cette phase ajoute l'affichage multi-lignes) ; `reste = total_price − Σ amount` (jamais stocké).
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

**Phase 6B — écriture cloud (après 7B, 8A, 8B, 11A, et l'infrastructure d'import 6B0 — corr. R) :**

5. **Confirmation explicite** (bouton « Importer maintenant », pas de coche pré-cochée).
6. **Import avec UUID**, exclusivement via les fonctions `app_hidden.import_legacy_*`
   de la Phase 6B0 (**jamais** `app_hidden.create_fiche_from_draft()` — elle
   alloue elle-même les numéros et écraserait les trous legacy, ex. `1,2,5` →
   `1,2,3`, voir Phase 6B0) :
   - Provisioning atelier (Phase 3) si pas déjà fait.
   - Création `carnets` (1 par `carnetNumero`) + `next_number = MAX(numero du carnet) + 1` (D9) — idempotent nativement via `unique(workshop_id, number)`, déjà en place.
   - `migrationMap` (`legacyId → uuid`) en IndexedDB → **accélérateur de reprise côté client** ; l'idempotence réelle est garantie **côté serveur** (contraintes `UNIQUE` + fonctions sous verrou, Phase 6B0) — une `migrationMap` effacée, une reprise sur un autre appareil, ou un crash entre l'`INSERT` serveur et l'écriture de la map ne doit **jamais** produire de doublon.
   - Ordre : `clients` (D2/D3) → `carnets` → `fiches` (D4/D8, numéros legacy exacts préservés) → `client_payments` (depuis `avance`, `paid_at = null`, D6) → **médias fiches → `media_assets`** (Storage privé, chemin déterministe, D7) → **`modeles`** → **médias modèles/patrons → `modele_medias`** (Storage privé, chemin déterministe, `kind` ∈ `photo`/`patron`).
   - Reprise là où la `migrationMap` s'est arrêtée en cas d'échec réseau ; **et** reprise correcte même sans `migrationMap` (autorité serveur, Phase 6B0).
7. **Vérification** : recompter côté serveur (`count(clients)`, `count(fiches)`, `count(modeles)`, `Σ client_payments`) vs prévisualisation → rapport.
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

## 7. Ordre de bascule recommandé (résumé) — **graphe figé, corr. R (2026-09-05)**

> Ce diagramme remplace définitivement l'ancien enchaînement
> « 7 → 8 → 6B → 9 ». Il est le fruit de trois audits architecturaux successifs
> (preflight Phase 7, CAS C confirmé) qui ont vérifié l'architecture **réellement
> mergée** (Phase 4 GRANT/RLS, corps exact de `create_fiche_from_draft`, schéma
> réel `media_assets`/`modele_medias`, composants React réels) plutôt que de
> supposer le plan initial correct. La numérotation officielle des phases ne
> change pas (héritée du cahier des charges) — seul l'**ordre d'exécution**
> change, comme c'était déjà le cas pour 6B/9 avant ce gel.

```
2 Schéma (local) ─► 3 Auth/Ateliers ─► 4 RLS + tests A/B ─► 5 Repository (local) ─►
6A Export + prévisualisation ─►
7A Fondations cloud (client/fiche read+update, carnet read, contrats async, cache) ─►
9A Brouillon fiche + Edge Function create-fiche-from-draft ─►
7B Création métier fiche cloud ─►
8A Médias fiche ─►
8B Catalogue cloud (modeles + modele_medias, ModeleNew sûr) ─►
11A Paiements cloud minimal (lecture réelle + ajout explicite, sans écriture par frappe) ─►
[ GATE VITE_BACKEND=supabase — smoke-test E2E sur atelier de test vide ] ─►
6B0 Infrastructure d'import legacy (idempotence serveur, numérotation préservée,
    fonctions app_hidden.import_legacy_* SECURITY DEFINER, migration de durcissement) ─►
6B Import réel COMPLET (clients, carnets, fiches, paiements, médias fiches,
   modeles, médias modèles/patrons — aucune exclusion) ─►
9 Reste de la correction « Nouvelle fiche » (au-delà de 9A) ─►
10 Parcours unifié + commande ─►
11 Versements (UX historique complète, au-delà de 11A) ─► 12 IndexedDB + Sync ─► 13 UX inclusive ─►
14 Abonnement ─► 15 Paiement manuel ─► 16 Tests ─► 17 Pilote ─► 18 Paiement auto
```

- **6A** peut être fait tôt (dès que l'assistant existe) ; **6B** attend
  désormais **7B + 8A + 8B + 11A + 6B0** (corr. R — pas seulement « 7 + 8 »).
- **`VITE_BACKEND=supabase` est activable sur un Preview dès que 7B + 8A + 8B +
  11A sont terminées** — à ce moment, tous les domaines consommés par les
  écrans existants (clients, fiches, carnets, médias fiche, paiements,
  modèles, médias modèle) sont cloud-cohérents simultanément. **6B n'est pas
  nécessaire pour ce gate** : le smoke-test s'exécute sur un atelier de test
  vide, créé via le flux normal (9A/7B), pas via un import.
- Phases **9 (reste), 11 (reste), 13** peuvent démarrer en parallèle dès que **5** (Repository) est en place pour tout ce qui ne dépend pas du cloud (elles marchent sur `LocalStorageRepository`).
- Phase **4** est un **jalon bloquant** : aucune donnée réelle en `prod` avant que la suite d'isolation A/B soit verte.
- **6B0** est un jalon bloquant distinct pour **6B seule** : `app_hidden.create_fiche_from_draft()` ne préserve pas les numéros legacy (elle alloue toujours `next_number`, jamais un numéro fourni) — l'import doit passer par un chemin serveur dédié, jamais par la porte de création métier normale.

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
| Import | idempotence garantie **côté serveur** (contraintes `UNIQUE` + fonctions `app_hidden.import_legacy_*` sous verrou, Phase 6B0) — `migrationMap` (IndexedDB) n'est qu'un accélérateur de reprise côté client, jamais l'autorité (corr. R) ; un import interrompu, une `migrationMap` effacée, ou une reprise sur un autre appareil ne duplique pas |

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
| D9 | Numérotation | `carnets.next_number`, allocation atomique `FOR UPDATE` **dans `create_fiche_from_draft` — SEULE porte de la CRÉATION MÉTIER NORMALE** (`allocate_fiche_number` supprimée, passe statique) ; aucun numéro sans fiche ; numéro jamais réutilisé (archive/suppression logique incluses). **`create_fiche_from_draft` n'alloue jamais de numéro explicite — elle est donc interdite pour l'import legacy** (Phase 6B0), qui préserve les numéros/trous via des fonctions `app_hidden.import_legacy_*` dédiées (corr. R) |
| D10 | Rôles | `owner` / `assistant` ; l'assistant ne touche ni abonnement, ni transactions, ni rôles, ni membres |
| D11 | Hébergement | Vercel (front) + Edge Functions ; **import unique**, ancienne sauvegarde lecture seule, **pas de dual-write** |

Corrections intégrées : **A** (sauvegarde : fichier JSON d'abord, gestion quota) · **B** (médias importés en 6B, après les buckets) · **C** (pas de cache Workbox sur Supabase authentifié ; IndexedDB partitionné `user_id`+`workshop_id`, purge au logout) · **D** (`VITE_BACKEND` = build, rollback = Vercel) · **E** (RLS non récursive sur `workshop_members` ; UPDATE `USING`+`WITH CHECK`) · **F** (`sync_conflicts`, pas de fiche fantôme) · **G** (données démo marquées `demo`, atelier réel = carnet vide) · **H** (schéma reproductible : RLS activée en migration ; **`rls_auto_enable()` : EXECUTE révoqué via migration dédiée `…120800`, event trigger `ensure_rls` intact** ; fonctions dans `app_hidden` ; vues `security_invoker`) · **I** (seed abonnement retiré, brouillon non actif) · **J** (aucun déploiement auto pendant la correction) · **K** (isolation multi-atelier : FK composites `(workshop_id, id)`) · **L** (brouillon 100 % local, `fiche_state` sans `'draft'`, `create_fiche_from_draft()`) · **M** (`modeles.nom` non vide) · **N** (`signature_path` supprimée → `media_assets(type='signature')`) · **O** (`workshops.owner_id` canonique + déclencheurs anti-divergence, `current_workshop_ids()` = UNION ; **transfert de propriétaire** : rétrograder avant promouvoir + invariant « un seul owner » + `workshop_id`/`user_id` de la ligne owner non modifiables) · **P** (`ALTER DEFAULT PRIVILEGES` schema-scoped **retiré** ; enforcement per-fonction ; validation CLI 2.116.0 locale ET distante (`sunu-couture-dev`) OK ; Phase 2 = « clôturée — schéma déployé et vérifié sur sunu-couture-dev ») · **Q** (frontière `service_role` : `create_fiche_from_draft` / `provision_workshop` — identité dérivée d'un JWT vérifié, contrôle appartenance/rôle en amont ; exigence **bloquante** Phases 3–4). Passe statique aussi : `create_fiche_from_draft` **sans `DEFAULT`** + **règle métier anti-fiche-vide** ; **`allocate_fiche_number` supprimée** (porte unique) ; index de **préfixe exact** pour les FK composites ; `fiches → carnets` en **`ON DELETE NO ACTION`**.

*Fin du plan de migration mis à jour — Phase 1 close ; **Phase 2 = « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev »** (Supabase CLI 2.116.0 : validation locale complète sur la vraie stack Docker PG 17.6, puis déploiement réel sur `sunu-couture-dev` — dev/staging, pas la production — après dry-run revu et confirmation explicite du porteur : 9/9 migrations appliquées, `migration list` local==remote, `db advisors --linked` 0 WARN/0 ERROR, structure et privilèges vérifiés en base, 35/35 tests SQL rejoués contre le distant réel avec 0 ligne résiduelle, `npm test` 19/19, `tsc -b` OK). La Phase 3 (authentification/ateliers) et la Phase 4 (`GRANT` + politiques RLS) sont mergées sur `develop`. **Statut Phase 7 : « preflight CAS C confirmé (trois audits) — graphe d'exécution cloud figé le 2026-09-05, voir §7 et `03-DECISIONS.md` corr. R » — aucune implémentation Phase 7A commencée.** L'ordre d'exécution officiel est désormais 7A → 9A → 7B → 8A → 8B → 11A → [Gate `VITE_BACKEND=supabase`] → 6B0 → 6B, qui remplace toute mention antérieure de « Phase 7 puis Phase 8 puis Phase 6B » dans ce document. La frontière `service_role` (corr. Q) reste une exigence bloquante pour toute nouvelle fonction serveur (9A, 6B0).*
