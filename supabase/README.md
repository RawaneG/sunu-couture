# `supabase/` — schéma & migrations Tayoo (Phase 2)

> **Statut Phase 2 : « Phase 2 clôturée — schéma déployé et vérifié sur
> sunu-couture-dev ».**
> Validée localement (Supabase CLI 2.116.0, stack Docker réelle, image
> `supabase/postgres:17.6.1.165`, PostgreSQL 17.6 : `db reset --local` 9/9,
> `db lint`/`db advisors` propres, 35/35 tests SQL, `npm test` 19/19, `tsc -b` OK),
> puis **déployée réellement** sur le projet distant **dev/staging**
> `sunu-couture-dev` (ref `nffcdygtqzlivsresuuk`, `eu-west-1`, PostgreSQL 17.6.1.166) :
> - `supabase link` + `db push --dry-run` (9/9 annoncées, 0 erreur) → **`db push`
>   réel exécuté sur confirmation explicite du porteur** → **9/9 migrations
>   appliquées**, `migration list` local==remote ;
> - `db advisors --linked` : **0 WARN/0 ERROR** (37 INFO : `rls_enabled_no_policy`
>   ×15, `unused_index` ×22) ;
> - vérifié en base : 15 tables, RLS active 15/15, 2 vues `security_invoker`,
>   `app_hidden` = exactement 6 fonctions, `create_fiche_from_draft`/
>   `provision_workshop` exécutables **uniquement** par `service_role`, le vrai
>   `public.rls_auto_enable()` de la plateforme distante a bien `EXECUTE` révoqué
>   pour `anon`/`authenticated`, `ensure_rls` actif, **0 politique RLS métier**
>   (attendu, Phase 4) ;
> - **35/35 tests SQL** rejoués contre la base distante réelle via
>   `supabase db query --linked -f` (session unique, `BEGIN…ROLLBACK`, mot de passe
>   jamais transmis — authentification par jeton CLI via l'API Management) ;
>   **0 ligne résiduelle** sur les 12 tables métier vérifiées après coup ;
> - `npm test` 19/19, `tsc -b` OK, exécutés après le déploiement.
> RLS **activée** ; **GRANT explicites + politiques** = Phase 4 (voir plus bas).
> Buckets = Phase 8. **Aucune donnée réelle de tailleur** sur `sunu-couture-dev`.
>
> `sunu-couture-dev` reste l'environnement **dev/staging** — pas la production. Le
> futur **projet de production** ne sera créé/modifié qu'**après** les politiques
> RLS (Phase 4), les tests d'isolation et le pilote technique — décision D1 de
> `docs/refonte/03-DECISIONS.md`.
>
> **Ne jamais toucher** au projet Supabase `E-commerce` du même compte.
>
> Les 9 migrations initiales ont été **rédigées manuellement** au format horodaté
> officiel (`supabase migration new`), validées par la CLI réelle (local puis
> distant) — elles ne seront **ni recréées ni renommées**. Toute **future**
> migration devra être créée avec `npx supabase migration new <nom>`.

## Contenu

```
supabase/
  config.toml                         # project_id local (PAS la ref distante) ; major_version = 17 ;
                                      #   [db.seed].enabled = false ; [api].schemas = public, graphql_public
  seeds/
    draft_subscription_plans.sql       # BROUILLON is_active=false — NON câblé dans config.toml
  migrations/                          # format horodaté, 9 fichiers
    20260829120000_enable_extensions_and_enums.sql     pgcrypto, schéma privé app_hidden, 10 enums
    20260829120100_create_core_schema.sql              15 tables ; UNIQUE(workshop_id,id) + FK composites
    20260829120200_create_subscription_schema.sql      tables abonnement, AUCUN seed
    20260829120300_create_sync_and_reminders.sql       sync_conflicts (FK composite), reminders
    20260829120400_create_functions_and_triggers.sql   app_hidden.* (6 fn) + triggers
    20260829120500_create_derived_views.sql            fiche_balances, fiches_view (security_invoker = on)
    20260829120600_enable_row_level_security.sql        ENABLE RLS sur les 15 tables (sans politique)
    20260829120700_security_hardening.sql               revoke écritures billing + blanket app_hidden
    20260829120800_secure_rls_auto_enable.sql           REVOKE EXECUTE public.rls_auto_enable() FROM PUBLIC/anon/authenticated ; event trigger ensure_rls NON touché
  migrations_down/                     # <ts>_<nom>.down.sql — rollback manuel (le CLI est forward-only)
  tests/
    00_local_auth_shim.sql             # auth.users + auth.uid() + rôles + default privileges — POSTGRES NU SEULEMENT
    10_schema_tests.sql                # 35 groupes d'assertions, tx + ROLLBACK
    run.sh / run.ps1                   # orchestrateurs base jetable (voie COMPLÉMENTAIRE)
```

## Isolation multi-atelier (corr. K)

Chaque relation enfant → parent scopée par atelier passe par une **FK composite**
`(workshop_id, <parent_id>) → parent (workshop_id, id)` — une référence
inter-ateliers est **impossible au niveau du moteur**, en plus de la RLS.

| Enfant → Parent | `ON DELETE` |
|---|---|
| `fiches (workshop_id, carnet_id) → carnets` | **`NO ACTION`** (passe statique, point 5) — carnet avec fiches non supprimable directement ; archivage OK ; `DELETE workshops` propre (vérifié en fin de commande) |
| `fiches (workshop_id, client_id) → clients` | `SET NULL (client_id)` (PG ≥ 15) |
| `client_payments (workshop_id, fiche_id) → fiches` | `CASCADE` |
| `media_assets (workshop_id, fiche_id) → fiches` | `CASCADE` |
| `modele_medias (workshop_id, modele_id) → modeles` | `CASCADE` |
| `sync_conflicts (workshop_id, fiche_id) → fiches` | `CASCADE` |

- Parents porteurs de `UNIQUE (workshop_id, id)` : `carnets`, `clients`, `fiches`, `modeles`.
- **Index de préfixe EXACT** (passe statique, point 4) pour chaque FK composite : `fiches(workshop_id, carnet_id)`, `fiches(workshop_id, client_id)`, `client_payments(workshop_id, fiche_id)`, `media_assets(workshop_id, fiche_id)`, `sync_conflicts(workshop_id, fiche_id)`, `modele_medias(workshop_id, modele_id)`. Test **T20** vérifie le *préfixe de colonnes dans l'ordre*, pas seulement « chaque colonne indexée ».
- Tests **T22a–f** (références inter-ateliers rejetées), **T34a/b/c** (protection des carnets).

## Fonctions `app_hidden` (schéma hors API — `[api].schemas` ne le liste pas) — **6 fonctions**

| Fonction | Sécurité | `search_path` | `EXECUTE` accordé à | Rôle |
|---|---|---|---|---|
| `set_updated_at()` | INVOKER (trigger) | `''` | — | déclencheur `updated_at` |
| `sync_owner_membership()` | **DEFINER** (trigger) | `''` | — | synchronise `workshop_members(owner)` avec `owner_id` ; **transfert** : rétrograde l'ancien **avant** de promouvoir + invariant « un seul owner » (corr. O) |
| `protect_owner_membership()` | **DEFINER** (trigger) | `''` | — | ligne du propriétaire officiel : ni suppression, ni rétrogradation, ni modif de `workshop_id`/`user_id` (corr. O) |
| `current_workshop_ids()` | **DEFINER**, `stable` | `''` | `authenticated` | UNION `owner_id = auth.uid()` ∪ membres — base RLS Phase 4 |
| `create_fiche_from_draft(uuid, uuid, jsonb)` | **DEFINER** | `''` | `service_role` | **SEULE porte** d'attribution de numéro + création de fiche ; `p_fiche` **sans `DEFAULT`** ; règle métier anti-fiche-vide ; `COMMENT ON FUNCTION` = frontière `service_role` (corr. L / Q) |
| `provision_workshop(uuid, text)` | **DEFINER** | `''` | `service_role` | création atelier + membre owner atomique ; `COMMENT ON FUNCTION` = frontière `service_role` (corr. O / Q) |

- **`allocate_fiche_number()` a été SUPPRIMÉE** (passe statique, point 3) — porte unique = `create_fiche_from_draft`. Test **T33**.
- `revoke all … from public` explicite **dans la même transaction** que chaque `create function` + blanket `revoke all on all functions in schema app_hidden from public` (`20260829120700`).
- **`anon` n'a PAS `USAGE`** sur `app_hidden` → ne peut appeler aucune fonction.
- **PAS d'`ALTER DEFAULT PRIVILEGES`** (passe statique, point 6) : la forme schema-scoped est un no-op PG sur les fonctions ; la forme globale n'est pas appliquée sans analyse. **Toute nouvelle fonction `app_hidden` doit porter son propre `revoke all … from public`.** Test **T30** : aucune fonction sensible exécutable par `PUBLIC` / `anon` / `authenticated`.

### Frontière `service_role` (corr. Q — exigences bloquantes Phases 3–4)

`create_fiche_from_draft` et `provision_workshop` sont exécutables **uniquement** par `service_role`. Les Edge Functions qui les appellent **doivent** :
1. dériver `p_owner` / l'identité de l'utilisateur d'un **JWT vérifié** — jamais d'un paramètre de requête ;
2. ne **jamais** accepter `p_workshop_id` fourni librement par le client ;
3. **vérifier l'appartenance + le rôle** de l'utilisateur à `p_workshop_id` **avant** l'appel.

## Brouillons & numérotation (corr. L)

- Le brouillon « Nouvelle fiche » est **100 % local** : aucune ligne distante, aucun numéro consommé à l'ouverture.
- `fiche_state` = `active | cancelled | archived` — **pas de `'draft'` serveur**.
- Promotion = **1 appel** à `app_hidden.create_fiche_from_draft(p_workshop_id uuid, p_client_id uuid, p_fiche jsonb)` (les **3 args requis**, pas de `DEFAULT`) :
  **règle métier anti-fiche-vide** (client valide OU `garment`/`description`/`measurements`/`legacy_identity` non blancs — sinon `check_violation` **avant tout verrou**) →
  advisory-lock atelier → verrou/création du carnet actif → allocation `next_number` →
  `page_number`/`slot_number` → insert fiche `'active'` → bascule `full` + carnet suivant.
- `{}` ou payload blanc → **refusé, aucun effet de bord** (T32a, 15 payloads NULL/vide/blanc/non-objet). Payload significatif → fiche atomique (T32b).
- Client d'un autre atelier → rejeté (`foreign_key_violation`), aucun effet de bord — tests **T25 / T25b**.

## Autres décisions matérialisées

| Sujet | Traduction | Test |
|---|---|---|
| D2 identité | `clients.display_name` NOT NULL + `first_name/last_name/nickname` NULLables | — |
| D3 téléphone | `phone_e164` regex E.164 + index unique partiel `(workshop_id, phone_e164) WHERE … AND deleted_at IS NULL` | T6b/c/d |
| D4 fiche sans client | `fiches.client_id` NULLable ; identité d'origine `metadata.legacy_identity` | T14 |
| D6 avance | `client_payments.amount` **`CHECK (amount > 0)`** ; `paid_at` NULLable | T1a/b, T2 |
| D8 statuts | enums `fiche_status` / `fiche_state` ; **`late` absent** → `fiches_view.is_late` dérivé | T13 |
| D9 numérotation | `carnets.next_number` alloué **uniquement** dans `create_fiche_from_draft` (`FOR UPDATE`), jamais `MAX()+1` ; `UNIQUE (carnet_id, number)` non partiel | T8, T9, T24, T33 |
| corr. M | `modeles.nom` `NOT NULL CHECK (length(btrim(nom)) between 1 and 200)` | T23a/b/c |
| corr. N | **plus de `fiches.signature_path`** ; signature = `media_assets(type='signature')`, `UNIQUE … where type='signature' and deleted_at is null` | — |
| corr. F | `sync_conflicts` + `one_open_per_fiche` | T12/T12b |
| corr. G | `workshops.is_demo` | — |
| corr. H | RLS activée en migration ; **`rls_auto_enable()` : EXECUTE révoqué (migration dédiée `…120800`, event trigger `ensure_rls` préservé)** ; vues `security_invoker` | T15, T16, T18, T19, **T35** |
| corr. I | `subscription_plans` créée **sans seed** | T11 |
| passe statique | transfert de propriétaire sûr | T31, T31b/c/d |
| passe statique | règle métier anti-fiche-vide (logique NULL sûre) | T32a, T32b |
| passe statique | porte unique (allocate_fiche_number supprimée) | T33 |
| passe statique | protection carnets (`ON DELETE NO ACTION`) | T34a/b/c |
| Perf. Advisor | les FK de `public` couvertes par un index au **préfixe exact** | T20 |

## Tester le schéma

La CLI Supabase est une **dépendance de dev exacte** (`supabase@2.116.0` dans
`package.json`). **Docker Desktop est disponible** sur la machine hôte → la stack
locale complète tourne réellement sur l'**image Supabase PostgreSQL 17**.

### Voie AUTORITATIVE — stack locale Docker (utilisée pour la validation courante)

```bash
npx supabase start                     # pull des images officielles, applique les 9 migrations
npx supabase db reset --local          # rejoue migrations/ depuis une base vide, image PG 17
npx supabase migration list --local    # local == remote (supabase_migrations.schema_migrations)
npx supabase db lint --local
npx supabase db advisors --local --type all --level info

DBURL="$(npx supabase status -o env | sed -n 's/^DB_URL=//p')"
psql "$DBURL" -v ON_ERROR_STOP=1 -f supabase/tests/10_schema_tests.sql   # 35 groupes, vrais rôles Supabase

npx supabase stop
```
`auth.uid()` réel de Supabase lit `request.jwt.claim.sub` **avant** `request.jwt.claims`
(`coalesce`) — les tests (`set_config('request.jwt.claim.sub', …)`) s'exécutent donc
sans adaptation, aussi bien sur la stack Docker que sur le shim de repli.

### Voie de repli — `--db-url` sur Postgres nu (si Docker indisponible)

```bash
createdb ci ; psql -d ci -f supabase/tests/00_local_auth_shim.sql   # auth.uid(), rôles, shim rls_auto_enable()
DBURL='postgresql://postgres@127.0.0.1:5432/ci?sslmode=disable'
npx supabase migration up --db-url "$DBURL" --include-all
psql -d ci -f supabase/tests/10_schema_tests.sql
```
> `supabase db reset` droppe le schéma `auth` de sa baseline puis rejoue les
> migrations : sur un Postgres nu (pas d'image Supabase) il échoue à
> `references auth.users`. C'est pourquoi cette voie utilise `migration up
> --include-all` + le shim. **Ne jamais** appliquer le shim sur la stack Docker
> (elle a déjà son vrai `auth`/`auth.uid()`/rôles).

## Résultat de la dernière exécution — Supabase CLI 2.116.0, stack Docker réelle, 2026-08-30

Image **`supabase/postgres:17.6.1.165`** (PostgreSQL **17.6**, confirmé par
`select current_setting('server_version')`).

```
supabase --version                        → 2.116.0
docker version                            → Client/Server 29.7.2, Docker Desktop 4.88.1

supabase start
  pull des images officielles + Applying 20260829120000 … 20260829120800 → 9/9

supabase db reset --local
  Recreating database… Applying 20260829120000 … 20260829120800 → 9/9 rejouées depuis une base vide
  "message":"Reset local database."

supabase migration list --local           → 9 local == 9 remote (avant ET après reset)
  15 tables · 2 vues · 10 enums · app_hidden = 6 fonctions · RLS active 15/15
  create_fiche_from_draft / provision_workshop : anon=NON · authenticated=NON · service_role=OUI
  SECURITY DEFINER accessible anon/authenticated : app_hidden.current_workshop_ids (authenticated only, voulu)

supabase db lint --local
  Linting schema: app_hidden / extensions / public → "No schema errors found"

supabase db advisors --local --type all           → "No issues found" (0 WARN/0 ERROR)
supabase db advisors --local --type all --level info
  INFO  rls_enabled_no_policy   (SECURITY)     x15   → attendu (politiques = Phase 4, deny-by-default)
  INFO  unused_index            (PERFORMANCE)  x22   → artefact base fraîche 0-trafic (idx_scan=0)
  (37 findings au total, identiques en nature à la précédente exécution de repli)

psql "$DBURL" -f supabase/tests/10_schema_tests.sql   → 35/35 groupes OK, exit 0 (ROLLBACK final)
  (T32 codes STRICTS : NULL→22004 · JSON racine non-objet, dont 'null'::jsonb →22023 · objet vide →23514)
  T35 SKIP / T35 (evt) SKIP — public.rls_auto_enable() et l'event trigger ensure_rls
  n'existent PAS sur l'image Supabase locale (spécifiques à la plateforme distante) ;
  comportement dégradé attendu — migration 20260829120800 gérée par to_regprocedure().

rollback (env jetable, hors stack Docker en cours) via migrations_down/*.down.sql (psql) :
  9/9 OK → 0 table · 0 enum public · schéma app_hidden supprimé

npm test → 19/19 · npx tsc -b → exit 0 (src/ intact)
supabase stop → "Stopped supabase local development setup."
```

> **Correction** : une exécution précédente avait diagnostiqué Docker comme absent
> de cet environnement. Ce diagnostic était erroné (contexte shell différent) —
> Docker Desktop est bien accessible depuis Bash et PowerShell sur la machine hôte,
> confirmé par `docker version` (Client 29.7.2 / Server Docker Desktop 4.88.1).
> La validation ci-dessus remplace celle faite sur Postgres 18 nu.

## `sunu-couture-dev` — déployé (environnement dev/staging, pas la production)

Journal du déploiement réel (2026-08-30) :
1. Dashboard → *Settings → Integrations* : intégration GitHub `RawaneG/sunu-couture`
   connectée mais **"Deploy to production" désactivé**, aucune branche configurée —
   vérifié **avant** tout `link` (corr. J). Aucun risque d'auto-déploiement.
2. `supabase login` (jeton CLI, jamais un mot de passe) → `supabase link
   --project-ref nffcdygtqzlivsresuuk` (mot de passe DB saisi **uniquement** dans le
   terminal du porteur, jamais transmis à l'agent).
3. `supabase db push --dry-run` (revue) → **confirmation explicite du porteur** →
   `supabase db push` réel → **9/9 migrations appliquées**.
4. `supabase migration list` → local == remote sur les 9 versions.
5. `supabase db advisors --linked --type all` → **0 WARN/0 ERROR**.
6. Vérifications de structure/privilèges via `supabase db query --linked` (API
   Management, sans mot de passe) : 15 tables, RLS 15/15, 2 vues
   `security_invoker`, `app_hidden` = 6 fonctions, `create_fiche_from_draft`/
   `provision_workshop` → `service_role` seul, `rls_auto_enable()` réel →
   `EXECUTE` révoqué pour `anon`/`authenticated`, `ensure_rls` actif, 0 politique
   RLS métier.
7. **35/35 tests SQL** rejoués contre le distant via `supabase db query --linked -f`
   (le script est auto-contenu `BEGIN…ROLLBACK`) — voir note T16 ci-dessous.
   0 ligne résiduelle vérifiée après coup sur 12 tables.
8. `npm test` 19/19, `tsc -b` OK.

`.env.local` **non commité** (rappel, à créer par le porteur) :
```
VITE_SUPABASE_URL=https://nffcdygtqzlivsresuuk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# clé secret : uniquement en variable d'Edge Function (Phase 3+), jamais ici
```
Rien sur un futur **projet de production** avant : `GRANT` + politiques RLS
(Phase 4) + tests d'isolation verts + pilote technique OK.

### Note de test — T16 rendu robuste au déploiement distant
`T16` vérifiait à l'origine que `authenticated` (après `set local role
authenticated`) voit **0 ligne** sur `fiches` sans politique RLS. Sur l'image
Supabase **locale** (Docker), `authenticated` a un `GRANT` de base hérité du
bootstrap de la CLI, donc la requête réussit et renvoie 0 ligne (RLS bloque). Sur
le projet **distant réel** `sunu-couture-dev`, `authenticated` n'a **aucun**
`GRANT` sur les tables métier (cohérent avec l'absence volontaire de `GRANT` en
Phase 2, corr. E/Phase 4) — la requête échoue directement avec `permission denied
for table fiches`, un refus **encore plus strict** que « RLS renvoie 0 ligne ». Le
test a été corrigé pour accepter les deux issues (`0 ligne` **ou**
`insufficient_privilege`) sans changer son intention (« `authenticated` ne voit
rien sans Phase 4 ») ni la règle métier. Revalidé 35/35 en local avant et après le
déploiement distant.

## Limites restantes (Phase 2 close ; Phase 3/4 à venir)

- **Advisor `unused_index` × 22 (INFO)** : artefact d'une base fraîchement migrée sans
  trafic (`idx_scan = 0` partout), confirmé identique en local et en distant. Les
  index sont tous soit couvre-FK (T20), soit servent une requête
  métier (recherche client, retraits du jour…). **Aucune suppression d'index.**
- **Advisor `rls_enabled_no_policy` × 15 (INFO)** : voulu — GRANT + politiques
  arrivent en Phase 4 ; sans eux = deny-by-default (T16, confirmé en distant avec
  un refus au niveau `GRANT`, encore plus strict que prévu).
- **Frontière `service_role`** (corr. Q) : contrôle JWT + appartenance/rôle **à
  implémenter dans les Edge Functions** (Phase 3) — exigence bloquante, non vérifiable
  au niveau schéma.
- **Phase 4 — non incluse ici, à livrer dans une seule et même migration** : RLS et
  GRANT sont **deux couches distinctes** — sans `GRANT`, une politique RLS ne suffit
  **pas** à rendre une table accessible par la Data API (PostgREST vérifie le
  privilège SQL *avant* d'évaluer les politiques). Cette migration ajoutera :
  - les **`GRANT` explicites minimaux** pour `authenticated` (par table, par
    opération) ;
  - **aucun accès métier pour `anon`** (pas de `GRANT` sur les tables applicatives) ;
  - les **politiques RLS** correspondant à ces GRANT (`workshop_members` non
    récursive, `UPDATE` avec `USING` **et** `WITH CHECK`, Storage) ;
  - des **droits différenciés `owner` / `assistant`** (ex. suppression d'atelier,
    gestion des membres réservées à `owner`) ;
  - les **droits sur les séquences** nécessaires aux colonnes qui en utilisent
    (`GRANT USAGE, SELECT` — les tables actuelles utilisent `uuid`/`gen_random_uuid()`,
    aucune séquence connue à ce jour, à confirmer au moment de la Phase 4).
- `config.toml` minimal : si `supabase start` réclame une clé, faire `supabase init`
  dans un dossier temporaire et recopier son `config.toml` (puis remettre
  `project_id`, `major_version = 17`, `[db.seed].enabled = false`, `[api].schemas`).
