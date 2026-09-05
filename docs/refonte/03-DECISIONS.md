# Refonte Tayoo — Décisions d'architecture validées

> Statut : **Phase 1 validée le 2026-08-29.** Ce document est la référence canonique.
> Toute divergence dans `01-AUDIT.md` / `02-PLAN-MIGRATION.md` ou dans le code doit être
> alignée sur ce document. Les décisions ne changent qu'avec une nouvelle validation
> métier, tracée ici (section « Journal des révisions »).
>
> **Révision 2026-08-29 (soir)** : D1 réaligné sur le projet Supabase **réellement
> créé** (`sunu-couture-dev`, `eu-west-1`) ; clés API modernes ; D6 `amount > 0` ;
> précisions sécurité (schéma privé `app_hidden`, `rls_auto_enable`, RLS activée en
> Phase 2) ; seed abonnement retiré (brouillon).
>
> **Révision 2026-08-29 (nuit) — statut Phase 2 : « candidate — validation Supabase
> CLI et advisors en attente »** : isolation multi-atelier par **FK composites**
> `(workshop_id, id)` (corr. K) ; brouillon « Nouvelle fiche » 100 % local +
> `app_hidden.create_fiche_from_draft()` transactionnel, `fiche_state` sans `'draft'`
> (corr. L) ; `modeles.nom` non vide (corr. M) ; **`fiches.signature_path` supprimée**
> → `media_assets(type='signature')` (corr. N) ; propriétaire d'atelier canonique
> `workshops.owner_id` + déclencheurs anti-divergence (corr. O).
>
> **Passe statique finale 2026-08-29** : transfert de propriétaire (rétrogradation
> avant promotion + invariant « un seul owner ») ; `create_fiche_from_draft()` sans
> `DEFAULT` + **règle métier anti-fiche-vide** ; **`allocate_fiche_number()` supprimée**
> — porte unique ; index de **préfixe exact** pour les FK composites ;
> `fiches → carnets` en **`ON DELETE NO ACTION`** ; `ALTER DEFAULT PRIVILEGES`
> schema-scoped **retiré** ; frontière `service_role` = exigence bloquante Phases 3–4.
>
> **2ᵉ passe ciblée 2026-08-29** : anti-fiche-vide rendu **NULL-safe** (`jsonb_typeof`,
> `nullif(btrim(…, whitespace), '')`, `jsonb_each` gardé par `CASE`, `IS NOT TRUE`) ;
> **migration dédiée `20260829120800_secure_rls_auto_enable.sql`** — `REVOKE EXECUTE`
> sur `public.rls_auto_enable()` (via `to_regprocedure()`/`to_regrole()`), **event
> trigger `ensure_rls` intact**. Tests : **35 groupes**.
>
> **Validation Supabase CLI 2.116.0 — 2026-08-30, stack Docker locale réelle**
> (image `supabase/postgres:17.6.1.165`, **PostgreSQL 17.6**) : `supabase start` +
> `db reset --local` = 9/9 migrations rejouées depuis une base vide · `migration
> list` local==remote · `db lint --local` aucune erreur · `db advisors --local`
> **0 WARN/0 ERROR** (37 INFO attendus) · **35/35 tests SQL** avec les vrais rôles
> Supabase (`anon`/`authenticated`/`service_role`, vrai `auth.uid()`) · `npm test`
> 19/19 · `tsc -b` OK. Corrigé au passage : `pgcrypto` → schéma `extensions`
> (finding `extension_in_public`) ; T32 codes d'erreur stricts (22004 / 22023 /
> 23514). Un diagnostic antérieur ayant à tort déclaré Docker indisponible a été
> corrigé et remplacé par cette validation sur la vraie image PG 17.
>
> **Correction documentaire 2026-08-30 (aucun changement SQL/applicatif)** : D1
> distingue désormais **dev/staging** (`sunu-couture-dev`) et **production** (projet
> futur) ; Phase 4 documentée comme livrant `GRANT` **et** RLS dans la **même**
> migration (les deux couches sont distinctes — sans `GRANT`, une politique RLS ne
> rend pas une table accessible par la Data API) ; provenance des migrations
> reformulée sans contradiction (rédigées à la main, validées par la CLI réelle,
> non recréées) ; correspondance de schéma (`02-PLAN-MIGRATION.md`) corrigée : aucune
> souscription créée en Phase 2.
>
> **Déploiement réel 2026-08-30** : `supabase link` + `db push --dry-run` (9/9
> annoncées, revue OK) → **confirmation explicite du porteur** → `supabase db push`
> réel sur `sunu-couture-dev` → **9/9 migrations appliquées**, `migration list`
> local==remote, `db advisors --linked` **0 WARN/0 ERROR** (37 INFO), 15 tables/RLS
> 15-15/2 vues `security_invoker`/`app_hidden` 6 fonctions confirmés en base, le
> vrai `rls_auto_enable()` de la plateforme distante a bien `EXECUTE` révoqué pour
> `anon`/`authenticated`, `ensure_rls` actif, `create_fiche_from_draft`/
> `provision_workshop` = `service_role` seul, 0 politique RLS métier (attendu).
> **35/35 tests SQL rejoués contre le distant réel** (`db query --linked -f`,
> `BEGIN…ROLLBACK`, mot de passe jamais transmis) — 0 ligne résiduelle après coup ;
> `npm test` 19/19, `tsc -b` OK. Test **T16** durci pour accepter `0 ligne` **ou**
> `insufficient_privilege` (le distant réel n'a, à raison, aucun `GRANT` pour
> `authenticated` — refus encore plus strict que prévu, cohérent avec la Phase 4).
> **Statut : « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev »**.
> Voir « Journal des révisions ».
>
> **Gel du graphe cloud post-preflight Phase 7 — corr. R (2026-09-05)** : trois
> audits architecturaux successifs (preflight bloquant avant tout code Phase 7,
> exigé par `02-PLAN-MIGRATION.md`) ont confirmé un **CAS C — réordonnancement
> requis** : la séquence documentée « Phase 7 → Phase 8 → Phase 6B » ne peut pas
> s'exécuter sans violer la Phase 4 (`GRANT`/RLS déjà mergée), sans commencer
> silencieusement une autre phase, ou sans produire des données cloud fausses
> (solde à 0 F, catalogue invisible, numérotation legacy écrasée). Le graphe
> d'exécution cloud est désormais **figé** : `7A → 9A → 7B → 8A → 8B → 11A →
> [Gate VITE_BACKEND=supabase] → 6B0 → 6B`. Détail complet en correction **R**
> ci-dessous. **Statut Phase 7 : « preflight CAS C confirmé — graphe figé,
> implémentation 7A non commencée »**. Aucun code, aucune migration SQL, aucune
> Edge Function n'a été produit pour ce gel — uniquement une décision
> architecturale documentée.

Table :
- [D1 — Projet Supabase](#d1--projet-supabase)
- [D2 — Identité du client](#d2--identité-du-client)
- [D3 — Téléphone (E.164)](#d3--téléphone-e164)
- [D4 — Fiches sans client](#d4--fiches-sans-client)
- [D5 — Authentification](#d5--authentification)
- [D6 — Import de l'ancienne avance](#d6--import-de-lancienne-avance)
- [D7 — Médias](#d7--médias)
- [D8 — Statuts](#d8--statuts)
- [D9 — Numérotation des carnets](#d9--numérotation-des-carnets)
- [D10 — Rôles](#d10--rôles)
- [D11 — Hébergement et transition](#d11--hébergement-et-transition)
- [Corrections apportées au plan (A → R)](#corrections-apportées-au-plan-de-migration)

---

## D1 — Projet Supabase

### État réel vérifié (2026-08-29)

| Point | Valeur |
|---|---|
| Nom | **`sunu-couture-dev`** |
| Project ref | `nffcdygtqzlivsresuuk` (non secret — apparaît dans l'URL du projet) |
| Région | **`eu-west-1` — West EU (Ireland)** |
| PostgreSQL | **17** |
| Statut | `ACTIVE_HEALTHY`, base applicative **vide** (0 table, 0 migration) |
| Autre projet du compte | **`E-commerce`** — **ne jamais modifier** |

### Décisions

| Point | Décision |
|---|---|
| Propriété | Projet `sunu-couture-dev` sur le **compte Supabase personnel** du porteur du produit. |
| Outillage | **Supabase CLI en local** pour préparer, rejouer (`supabase db reset --local`) et lister (`supabase migration list --local`) les migrations. |
| Rôle de `sunu-couture-dev` | **Environnement dev/staging**, pas la production. |
| Liaison distante | Après **validation locale complète de la Phase 2**, `supabase link` puis **`supabase db push --dry-run`** sont autorisés. Un **`db push` réel** vers `sunu-couture-dev` exige la **revue du dry-run** et une **confirmation explicite du porteur** — jamais automatique. **Aucune donnée réelle de tailleur** n'est ajoutée avant la Phase 4. |
| Projet `prod` | Projet distinct, créé/modifié **seulement après** les politiques RLS (Phase 4), les tests d'isolation et le pilote technique. |
| Versionnement | **Toutes** les migrations dans `supabase/migrations/`, **format horodaté officiel** (`<AAAAMMJJHHMMSS>_<nom>.sql`). Les 9 migrations initiales ont été **rédigées manuellement** dans ce format puis **validées par la CLI réelle** (`supabase db reset --local` sur PG 17) — elles ne sont **ni recréées ni renommées**. Toute **future** migration est créée via `supabase migration new`, jamais de préfixe manuel `0001`. `*.down.sql` miroir dans `supabase/migrations_down/`. |

### Variables d'environnement (clés API modernes)

Le nouveau projet utilise le **nouveau système de clés API** Supabase :

| Variable | Portée | Valeur |
|---|---|---|
| `VITE_SUPABASE_URL` | front (build) | `https://nffcdygtqzlivsresuuk.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | front (build) | clé **publishable** (`sb_publishable_…`) — remplace l'`anon key` |
| *(serveur)* clé **secret** (`sb_secret_…`) | **Edge Functions uniquement** | remplace `service_role` — **jamais** dans le front |
| *(serveur)* mot de passe PostgreSQL | CLI `supabase link` (saisie locale) | **jamais** committé, **jamais** transmis dans une conversation |

- **Ne plus recommander `VITE_SUPABASE_ANON_KEY`** pour ce projet.
- **Ne jamais demander d'afficher ou de transmettre** : le mot de passe PostgreSQL, une secret key, une clé `service_role`.

**Impact dépôt :** `supabase/config.toml` versionné avec `project_id = "sunu-couture-dev"` (identifiant local, **pas** la ref) ; aucun secret ; la ref distante n'est renseignée que par `supabase link`, manuellement, après validation.

---

## D2 — Identité du client

**Ne jamais** découper `Client.name` de façon automatique et irréversible (pas de « premier mot = prénom »).

### Modèle retenu (`clients`)

| Colonne | Obligatoire | Rôle |
|---|---|---|
| `display_name` | **oui** | nom affiché **exactement comme saisi** |
| `first_name` | non | prénom, si connu de façon fiable |
| `last_name` | non | nom, si connu de façon fiable |
| `nickname` | non | surnom |
| `metadata.legacy_name` | — | valeur `Client.name` d'origine, conservée à l'import |

### Règles d'import

1. `Client.name` est **toujours** recopié intégralement dans `display_name`.
2. Si une fiche liée possède déjà `prenom` **et** `nom` distincts et non vides → ils **peuvent** alimenter `first_name` / `last_name`.
3. **Contradiction** entre plusieurs fiches liées au même client → **ne pas trancher** : garder `display_name`, laisser `first_name`/`last_name` vides, ou demander confirmation dans l'assistant.
4. Aucun nom composé n'est altéré par une heuristique.
5. Dans l'interface simple, le libellé du champ est **« Nom ou surnom »** (alimente `display_name`).

**Impact :** `ClientDetail.handleNewFiche` (qui fait aujourd'hui `client.name.trim().split(/\s+/)`) sera revu — le pré-remplissage d'une fiche utilisera `display_name` tel quel, et `first_name`/`last_name` seulement s'ils existent.

---

## D3 — Téléphone (E.164)

### Format

| Colonne | Exemple | Rôle |
|---|---|---|
| `phone_e164` (canonique) | `+221775124408` | dédup, futur OTP, appels |
| `phone_display` (facultatif) | `77 512 44 08` | affichage tel que saisi |
| `metadata.legacy_phone` | `77 512 44 08` | valeur d'origine, pendant la migration |

> Nom de colonne : `phone_e164`. Le cahier des charges parle de `phone_normalized` ;
> on garde `phone_e164` comme nom explicite, `phone_normalized` = alias conceptuel.

### Règles de normalisation

- Retirer espaces, tirets, parenthèses, points.
- Un numéro **local sénégalais valide** (`7X XXX XX XX`, 9 chiffres commençant par 7) → préfixer `+221`.
- Un numéro déjà en `+…` conforme E.164 → conservé tel quel.
- Numéro **absent** → `null` (jamais de valeur inventée).
- Numéro non reconnaissable → `phone_e164 = null`, `phone_display` garde la saisie brute, `metadata.legacy_phone` conservé, **signalé dans l'assistant** pour correction manuelle.

### Unicité

Index **unique partiel** :
```sql
create unique index clients_workshop_phone_uidx
  on clients (workshop_id, phone_e164)
  where phone_e164 is not null and deleted_at is null;
```
- s'applique **uniquement** quand le téléphone n'est pas nul **et** le client n'est pas supprimé logiquement ;
- avant de créer un client avec un `phone_e164` déjà présent → **proposer le client existant** (recherche indexée côté client, confirmée par RPC).

---

## D4 — Fiches sans client

Stratégie **hybride** :

1. La fiche a un nom, un surnom **ou** un téléphone exploitable → **créer ou retrouver** un client léger.
2. Déduplication **d'abord** par `phone_e164`.
3. Déduplication par **nom normalisé** : seulement avec **prudence** et **confirmation** quand plusieurs candidats existent.
4. Identité d'origine conservée dans `fiches.metadata.legacy_identity` (`{ nom, prenom, telephone }`).
5. Aucune identité exploitable → `client_id = null` (autorisé).
6. **Jamais** de client `"Sans nom"` créé automatiquement.

Une fiche à `client_id = null` doit rester **complétable** et **rattachable** à un client plus tard (action explicite dans `FicheDetail`).

**Impact schéma :** `fiches.client_id uuid null references clients(id)`. `fiches.metadata jsonb not null default '{}'`.

---

## D5 — Authentification

**Cible pilote : téléphone + OTP Supabase.**

| Règle | Détail |
|---|---|
| Première connexion | **accompagnée**. |
| Session | persiste sur le téléphone (refresh token stocké par `supabase-js`). |
| PIN local | verrouille **visuellement** l'app après inactivité. Stocké/hashé en local, **jamais** envoyé au serveur. |
| PIN ≠ sécurité serveur | ne **jamais** présenter le PIN comme une protection cryptographique des données ; ne **jamais** l'utiliser comme mot de passe Supabase. |
| `AuthRepository` | interface permettant de **substituer temporairement** une autre méthode (magic link e-mail) si le fournisseur SMS n'est pas prêt. |
| MVP | action **« Déconnecter tous les appareils »** (révoque les refresh tokens). |
| Gestion appareil par appareil | **reportée** tant que le comportement n'est pas confirmé avec les API Supabase disponibles. |
| Message UI de déconnexion globale | expliquer que **le jeton d'accès courant peut rester valide jusqu'à son expiration** (≤ 1 h) ; seuls les refresh tokens sont révoqués immédiatement. |

**Impact :** provisioning atelier via Edge Function (jamais de trigger automatique aveugle sur `auth.users`). La **clé secret** (`sb_secret_…`, qui remplace `service_role`) uniquement côté Edge Function — jamais dans le front, jamais affichée/transmise.

---

## D6 — Import de l'ancienne avance

`fiche.createdAt` **n'est pas** la date du versement — elle est **inconnue**.

Pour chaque `fiche.avance > 0`, créer **un** `client_payments` :

| Champ | Valeur |
|---|---|
| `amount` | `fiche.avance` (entier FCFA) |
| `paid_at` | **`null`** |
| `recorded_at` | `fiche.createdAt` |
| `method` | `null` |
| `note` | `"Reprise du carnet — date du versement inconnue"` |
| `metadata.source` | `"legacy_import"` |

**Impact schéma :** `client_payments.paid_at timestamptz null` (nullable), `client_payments.recorded_at timestamptz not null default now()`. `reste = total_price − Σ amount` reste vrai indépendamment de `paid_at`.

### `amount` : `CHECK (amount > 0)` (strictement positif)

Retenu **`> 0`**, pas `>= 0`. Justification :
- un versement de **0 F n'a aucune signification métier** ;
- l'app rejette déjà 0 et les montants négatifs **à la saisie** (garde-fou UI de la Phase 11) — la contrainte SQL est la seconde barrière ;
- une ligne à 0 F polluerait l'historique des versements et le journal, sans effet sur le `reste` ;
- **aucun cas legacy** ne produit 0 : l'import ne crée une ligne que pour `avance > 0`.

Un dépassement (versement supérieur au reste) reste **autorisé** et **signalé** (jamais tronqué) — c'est `> reste`, pas `<= 0`, qui est le cas limite.

---

## D7 — Médias

`media_assets` :

| Colonnes dédiées (fortement typées) | Colonne souple |
|---|---|
| `type` (`fabric_photo` / `model_photo` / `voice_note` / `signature`) | `metadata jsonb not null default '{}'` |
| `mime_type` | contient selon le média : `duration_seconds`, `width`, `height`, `codec`, `checksum`, … |
| `size_bytes` | |
| `storage_path` | |

**Impact :** plus de colonne `duration` isolée — la durée d'un vocal vit dans `metadata.duration_seconds`. Les requêtes qui en ont besoin lisent le jsonb.

**Précision (corr. R, audit Phase 7)** : `media_assets` porte `fiche_id uuid not null` avec une
FK composite vers `fiches` — cette table est **exclusivement pour les médias de FICHE**
(`fabric_photo`/`voice_note`/`signature`). La valeur d'enum `model_photo` **n'est pas
utilisée par ce chemin** et reste inemployée (aucune migration n'est créée pour la
retirer). Les photos/patrons de **modèle** vivent dans une table dédiée et
indépendante, **`modele_medias`** (`modele_id`, `kind` ∈ `photo`/`patron`,
`storage_path`, `mime_type`, `size_bytes`, `position`, `metadata`), créée en
Phase 2 et **jamais** rattachée à `media_assets` — voir corr. K (FK composites)
et corr. R (Phase 8B — Catalogue cloud, `02-PLAN-MIGRATION.md`).

---

## D8 — Statuts

| App actuelle | Cible base | Libellé écran (FR, inchangé) |
|---|---|---|
| `recu` | `received` | « Reçue » |
| `couture` | `sewing` | « En couture » |
| `pret` | `ready` | « Prête » |
| `livre` | `delivered` | « Livrée » |

- `fiches.status` = enum `received | sewing | ready | delivered`.
- `fiches.state` = enum **`active | cancelled | archived`** (plus de `'draft'` côté serveur — corr. L ; le brouillon est purement local, promu via `app_hidden.create_fiche_from_draft()`).
- **`late` n'est plus stocké** — dérivé à l'affichage (`due_date < now()` et `status <> 'delivered'` et `state = 'active'`).

---

## D9 — Numérotation des carnets

- Colonne **`carnets.next_number int not null default 1`**.
- Attribution d'un `numero` de fiche = **atomique et transactionnelle**, avec **verrouillage de la ligne carnet** (`SELECT … FOR UPDATE`), puis `next_number = next_number + 1`.
- **Interdit** : `MAX(number) + 1` seul (réutilisation d'un numéro supprimé, course entre deux appareils).
- Une fiche **archivée** ou **supprimée logiquement** ne **libère jamais** son numéro.
- Contrainte `unique (carnet_id, number)` sur `fiches`.
- Bascule à 120 : quand `next_number > fiches_par_carnet`, le carnet passe `status = 'full'` ; un nouveau carnet `(workshop_id, number = precedent + 1)` est créé avec `next_number = 1`.

Entrée officielle pour la **création métier normale** : **`app_hidden.create_fiche_from_draft(p_workshop_id, p_client_id, p_fiche jsonb)`** (corr. L) — opération transactionnelle qui verrouille/crée le carnet, **alloue elle-même** le numéro suivant depuis `next_number` (aucun numéro fourni en paramètre), calcule page/slot, insère la fiche `'active'`, bascule le carnet plein et prépare le suivant. `security definer`, `search_path=''`, noms qualifiés, `EXECUTE` → `service_role` uniquement, appelée par l'**Edge Function dédiée `create-fiche-from-draft`** (corr. R, Phase 9A — pas un wrapper `public` `SECURITY INVOKER` : voir corr. R pour l'arbitrage). `app_hidden.allocate_fiche_number()` **n'existe plus** (supprimée, corr. L — porte unique). Le schéma `app_hidden` n'est **pas** exposé par PostgREST.

**Précision (corr. R, audit Phase 7)** : `create_fiche_from_draft` n'acceptant **aucun
numéro explicite**, elle est **structurellement incapable de préserver une
numérotation legacy** (ex. carnet `1, 2, 5` → elle produirait `1, 2, 3`). Elle
reste donc exclusivement la porte de la création métier **normale** — l'import
legacy (Phase 6B0/6B) utilise un chemin serveur entièrement distinct
(`app_hidden.import_legacy_*`), qui accepte les numéros/carnets legacy explicites.

---

## D10 — Rôles

MVP : **`owner`** et **`assistant`** uniquement.

| Capacité | `owner` | `assistant` |
|---|---|---|
| Clients, fiches, mesures, médias (CRUD) | ✅ | ✅ |
| Modifier l'abonnement | ✅ | ❌ |
| Activer un paiement Tayoo | ✅ | ❌ |
| Gérer les `subscription_transactions` | ✅ | ❌ |
| Modifier les rôles / membres de l'atelier | ✅ | ❌ |

**Impact RLS :** politiques distinctes sur `subscriptions`, `subscription_transactions`, `workshop_members` (voir correction **E**).

---

## D11 — Hébergement et transition

- **Frontend : Vercel** (conservé).
- **Opérations privilégiées : Supabase Edge Functions.**
- **Import unique**, ancienne sauvegarde en **lecture seule**.
- **Pas de dual-write** `localStorage + cloud`.
- Après bascule cloud, le fonctionnement **hors ligne normal** = **IndexedDB + file de synchronisation** (pas le store legacy).

---

## Corrections apportées au plan de migration

Ces corrections sont intégrées dans `02-PLAN-MIGRATION.md`. Résumé + justification :

### A — Sauvegarde du stockage historique
- **Ne pas** dupliquer systématiquement `sunu-couture` dans une autre clé `localStorage` (le quota peut déjà être quasi saturé → la copie échouerait).
- Ordre de sauvegarde : **(1)** fichier **JSON téléchargé** → **(2)** copie IndexedDB *si l'espace le permet* (`navigator.storage.estimate()`) → **(3)** **vérification** du fichier exporté (relecture + comparaison des compteurs).
- Toute écriture de secours **gère et affiche explicitement** les erreurs de quota (`QuotaExceededError`).

### B — Ordre de migration des médias
- La Phase 6 importait des médias avant la création des buckets / `MediaRepository` (Phase 8). **Incohérent.**
- **Phase 6 scindée** :
  - **6A** — export, analyse, différenciation démo/réel, **prévisualisation** (aucune écriture cloud).
  - **6B** — **import effectif**, exécuté **après la Phase 8** (buckets privés + politiques Storage + tests OK).
- **Aucun média importé** avant que le stockage privé soit opérationnel et testé.

### C — Cache Workbox
- **Pas** de cache Workbox générique sur les requêtes **Supabase authentifiées**.
- Données métier privées mises en cache **uniquement dans IndexedDB**, **partitionnées par `user_id` + `workshop_id`**.
- Le service worker gère : **app shell**, **fichiers statiques**, **page de secours hors ligne**.
- Au **logout** ou au **changement d'atelier** : **purge / isolation stricte** du cache IndexedDB correspondant.

### D — Drapeau `VITE_BACKEND`
- `VITE_BACKEND` est **injecté au build** par Vite → **pas** un basculement instantané sans redéploiement.
- Usages légitimes : développement, tests, migration, **build de secours**.
- **En production** : l'utilisateur **ne bascule pas librement** entre stockage legacy local et cloud (sinon deux sources de vérité).
- **Retour arrière production** =
  1. **rollback du déploiement Vercel** ;
  2. **sauvegarde historique en lecture seule** ;
  3. **mode hors ligne IndexedDB** quand le cloud est temporairement indisponible.

### E — GRANT + politiques RLS (anti-récursion sur `workshop_members`)
- ⚠️ **`GRANT` et RLS sont deux couches distinctes** : PostgREST vérifie d'abord le
  privilège SQL standard (`GRANT`), puis seulement s'il est présent évalue les
  politiques RLS. **Sans `GRANT`, une politique RLS ne suffit pas** à rendre une
  table accessible par la Data API. La Phase 4 livre donc, **dans la même
  migration** : (1) les `GRANT` explicites minimaux pour `authenticated`, table par
  table ; (2) **aucun `GRANT` métier pour `anon`** ; (3) les politiques RLS
  correspondantes ; (4) des droits différenciés `owner` / `assistant` (D10) ; (5)
  les droits sur les séquences le cas échéant.
- **Ne pas** appliquer à `workshop_members` une politique qui **relit `workshop_members`** (récursion).
- Retenu :
  - politiques `workshop_members` basées sur **`user_id = auth.uid()`** (un membre voit / gère **sa propre** ligne ; l'`owner` gère les membres de **ses** ateliers via `EXISTS (SELECT 1 FROM public.workshops w WHERE w.id = workshop_members.workshop_id AND w.owner_id = auth.uid())`, **pas** via `workshop_members`) ;
  - pour les autres tables, la fonction **`app_hidden.current_workshop_ids()`** — `security definer`, `stable`, `set search_path = ''`, noms qualifiés, `EXECUTE` accordé **au seul `authenticated`** — qui renvoie les `workshop_id` de `auth.uid()` **sans** déclencher la RLS récursivement.
  - **Toute politique `UPDATE` déclare `USING` ET `WITH CHECK`** : `USING` = lignes que l'utilisateur peut modifier, `WITH CHECK` = image finale autorisée → interdit de **déplacer** une ligne vers un autre `workshop_id`.
- **Tests Phase 4** : pas de récursion (`workshop_members` répond sans `infinite recursion detected in policy`) ; un membre **ne peut pas s'ajouter** dans un autre atelier ; un `UPDATE` qui change `workshop_id` est refusé par `WITH CHECK` ; `anon` → 0 ligne (absence de `GRANT`, pas seulement de politique).
- **Fait en Phase 2** (vérifiable dès maintenant, sans `GRANT` ni politique) : les fonctions `app_hidden.*` (hors API) ont des attributs de sécurité corrects, `EXECUTE` minimal (test `10_schema_tests.sql` T17/T19/T30).

### H — Schéma reproductible & durcissement (instructions 5–6)
- **RLS activée explicitement dans une migration** (`…_enable_row_level_security.sql`) sur **les 15 tables exposées** — on ne dépend **pas** du déclencheur automatique du Dashboard. Sans politique jusqu'à la Phase 4 ⇒ **refus par défaut** pour `anon`/`authenticated` (état sûr).
- **`…_security_hardening.sql`** : révoque toute écriture des rôles clients sur `subscription_plans` / `subscriptions` et **tout accès** à `subscription_transactions` / `promo_codes` ; blanket `revoke all on all functions in schema app_hidden from public`.
- **`…_secure_rls_auto_enable.sql`** (migration DÉDIÉE, passe statique) — traite l'**avertissement Supabase existant** sur `sunu-couture-dev` (`public.rls_auto_enable()` `SECURITY DEFINER`, `EXECUTE` ouvert à `anon`/`authenticated`, event trigger `ensure_rls` actif) :
  - `if to_regprocedure('public.rls_auto_enable()') is not null then` → **`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`** (rôles ajoutés via `to_regrole()` seulement s'ils existent) ;
  - **ne SUPPRIME NI NE DÉSACTIVE** l'event trigger `ensure_rls` (il continue d'auto-activer la RLS sur les nouvelles tables) ; vérification défensive `evtenabled <> 'D'` ;
  - compatible « fonction/trigger absents » (`to_regprocedure` / `pg_event_trigger` → NULL / 0 ligne, aucune erreur) ;
  - `.down.sql` = **no-op délibéré** (on ne re-`GRANT`e pas `EXECUTE`).
  - Émulée en test local via `00_local_auth_shim.sql` (fonction + event trigger factices) ; test **T35**.
- **Fonctions internes dans `app_hidden`** (schéma non listé dans `config.toml [api].schemas`), pas dans `public`.
- **`SECURITY DEFINER`** : uniquement `app_hidden.*` ; `search_path = ''` + noms entièrement qualifiés partout ; `revoke all … from public` (même transaction) puis `grant execute` au strict rôle nécessaire (`authenticated` pour `current_workshop_ids` ; `service_role` pour `create_fiche_from_draft` et `provision_workshop`).
- **Vues** `fiche_balances` / `fiches_view` créées `WITH (security_invoker = on)` → pas de « SECURITY DEFINER view », la RLS des tables s'applique à l'appelant.
- **Trigger `updated_at`** : `app_hidden.set_updated_at()` (`search_path = ''`).

### I — Seed d'abonnement retiré (instruction 8)
- Les 4 offres et leurs prix (`fondateur_annuel = 10000`, découverte = **20 fiches**) sont **« expérimentaux »**, **non validés métier** → **retirés du seed**.
- `…_create_subscription_schema.sql` crée les **tables seules**, sans `INSERT`. `supabase db reset` laisse `subscription_plans` **vide** (test T11).
- Un brouillon **non actif** (`is_active = false`) est fourni dans `supabase/seeds/draft_subscription_plans.sql`, **non câblé** dans `config.toml [db.seed]` (essais manuels locaux uniquement).
- Phase 14 réintroduira des offres **validées** via une migration dédiée.

### J — Aucun déploiement automatique pendant la correction (instruction 9)
- Le dépôt ne contient **aucun workflow `.github/`**. Déploiement front = intégration Vercel sur `github.com/RawaneG/sunu-couture` (branche `main`).
- `supabase/` est **non suivi par git** ; **aucun `git push`, aucun `supabase db push`** pendant cette étape ⇒ rien ne se déclenche.
- **Avant tout `supabase link`**, vérifier dans le Dashboard Supabase → *Integrations / Branching* que le **déploiement automatique des migrations est désactivé** (ou que la branche surveillée n'est pas `main`) — `sunu-couture-dev` reste un environnement **dev/staging**, un `db push` réel n'y est fait qu'après revue du dry-run et confirmation explicite du porteur (D1). Cette vérification est **à faire par le porteur** (pas d'accès Dashboard/API depuis l'agent).

### F — Conflits de synchronisation
- **Pas** de seconde fiche visible et numérotée pour matérialiser un conflit.
- Structure dédiée **`sync_conflicts`** (ou équivalent local) :
  `fiche_id`, `local_version`, `remote_version`, `conflicting_fields`, `detected_at`, `resolution_state`.
- La résolution **modifie la fiche d'origine**, **sans consommer** de nouveau numéro.

### G — Données de démonstration
- `seedClients` / `seedFiches` (Awa Diouf, Modou Fall, …) **explicitement marqués `demo`**.
- Un **nouvel atelier réel démarre avec un carnet vide**.
- La démo reste accessible dans un **mode démonstration séparé** ; **jamais mélangée** aux vraies données.
- **Impact code (à venir, Phase 5/6)** : `store.ts` ne charge plus la seed comme état initial d'un atelier réel ; la seed vit derrière un `demoStore` / flag `VITE_DEMO` ou un espace `workshop` marqué `is_demo = true` jamais synchronisé.

### K — Isolation multi-atelier par FK composites (révision « candidate », point 1)
Chaque relation enfant → parent scopée par atelier passe par une **clé étrangère
composite** `(workshop_id, <parent_id>) → parent (workshop_id, id)` — une référence
inter-ateliers devient **impossible au niveau du moteur**, en plus de la RLS.

| Enfant | Parent | `ON DELETE` |
|---|---|---|
| `fiches` | `carnets (workshop_id, id)` | **`NO ACTION`** (passe statique, point 5) — un carnet contenant des fiches n'est **pas** supprimable directement ; l'archivage (`UPDATE status='archived'`) reste possible ; `DELETE workshops` fonctionne car `NO ACTION` est vérifié **en fin de commande**, après le `CASCADE` de `fiches.workshop_id` |
| `fiches` | `clients (workshop_id, id)` | `SET NULL (client_id)` (PG ≥ 15 — cible 17) |
| `client_payments` | `fiches (workshop_id, id)` | `CASCADE` |
| `media_assets` | `fiches (workshop_id, id)` | `CASCADE` |
| `modele_medias` | `modeles (workshop_id, id)` | `CASCADE` |
| `sync_conflicts` | `fiches (workshop_id, id)` | `CASCADE` |

- Contraintes `UNIQUE (workshop_id, id)` ajoutées sur `carnets`, `clients`, `fiches`, `modeles` (cibles des FK composites).
- Les FK simples correspondantes sont **remplacées** par les composites.
- **Index de préfixe EXACT** (passe statique, point 4) : `fiches (workshop_id, carnet_id)`, `fiches (workshop_id, client_id)`, `client_payments (workshop_id, fiche_id)`, `media_assets (workshop_id, fiche_id)`, `sync_conflicts (workshop_id, fiche_id)`, `modele_medias (workshop_id, modele_id)`. Test **T20** vérifie que le **préfixe de colonnes** d'un index correspond aux colonnes de chaque FK **dans l'ordre** (pas seulement « chaque colonne indexée »).
- Tests : **T22a–f** (références inter-ateliers rejetées), **T34a/b/c** (carnet non supprimable directement / archivage OK / `DELETE workshops` propre sans orphelin).

### L — Brouillons & numérotation (révision « candidate », point 2 + passe statique points 2–3)
- Le brouillon « Nouvelle fiche » reste **100 % local** (IndexedDB / état d'UI) : **aucune ligne distante** créée, **aucun numéro consommé** à l'ouverture du formulaire.
- L'enum **`fiche_state` n'a plus `'draft'`** → `('active', 'cancelled', 'archived')`, défaut `'active'`.
- **Porte UNIQUE** : `app_hidden.create_fiche_from_draft(p_workshop_id uuid, p_client_id uuid, p_fiche jsonb)` — **`p_fiche` n'a PAS de valeur par défaut** ; les 3 paramètres sont requis. `security definer`, `search_path=''`, `EXECUTE` → `service_role` seul. Elle seule :
  1. valide la **règle métier anti-fiche-vide** (ci-dessous) **avant tout verrou** ;
  2. `pg_advisory_xact_lock` par atelier ;
  3. verrouille (`FOR UPDATE`) ou crée le carnet actif ;
  4. alloue le numéro (`next_number`), calcule `page_number` / `slot_number` ;
  5. insère la fiche `'active'` ;
  6. avance `next_number` ; si plein → `status='full'` **et crée le carnet suivant** `'active'`.
- **`app_hidden.allocate_fiche_number()` est SUPPRIMÉE** (passe statique, point 3). Aucun numéro ne peut être consommé sans création de fiche dans la même transaction. Test **T33**.
- **Règle métier « fiche non vide »** (passe statique, points 2 + logique NULL sûre) : une fiche `'active'` doit contenir **au moins**
  - un `client_id` non nul, **OU**
  - une information significative parmi `garment`, `description`, `measurements` (clé avec `valeur` non blanche ; forme plate `{clé: "44"}` aussi) ou `metadata.legacy_identity.{nom|prenom|telephone}`.
  - **Logique NULL sûre** : `p_fiche IS NULL` → refus (`null_value_not_allowed`) ; `jsonb_typeof(p_fiche) <> 'object'` → refus (`invalid_parameter_value`) ; chaque terme est **strictement booléen** (`nullif(btrim(<txt>, E' \t\n\r\f\v'), '') is not null` → jamais NULL ; clés absentes / valeurs JSON null / chaînes blanches — espace **tab, saut de ligne** inclus — → FALSE) ; `jsonb_each` n'est appelé **que** si `measurements` est un objet (via `CASE` — un tableau ou un scalaire renvoie FALSE sans erreur) ; garde finale `IF v_significatif IS NOT TRUE THEN RAISE … USING ERRCODE = 'check_violation'`.
  Refus **avant** tout verrou → aucune fiche, aucun carnet, aucun numéro. Tests **T32a** (15 payloads refusés : `NULL` / `{}` / clés absentes / null explicites / chaînes blanches (espace, tab, saut de ligne) / `measurements` null|tableau|scalaire / `p_fiche` non-objet — **aucune fiche, aucun carnet, aucun numéro**), **T32b** (`measurements.valeur` / `legacy_identity` / `garment` / client → fiche atomique).
- Tests aussi : **T24** (séquence 1,2 + bascule → carnet suivant n°1, carnet 1 `full`), **T25/T25b** (client hors atelier rejeté, aucun effet de bord), **T26** (`fiche_state` sans `'draft'`).

### M — Modèles vides (révision « candidate », point 3)
- `modeles.nom` : **`default ''` supprimé**, `not null`, `check (length(btrim(nom)) between 1 and 200)`.
- Le brouillon d'un modèle reste **local** jusqu'à validation (aucune ligne créée à l'ouverture du formulaire).
- Tests : **T23a/b/c** rejettent `''`, `'   '` et l'absence de `nom`.

### N — Signature (révision « candidate », point 4)
- **`fiches.signature_path` supprimée.**
- La signature = **`media_assets` avec `type = 'signature'`**, **au plus une par fiche** (`create unique index … where type = 'signature' and deleted_at is null`).

### O — Propriétaire d'atelier canonique + **transfert** (révision « candidate », point 6 + passe statique point 1)
- **`workshops.owner_id` fait foi.**
- **`app_hidden.current_workshop_ids()`** renvoie l'**UNION** : ateliers dont `owner_id = auth.uid()` **∪** ateliers présents dans `workshop_members` (le propriétaire voit son atelier même si la ligne membre venait à manquer).
- **`app_hidden.provision_workshop(p_owner, p_name)`** (`security definer`, `EXECUTE` → `service_role`) : insère l'atelier ; le déclencheur `AFTER INSERT/UPDATE OF owner_id` **`sync_owner_membership`** synchronise la ligne `workshop_members(role='owner')`.
- **Transfert de propriétaire** (`UPDATE workshops SET owner_id = …`) dans `sync_owner_membership` :
  - verrou des lignes membres concernées (`FOR UPDATE`) + verrou de la ligne `workshops` (pris par l'`UPDATE` déclencheur) → **deux transferts concurrents sérialisés** ;
  - **rétrograder l'ancien propriétaire en `assistant` AVANT** d'insérer/promouvoir le nouveau (sinon l'index unique partiel « un seul owner » bloque la promotion) ;
  - **invariant vérifié** : exactement **un** `owner` après l'opération, sinon `raise exception`.
- Déclencheur `BEFORE DELETE/UPDATE` **`protect_owner_membership`** sur la ligne du propriétaire **officiel** (celui pointé par `owner_id`) : interdit la suppression, la rétrogradation **et** la modification de `workshop_id` / `user_id`. Le transfert passe **uniquement** par `UPDATE workshops.owner_id`.
- Tests : **T21** (ligne owner auto), **T27/T27b** (provisioning cohérent + nom vide rejeté), **T28** (branche `owner_id` de `current_workshop_ids`), **T29a/b** (suppression/rétrogradation bloquées), **T31** (transfert A→B : A→assistant, B→owner, exactement 1 owner), **T31b/c** (`user_id` / `workshop_id` de la ligne owner non modifiables), **T31d** (`DELETE workshops` propre, 0 orphelin).

### P — Privilèges par défaut & statut de validation (révision « candidate » + passe statique points 5 & 7)
- **Provenance des migrations, formulée une seule fois et sans contradiction** : les 9 migrations initiales ont été **rédigées manuellement** au format horodaté officiel de `supabase migration new`, puis **validées par la Supabase CLI 2.116.0** (`supabase db reset --local` sur l'image PostgreSQL 17) — validation de leur **application**, pas de leur origine. Elles **ne seront ni recréées ni renommées**. Toute **future** migration devra être créée avec `npx supabase migration new <nom>`.
- **`ALTER DEFAULT PRIVILEGES … IN SCHEMA app_hidden …` a été RETIRÉ** de la migration (passe statique, point 6) : c'est un no-op PostgreSQL sur les fonctions et il ne faut pas prétendre qu'il protège les futures fonctions. Aucun `ALTER DEFAULT PRIVILEGES` **global** n'est appliqué sans analyse d'impact sur les autres fonctions Supabase.
- **Enforcement conservé** : (1) `anon` sans `USAGE` sur `app_hidden` ; (2) `REVOKE ALL … FROM PUBLIC` **explicite dans la même transaction** que chaque `CREATE FUNCTION` ; (3) blanket `revoke all on all functions in schema app_hidden from public` (`20260829120700`) ; (4) test **T30** — **aucune fonction sensible exécutable par `PUBLIC` / `anon` / `authenticated`** (`current_workshop_ids` → `authenticated` reste intentionnel, pour les politiques RLS). Toute nouvelle fonction `app_hidden` **doit** porter son propre `revoke`.
- **Validation Supabase CLI 2.116.0 effectuée (2026-08-30) sur la vraie stack Docker locale**, image `supabase/postgres:17.6.1.165` (**PostgreSQL 17.6**) : `supabase start` + `supabase db reset --local` → **9/9 migrations rejouées depuis une base vide** ; `supabase migration list --local` → local == remote (`supabase_migrations.schema_migrations`) avant et après reset ; `supabase db lint --local` → **aucune erreur de schéma** ; `supabase db advisors --local --type all` → **0 WARN, 0 ERROR** (37 INFO au niveau `info` : `rls_enabled_no_policy` ×15 — voulu, Phase 4 — et `unused_index` ×22 — artefact base 0-trafic) ; `10_schema_tests.sql` exécuté directement sur le `DB_URL` de `supabase status` avec les rôles réels `anon`/`authenticated`/`service_role` et le vrai `auth.uid()` → **35/35** ; `npm test` 19/19 ; `tsc -b` OK. Une exécution antérieure ayant conclu à tort à l'absence de Docker a été corrigée ; celle-ci (Docker réel, PG 17 réel) fait foi.
- `pgcrypto` déplacé dans le schéma **`extensions`** (jamais `public`) — élimine le finding advisor `extension_in_public`. `gen_random_uuid()` reste natif `pg_catalog`.
- **T32** : codes d'erreur **stricts et non interchangeables** — `p_fiche` SQL NULL ⇒ `null_value_not_allowed` (22004) ; JSON racine non-objet, y compris `'null'::jsonb` ⇒ `invalid_parameter_value` (22023) ; objet vide / sans info ⇒ `check_violation` (23514).
- **Statut : « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev ».** Déploiement réel effectué (2026-08-30) sur l'environnement **dev/staging** `sunu-couture-dev` après dry-run revu et confirmation explicite du porteur — voir le bandeau en tête de document et le « Journal des révisions » pour le détail. Aucune donnée réelle de tailleur n'a été ajoutée ; le futur projet de **production** reste à créer après Phase 4.

### Q — Frontière `service_role` (passe statique, point 7) — exigences **bloquantes** Phases 3 & 4
Les fonctions `app_hidden.create_fiche_from_draft` et `app_hidden.provision_workshop` sont exécutables **uniquement** par `service_role` (Edge Function). Contrat, documenté par `COMMENT ON FUNCTION` et **bloquant** pour l'ouverture des Phases 3–4 :
- `p_owner` **ne doit jamais** être fourni librement par le client ;
- `p_workshop_id` **ne doit jamais** être accepté sans autorisation ;
- l'Edge Function **dérive l'identité depuis un JWT vérifié** (jamais un paramètre de requête) ;
- l'Edge Function **vérifie l'appartenance et le rôle** de cet utilisateur **avant** tout appel `service_role`.

---

### R — Réordonnancement et gates cloud après preflight Phase 7 (CAS C confirmé, 2026-09-05)

Trois audits architecturaux successifs, exigés en preflight bloquant avant tout
code de la Phase 7 (`02-PLAN-MIGRATION.md`), ont vérifié l'architecture
**réellement mergée** (Phase 4 `GRANT`/RLS, `AuthProvider`/`RepositoryProvider`,
contrats Repository synchrones, mapping `Fiche` ↔ `public.fiches`, schéma réel
`media_assets`/`modele_medias`, corps exact de `create_fiche_from_draft`) plutôt
que de supposer correcte la séquence documentée « Phase 7 → Phase 8 → Phase 6B ».
Verdict confirmé trois fois : **CAS C — réordonnancement requis**. Cette
correction acte le **graphe d'exécution figé**, remplaçant définitivement
l'ancienne séquence partout où elle apparaît dans `02-PLAN-MIGRATION.md`.

**Graphe figé :**
```
7A → 9A → 7B → 8A → 8B → 11A → [Gate VITE_BACKEND=supabase] → 6B0 → 6B
```
La numérotation officielle des phases (héritée du cahier des charges) ne
change pas — seul l'ordre d'exécution change (comme c'était déjà le cas pour
6B/9 avant ce gel).

**1. Split 7A / 7B** — Phase 7 scindée : **7A** livre les fondations cloud
(mappers, cache IndexedDB, contrats async, `SupabaseClientRepository` complet,
`SupabaseFicheRepository` **lecture/update seulement**, `SupabaseCarnetRepository`
**lecture seule** — nécessaire dès 7A car aucune vue SQL ne joint
`carnets.number` à `fiches.carnet_id`, indispensable pour reconstituer
`Fiche.carnetNumero` côté client) sans création de fiche cloud ni activation
globale. **7B** ajoute `SupabaseFicheRepository.add()`, branché sur 9A.

**2. Phase 9A minimale** — sous-ensemble strict de la Phase 9 : `FicheNew`,
`CarnetList.handleAdd`, `ClientDetail.handleNewFiche` (les trois créent
aujourd'hui une fiche vide de façon synchrone et immédiate, vérifié dans le
code) arrêtent de le faire ; brouillon 100 % local, aucun numéro/carnet avant
promotion explicite. Exclut explicitement `ClientPickerSheet`, la reprise de
mesures, l'anti-doublon téléphone et la Phase 10.

**3. Frontière serveur de création métier — Edge Function, pas un wrapper SQL** —
choix architectural définitif : **Edge Function dédiée `create-fiche-from-draft`**
(vérifie le JWT, dérive l'identité, vérifie l'appartenance/le rôle avant tout
appel `service_role`, frontière corr. Q), **pas** un wrapper `public`
`SECURITY INVOKER` comme porte principale — un tel wrapper ne peut par
construction pas vérifier lui-même la provenance du JWT (limite déjà reconnue
par le commentaire de tête de `provision_workshop_api`, qui délègue déjà cette
vérification à l'Edge Function `provision-workshop`). `create_fiche_from_draft`
reste inchangée et reste **exclusivement** la porte de la création métier
**normale** — jamais utilisée pour l'import legacy (voir point 8).

**4. Split 8A / 8B, mapping médias corrigé** — Phase 8 renommée **8A — Médias
fiche** (`Fiche.tissuPhotos`/`signature`/`voiceNote` → `media_assets`,
inchangée sinon). Nouvelle **Phase 8B — Catalogue cloud**, rendue
**obligatoire avant 6B** (la Phase 6A promet explicitement des modèles
importés — voir point 9) : `SupabaseModeleRepository`, médias modèle/patron →
**`modele_medias`** (jamais `media_assets`, dont `fiche_id` est `not null` —
voir corr. D7), correctif `ModeleNew` (même défaut que `FicheNew` avant 9A :
création vide au montage, contrainte SQL `nom` non vide — corrigé dans 8B, pas
dans un sous-lot Phase 9 séparé, plus petit lot cohérent). `modele_medias`
n'a aujourd'hui aucun `GRANT UPDATE` — une migration ciblée
(`GRANT UPDATE (position, metadata)`) sera introduite **au moment de 8B**, si
le besoin de repositionnement se confirme, jamais avant.

**5. Phase 11A minimale, validation explicite du paiement** — nouvelle
sous-phase, obligatoire avant le Gate backend et avant 6B : lecture réelle
(`client_payments`, `fiche_balances`, déjà accordées Phase 2/4), écriture =
action explicite. **`AvanceChampCell` déclenche aujourd'hui `onChange` à
chaque frappe** (vérifié dans `FichePaiementCells.tsx`) — un branchement naïf
sur un `add()` réseau créerait plusieurs versements pour un seul montant tapé
(ex. « 5000 » → 4 lignes), interdit sur un ledger insert-only sans
`UPDATE`/`DELETE`. 11A introduit un état local non commité + un commit
explicite unique (`add({ficheId, amount, paidAt?, method?, note?}): Promise<Payment>`),
sans construire l'UX historique complète (reste Phase 11).

**6. Gate d'activation `VITE_BACKEND=supabase`** — activable sur un Preview
seulement quand **7B ET 8A ET 8B ET 11A** sont terminées (pas seulement 7B+8A) :
à ce moment, tous les domaines consommés par les écrans existants (clients,
fiches, carnets, médias fiche, paiements, modèles, médias modèle) sont
cloud-cohérents simultanément. Un backend activé plus tôt (ex. après 7B+8A
seuls) ferait tourner `SupabaseFicheRepository` avec `LocalStoragePaymentRepository`/
`LocalStorageModeleRepository` simultanément — le solde afficherait 0 F et le
catalogue serait invisible, silencieusement. **6B n'est pas nécessaire pour ce
gate** — le smoke-test utilise un atelier de test vide, créé via le flux
normal (9A/7B).

**7. Phase 6B — import complet, aucune exclusion des modèles** — la
Phase 6A promet explicitement « X clients, Y fiches, **Z modèles** importés » ;
transformer cette prévisualisation en promesse fausse est rejeté. Phase 6B
importe **toutes** les données métier réelles prévisualisées : `clients` →
`carnets` → `fiches` → `client_payments` → médias fiches → **`modeles`** →
médias modèles/patrons. Seuls les éléments classés `demo` (corr. G) restent
exclus.

**8. Phase 6B0 — infrastructure d'import sécurisé (nouvelle phase, distincte
de la création métier normale)** — `create_fiche_from_draft` n'accepte **aucun
numéro explicite** (elle alloue toujours `next_number`) : rejouer un carnet
legacy `1, 2, 5` via 3 appels produirait `1, 2, 3`, numéros perdus — **interdite
pour l'import**. De plus, `service_role` n'a **aucun privilège de table direct
généralisé** sur le projet réel (vérifié : seul un `GRANT SELECT` ciblé sur
`public.workshops` existe, ajouté pour `provision_workshop_api`) — une Edge
Function d'import ne peut donc pas faire de simples `INSERT` bruts. 6B0 livre :
- une Edge Function `import-legacy-data` (JWT vérifié, appartenance/rôle owner
  vérifiés, jamais de `workshop_id` accepté aveuglément) ;
- des fonctions **`app_hidden.import_legacy_*`** (`carnet`/`fiche`/`client`/
  `modele`/`payment`/**`media_asset`**/**`modele_media`**) `SECURITY DEFINER`,
  `EXECUTE` → `service_role` seul, `search_path` sécurisé, symétriques à
  `create_fiche_from_draft`/`provision_workshop` ;
- préservation stricte des numéros/carnets legacy (numéro fourni explicitement,
  `next_number = MAX(legacy) + 1` calculé en une fois, pas incrémentalement) ;
- **écriture table vs upload fichier, jamais confondus** : `service_role` n'a
  (voir plus haut) aucun `INSERT` brut sur les tables métier — un média importé
  suit donc deux étapes distinctes, jamais l'une sans l'autre : l'Edge Function
  uploade le fichier dans Storage privé (chemin déterministe, point 9) **via
  l'API Storage**, puis appelle `app_hidden.import_legacy_media_asset(...)`
  (médias fiche → `public.media_assets`) ou `app_hidden.import_legacy_modele_media(...)`
  (médias modèle → `public.modele_medias`) pour créer/retrouver la ligne DB —
  jamais un `INSERT` brut `service_role` dans l'une ou l'autre table ;
- une **migration SQL de durcissement de l'idempotence** (seule migration de
  tout ce graphe, justifiée par un manque réel, pas créée par défaut) — voir
  point 9.

**9. Idempotence — le serveur est l'autorité, pas `migrationMap`** — acté
définitivement : `migrationMap` (IndexedDB) est un **accélérateur et un état
de reprise local**, jamais l'autorité d'idempotence. Effacer IndexedDB,
changer d'appareil, ou crasher entre l'`INSERT` serveur et l'écriture de la
map ne doit **jamais** produire de doublon — seule une garantie **serveur**
(contrainte `UNIQUE` + fonction idempotente sous verrou advisory) protège ce
cas. Vérifié sur le schéma réel :
  - `fiches_legacy_id_idx` est aujourd'hui un **index simple, pas `UNIQUE`**
    (`20260829120100_create_core_schema.sql`) — remplacé en 6B0 par
    `unique (workshop_id, (metadata->>'legacy_id')) where metadata ? 'legacy_id'`.
  - `clients` n'a **aucune** clé d'idempotence aujourd'hui — le téléphone
    (`phone_e164`) est **insuffisant seul** (absent/malformé, plusieurs
    identités legacy possibles, stratégie hybride D4) — 6B0 ajoute le même
    index `UNIQUE` partiel sur `metadata->>'legacy_id'`.
  - `public.modeles` **ne possède aujourd'hui aucune colonne `metadata`**
    (vérifié dans le schéma réel — seules `id/workshop_id/nom/created_at/
    updated_at/deleted_at` existent). 6B0 **ajoute** `metadata jsonb not null
    default '{}'::jsonb` à `modeles`, puis le même index `UNIQUE` partiel sur
    `metadata->>'legacy_id'` (le `nom` seul n'est pas fiable — deux modèles
    peuvent porter le même nom). `database.types.ts` sera régénéré à ce moment.
  - `carnets` n'a besoin d'**aucun** ajout — `unique (workshop_id, number)`
    (déjà en Phase 2) est la clé naturelle, `number` = `carnetNumero` legacy
    verbatim.
  - `client_payments` n'a pas de clé propre mais une garantie **obligatoire**
    (pas optionnelle) : `unique (fiche_id) where metadata->>'source' =
    'legacy_import'` — D6 garantit au plus un versement importé par fiche ;
    protège un retry après crash, une reprise sur un second appareil, ou un
    appel concurrent.
  - `media_assets`/`modele_medias` : `storage_path` est **déjà** `UNIQUE`
    (Phase 2) — suffisant **à condition** que le chemin d'upload soit
    **déterministe**, dérivé d'un segment sûr (id legacy de l'entité + type de
    média + index ordinal), **jamais** une chaîne legacy brute non assainie ni
    un id aléatoire régénéré à chaque tentative. Aucune migration nécessaire
    pour les médias — `import_legacy_media_asset`/`import_legacy_modele_media`
    doivent être écrites en conséquence (`storage_path` absent → créer la
    ligne ; déjà présent pour cette donnée importée → retrouver/retourner la
    ligne existante ; jamais une seconde ligne avec un nouveau chemin lors
    d'un retry) — signatures SQL détaillées non fixées au-delà de ce contrat.

**10. Aucune implémentation dans ce gel** — cette correction R est purement
documentaire. Aucun code, aucune migration SQL, aucune Edge Function n'a été
créé. L'implémentation démarre par la Phase 7A, sur instruction explicite
ultérieure du porteur.

---

## Récapitulatif des impacts sur le schéma PostgreSQL

| Table | Colonnes / contraintes issues des décisions |
|---|---|
| `clients` | `display_name not null`, `first_name`, `last_name`, `nickname`, `phone_e164`, `phone_display`, `metadata jsonb`, `deleted_at` ; index unique partiel `(workshop_id, phone_e164) where phone_e164 is not null and deleted_at is null` ; **`unique (workshop_id, id)`** (corr. K) |
| `fiches` | `status` enum `received/sewing/ready/delivered` ; `state` enum **`active/cancelled/archived`** (plus de `draft` — corr. L) ; `client_id` **nullable** ; `metadata jsonb` ; **pas** de `late` ni de **`signature_path`** (corr. N) ; **`unique (workshop_id, id)`** ; FK composites `(workshop_id, carnet_id)` et `(workshop_id, client_id)` (corr. K) |
| `carnets` | `number`, `next_number int not null default 1`, `status`, `unique (workshop_id, number)`, **`unique (workshop_id, id)`** |
| `client_payments` | `amount integer not null check (amount > 0)` (D6), `paid_at timestamptz null`, `recorded_at not null default now()`, `method`, `note`, `metadata jsonb` ; FK composite `(workshop_id, fiche_id)` |
| `media_assets` | `type` enum, `mime_type`, `size_bytes`, `storage_path`, `metadata jsonb` ; **1 signature max/fiche** (`unique … where type='signature'`, corr. N) ; FK composite `(workshop_id, fiche_id)` **NOT NULL** — **médias de FICHE uniquement** (corr. R), jamais de média de modèle |
| `modeles` | **`nom text not null check (length(btrim(nom)) between 1 and 200)`** (corr. M) ; `unique (workshop_id, id)` ; **`metadata jsonb` pas encore ajoutée** — prévue en Phase 6B0 (`legacy_id` + index `unique` partiel, corr. R) |
| `modele_medias` | FK composite `(workshop_id, modele_id)` ; `kind` ∈ `photo`/`patron`, `storage_path` **`unique`**, `position`, `metadata jsonb` — **médias de MODÈLE uniquement** (corr. R), indépendante de `media_assets` |
| `sync_conflicts` | `fiche_id`, `local_version`, `remote_version`, `conflicting_fields jsonb`, `detected_at`, `resolution_state` ; FK composite `(workshop_id, fiche_id)` |
| `workshops` | `owner_id` (**source canonique**, corr. O), `is_demo boolean not null default false` |
| `workshop_members` | `role` enum `owner/assistant` ; ligne `owner` tenue synchrone d'`owner_id` par déclencheurs (corr. O) ; RLS non récursive |
| `subscription_plans` | tables créées **sans seed** (corr. I) |
| `subscriptions` / `subscription_transactions` / `promo_codes` | écriture retirée aux rôles clients (corr. H) |

Schéma privé **`app_hidden`** (hors `[api].schemas`) — **6 fonctions** (`allocate_fiche_number` **supprimée**) :
- `set_updated_at()` — trigger, `search_path=''` ; aucun grant
- `sync_owner_membership()` / `protect_owner_membership()` — triggers `security definer` (corr. O) ; aucun grant
- `current_workshop_ids()` — `security definer`, `stable`, `search_path=''` ; UNION owner_id ∪ membres ; `EXECUTE` → `authenticated`
- `create_fiche_from_draft(uuid, uuid, jsonb)` — `security definer` ; **SEULE porte de la création métier NORMALE** (jamais l'import legacy — corr. R, Phase 6B0) — attribution de numéro + création de fiche ; règle métier anti-fiche-vide ; `EXECUTE` → `service_role`, appelée par l'Edge Function `create-fiche-from-draft` (corr. L, Q, R)
- `provision_workshop(uuid, text)` — `security definer` ; `EXECUTE` → `service_role` (corr. O)
- *(Phase 6B0, à venir)* `import_legacy_carnet`/`import_legacy_fiche`/`import_legacy_client`/`import_legacy_modele`/`import_legacy_payment`/**`import_legacy_media_asset`**/**`import_legacy_modele_media`** — `security definer`, `EXECUTE` → `service_role` seul, `search_path` sécurisé, chemin distinct pour l'import legacy avec numéros explicites (corr. R). Les deux dernières créent/retrouvent une ligne `media_assets`/`modele_medias` après qu'un fichier a été **uploadé séparément par l'Edge Function dans Storage privé** (chemin déterministe) — l'upload Storage n'est jamais une écriture PostgreSQL, et ces fonctions n'insèrent jamais en double lors d'un retry (idempotentes sur `storage_path`). **Non créées à ce jour**, documentées ici par anticipation.
- `COMMENT ON FUNCTION` sur `create_fiche_from_draft` et `provision_workshop` : frontière `service_role` (corr. Q).

RLS **activée** (sans `GRANT` ni politique) sur les 15 tables en Phase 2 ; `GRANT` explicites + politiques en Phase 4 (même migration — voir corr. E).
`anon` : **aucun `USAGE`** sur `app_hidden`. Aucune fonction sensible `app_hidden` n'accorde `EXECUTE` à `PUBLIC` / `anon` / `authenticated` (corr. P — pas d'ADP schema-scoped, enforcement per-fonction, test T30).

---

## Journal des révisions

| Date | Décision | Changement |
|---|---|---|
| 2026-08-29 (matin) | D1–D11, A–G | Version initiale, validée après acceptation de l'audit Phase 1. |
| 2026-08-29 (soir) | D1 | Projet réel `sunu-couture-dev` (ref `nffcdygtqzlivsresuuk`, `eu-west-1`, PG 17) ; clés API modernes (`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, clé secret côté serveur) ; liaison distante interdite jusqu'à validation finale ; migrations en **format horodaté** CLI. |
| 2026-08-29 (soir) | D6 | `client_payments.amount` : `CHECK (amount > 0)` (justifié). |
| 2026-08-29 (soir) | D9 | `allocate_fiche_number` déplacée dans `app_hidden`, `status = 'full'`. |
| 2026-08-29 (soir) | E, **H**, **I**, **J** | Anti-récursion `workshop_members` précisée (UPDATE `USING`+`WITH CHECK`) ; durcissement schéma reproductible (RLS en migration, `rls_auto_enable` révoqué, `app_hidden`, `security_invoker` sur les vues) ; seed abonnement retiré ; garde anti-déploiement-auto. |
| 2026-08-29 (nuit) | **K–P** ; statut Phase 2 = « candidate » | **K** FK composites `(workshop_id, id)` pour 6 relations + `UNIQUE (workshop_id, id)` sur 4 parents. **L** brouillon 100 % local, `fiche_state` sans `'draft'`, `app_hidden.create_fiche_from_draft()` transactionnel. **M** `modeles.nom` non vide. **N** `fiches.signature_path` supprimée → `media_assets(type='signature')`, 1/fiche. **O** `workshops.owner_id` canonique, `current_workshop_ids()` = UNION, `provision_workshop()` + déclencheurs anti-divergence. **P** ADP-fonctions = no-op PG (enforcement per-fonction) ; migrations non « CLI-générées » ; Phase 2 close seulement après `db reset` + `migration list --local` + rôles réels + Security/Performance Advisor. |
| 2026-08-29 (passe statique) | **O, L, P, K, Q** | **O** transfert de propriétaire : rétrograder l'ancien **avant** de promouvoir le nouveau, verrous, invariant « un seul owner », `protect_owner_membership` bloque aussi la modif de `workshop_id`/`user_id`. **L** `create_fiche_from_draft` **sans `DEFAULT`** + **règle métier anti-fiche-vide** ; **`allocate_fiche_number` SUPPRIMÉE** (porte unique). **K** index de **préfixe exact** pour les FK composites ; `fiches → carnets` en **`ON DELETE NO ACTION`** (carnet non supprimable si fiches ; `DELETE workshops` propre). **P** `ALTER DEFAULT PRIVILEGES` schema-scoped **retiré** ; enforcement per-fonction + T30 étendu (anon **et** authenticated). **Q** frontière `service_role` documentée (`COMMENT ON FUNCTION`) — exigence bloquante Phases 3–4. Tests : 30 → **34 groupes**. |
| 2026-08-30 (validation CLI, repli) | **statut, P, H, tests** | Supabase CLI **2.116.0** installée en dev-dep exacte ; première validation via `--db-url` sur Postgres nu (Docker diagnostiqué — à tort — comme absent) : `migration up --include-all` **9/9**, `db advisors` **0 WARN/0 ERROR** (INFO attendus), **35/35** tests SQL, rollback `migrations_down/` 0 résidu. `db lint` bloqué (`plpgsql_check` absent). Corrigé : `pgcrypto` → schéma **`extensions`** ; shim `rls_auto_enable()` reçoit `search_path=''` ; **T32 codes stricts** (22004 SQL NULL / 22023 racine non-objet dont `'null'` / 23514 objet vide). |
| 2026-08-30 (validation CLI, Docker réel — **remplace la précédente**) | **statut, P, H, tests** | Correction : Docker Desktop est bien accessible (`docker version` confirmé sur Bash et PowerShell) — la validation de repli est **remplacée** par une exécution réelle sur `supabase start` + `db reset --local`, image `supabase/postgres:17.6.1.165` (**PostgreSQL 17.6**) : **9/9** migrations rejouées depuis une base vide, `migration list --local` local==remote, `db lint --local` sans erreur, `db advisors --local` **0 WARN/0 ERROR** (37 INFO), **35/35** tests SQL avec les vrais rôles Supabase et le vrai `auth.uid()` (compatible sans adaptation — `auth.uid()` lit `request.jwt.claim.sub` en priorité), `npm test` 19/19, `tsc -b` OK. `public.rls_auto_enable()`/`ensure_rls` confirmés **absents** de l'image Supabase locale (spécifiques à la plateforme distante) → T35 SKIP, comportement attendu. **Statut : « Phase 2 candidate — déploiement dev distant en attente ».** `git diff --stat` = `package.json` +1, `package-lock.json` +222 (installation CLI, seule trace dans `src/`-adjacent). |
| 2026-08-29 (2ᵉ passe ciblée) | **L, H** | **L** anti-fiche-vide **NULL-safe** : `p_fiche IS NULL` → `null_value_not_allowed` ; `jsonb_typeof(p_fiche) <> 'object'` → `invalid_parameter_value` ; termes strictement booléens (`nullif(btrim(<txt>, E' \t\n\r\f\v'), '') is not null`) ; `jsonb_each` gardé par `CASE` (tableau/scalaire → FALSE sans erreur) ; `IF v_significatif IS NOT TRUE THEN RAISE`. **H** nouvelle **migration dédiée `20260829120800_secure_rls_auto_enable.sql`** : `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated` via `to_regprocedure()`/`to_regrole()` (compatible « absent ») ; **event trigger `ensure_rls` NON supprimé/désactivé** ; `.down` = no-op ; test **T35**. Tests : 34 → **35 groupes**. Migrations : 8 → **9**. |
| 2026-08-30 (correction documentaire, aucun changement SQL/applicatif) | **D1, E/H (Phase 4), P (provenance), correspondance schéma (subscriptions)** | **D1** règle dev/prod clarifiée sans contradiction : `sunu-couture-dev` = **dev/staging** ; après validation locale complète, `supabase link` + `db push --dry-run` autorisés ; `db push` réel seulement après revue du dry-run + confirmation explicite du porteur ; aucune donnée réelle de tailleur avant la Phase 4 ; futur **projet de production** créé/modifié seulement après RLS + isolation + pilote. **E/H** Phase 4 documentée comme livrant `GRANT` explicites (authenticated) + aucun accès métier `anon` + politiques RLS + droits différenciés owner/assistant + droits séquences le cas échéant, **dans la même migration** — rappel que `GRANT` et RLS sont deux couches distinctes. **P** provenance des migrations reformulée sans contradiction (rédigées à la main, validées par la CLI réelle sur PG 17, non recréées/renommées ; futures migrations via `supabase migration new`). **Correspondance schéma** (`02-PLAN-MIGRATION.md` §3) : ligne `subscriptions` corrigée — aucune souscription/offre active créée en Phase 2, offres expérimentales reportées Phase 14. **Nouveau statut : « Phase 2 validée localement sur Supabase PostgreSQL 17 — dry-run distant en attente »** (puis, après `db push` distant réussi + advisors distants validés : « Phase 2 clôturée — schéma déployé sur sunu-couture-dev »). |
| 2026-08-30 (déploiement réel + vérification distante) | **statut, tests (T16)** | Dashboard vérifié : intégration GitHub connectée mais « Deploy to production » désactivé (aucun auto-déploiement). `supabase link --project-ref nffcdygtqzlivsresuuk` → `db push --dry-run` (9/9, revue) → **confirmation explicite du porteur** → `db push` réel → **9/9 migrations appliquées** sur `sunu-couture-dev`, `migration list` local==remote. `db advisors --linked` **0 WARN/0 ERROR** (37 INFO identiques au local). Vérifié en base via `db query --linked` (API Management, sans mot de passe) : 15 tables, RLS 15/15, 2 vues `security_invoker`, `app_hidden` = 6 fonctions, `create_fiche_from_draft`/`provision_workshop` = `service_role` seul, le vrai `public.rls_auto_enable()` de la plateforme a `EXECUTE` révoqué pour `anon`/`authenticated`, `ensure_rls` actif, 0 politique RLS métier. **35/35 tests SQL rejoués contre le distant réel** (`db query --linked -f`, `BEGIN…ROLLBACK`) ; 0 ligne résiduelle sur 12 tables vérifiées après coup ; `npm test` 19/19, `tsc -b` OK. **T16 durci** : accepte désormais `0 ligne` **ou** `insufficient_privilege` — le distant réel n'a aucun `GRANT` pour `authenticated` sur les tables métier (refus encore plus strict que le cas local, cohérent avec la Phase 4), revalidé 35/35 en local avant et après. **Nouveau statut : « Phase 2 clôturée — schéma déployé et vérifié sur sunu-couture-dev »**. Aucun commit ni push GitHub. |
| 2026-09-05 (gel du graphe cloud, corr. R — trois audits, CAS C confirmé) | **R ; statut Phase 7 ; D7, D9 (précisions)** | Preflight architectural bloquant avant tout code Phase 7 (exigé par `02-PLAN-MIGRATION.md`) : trois audits successifs de l'architecture réellement mergée (Phase 4 `GRANT`/RLS, `AuthProvider`/`RepositoryProvider`, contrats Repository synchrones, mapping `Fiche`↔`public.fiches`, schéma réel `media_assets`/`modele_medias`, corps exact de `create_fiche_from_draft`) confirment **CAS C — réordonnancement requis**. **Graphe figé** : `7A → 9A → 7B → 8A → 8B → 11A → [Gate VITE_BACKEND=supabase] → 6B0 → 6B`. **7A/7B** : split de la Phase 7 (fondations cloud lecture/update + carnet en lecture seule, puis création). **9A** : sous-ensemble minimal de la Phase 9 (fin de la création de fiche vide au tap), Edge Function `create-fiche-from-draft` retenue comme frontière serveur (pas un wrapper SQL `public`). **8A/8B** : split de la Phase 8 — 8A médias fiche inchangée, **8B catalogue cloud nouvelle et obligatoire avant 6B** (le catalogue de modèles réels reste importé en 6B, aucune exclusion — correction du mapping D7 : médias de fiche → `media_assets`, médias de modèle → `modele_medias`, jamais l'inverse, `fiche_id` étant `not null`). **11A** : nouvelle sous-phase, paiements cloud minimaux avant 6B, avec commit explicite (pas d'écriture par frappe sur `AvanceChampCell`). **Gate `VITE_BACKEND=supabase`** = 7B **ET** 8A **ET** 8B **ET** 11A (pas 7B+8A seules). **6B0** : nouvelle phase, infrastructure d'import legacy distincte de la création métier normale (`create_fiche_from_draft` n'alloue jamais de numéro explicite — interdite pour l'import), fonctions `app_hidden.import_legacy_*` `SECURITY DEFINER`/`service_role`, migration de durcissement de l'idempotence (index `UNIQUE` partiels `legacy_id` sur `clients`/`fiches`, ajout de `modeles.metadata` + `UNIQUE` partiel, `UNIQUE(fiche_id) WHERE metadata->>'source'='legacy_import'` sur `client_payments`, `storage_path` déterministe pour les médias) — présentée à l'époque comme *la seule migration SQL de tout ce graphe* ; **corrigé par l'entrée du 2026-09-05 (implémentation Phase 9A)** ci-dessous, qui a dû en ajouter une seconde, minimale. Principe acté : le serveur est l'autorité d'idempotence, `migrationMap` (IndexedDB) n'est qu'un accélérateur de reprise. **Nouveau statut : « Preflight CAS C confirmé — graphe d'exécution cloud figé, implémentation Phase 7A non commencée »**. Aucun code, aucune migration SQL, aucune Edge Function créés pour ce gel — mise à jour documentaire uniquement, sur `docs/freeze-cloud-migration-graph`. |
| 2026-09-05 (implémentation Phase 9A) | **R (précision — migration technique non anticipée) ; statut Phase 9A** | Implémentation de la Phase 9A (`FicheNew`/`CarnetList.handleAdd`/`ClientDetail.handleNewFiche` ne créent plus de fiche/carnet/numéro à l'ouverture ; brouillon 100 % local `FicheDraft`, `isMeaningfulFicheDraft()` miroir exact de la règle serveur ; Edge Function `create-fiche-from-draft`). **Correction factuelle** à l'entrée précédente (gel du graphe) : contrairement à ce qui était anticipé, **une migration SQL minimale a été nécessaire dès 9A**, pas seulement en 6B0 — `20260905144612_create_fiche_from_draft_api.sql`, ajoutant l'unique wrapper `public.create_fiche_from_draft_api(p_workshop_id, p_client_id, p_fiche)` : `app_hidden` n'étant pas dans `[api].schemas`, un appel PostgREST (y compris depuis une Edge Function via `supabase-js`) vers `app_hidden.create_fiche_from_draft` échouerait (`PGRST106`) sans ce pont — même raison déjà documentée pour `provision_workshop_api` (Phase 3A). Ce wrapper n'est **pas** une API navigateur : `SECURITY INVOKER`, `search_path=''`, `EXECUTE` réservé à `service_role` (jamais `PUBLIC`/`anon`/`authenticated`), aucun `GRANT INSERT` ajouté sur `fiches`/`carnets`, aucune politique RLS supplémentaire (T56/T57, `10_schema_tests.sql`, 57 groupes) ; il ne duplique aucune règle métier (relais intégral de `app_hidden.create_fiche_from_draft`, déjà testée T32/T33). La frontière de sécurité réelle reste l'Edge Function elle-même : JWT vérifié (`getClaims`) → appartenance/rôle (`owner`/`assistant`) via un client **scopé au JWT appelant** (RLS, jamais le client `service_role`) → client du brouillon vérifié dans le même atelier (RLS) → **alors seulement** l'appel privilégié. Validé en local : `db reset --local` (13 migrations dont la nouvelle), `db lint --local` 0 erreur, **57/57 groupes SQL** (dont T56/T57 nouveaux), Edge Function testée via `scripts/test-create-fiche-from-draft.mjs` (22/22, deux utilisateurs de test réels — second numéro `[auth.sms.test_otp]` ajouté pour ce script), `npx tsc -b` 0 erreur, `npm run lint` 0 nouvel avertissement, `npm test` **369/369**. Aucun déploiement distant, aucune activation de `VITE_BACKEND=supabase`, aucune PR ouverte pour ce tour. **Nouveau statut : « Phase 9A implémentée et validée localement — PR non ouverte »**. |
