-- grants_and_rls_policies (Phase 4)
--
-- Livre, dans la même migration (GRANT et RLS sont deux couches distinctes —
-- sans GRANT, une politique RLS ne rend pas une table accessible par la Data
-- API PostgREST, qui vérifie d'abord le privilège SQL standard) :
--   1. Normalisation déterministe : REVOKE explicite de tout privilège client
--      sur les 15 tables + 2 vues, table par table (jamais ALL TABLES IN
--      SCHEMA, jamais ALTER DEFAULT PRIVILEGES) — la stack Docker locale
--      accorde par défaut un CRUD complet à anon/authenticated/service_role,
--      absent du bootstrap distant réel ; ce REVOKE fait converger les deux
--      environnements vers le même point de départ avant de ré-accorder.
--   2. GRANT explicites minimaux pour `authenticated` uniquement, table par
--      table et colonne par colonne où une restriction de colonne est
--      nécessaire à l'immutabilité (tenant, identifiants, numéros attribués).
--      AUCUN GRANT métier pour `anon`.
--   3. Politiques RLS séparées par opération (jamais `for all`), toutes
--      `to authenticated`, isolation via `app_hidden.current_workshop_ids()`
--      (SECURITY DEFINER/STABLE/search_path='', créée en Phase 2) sauf sur
--      `workshop_members` (politiques non récursives, correction E :
--      `user_id = auth.uid()` pour sa propre ligne, `EXISTS` direct sur
--      `workshops.owner_id` pour la gestion par l'owner — jamais une
--      politique qui relit `workshop_members`).
--
-- AUCUNE politique ne relit la table sur laquelle elle s'applique.
-- L'immutabilité de `workshop_id` (et de tout identifiant/numéro attribué)
-- repose sur l'ABSENCE de la colonne dans le GRANT UPDATE, jamais sur une
-- sous-requête WITH CHECK qui recomparerait l'ancienne valeur en relisant la
-- table — un `WITH CHECK` normal suffit à empêcher qu'une ligne quitte
-- l'ensemble des ateliers courants de l'utilisateur, et le privilège de
-- colonne empêche structurellement tout changement de `workshop_id` avant
-- même que la politique ne soit évaluée.
--
-- AUCUNE fonction SECURITY DEFINER ni trigger nouveaux. AUCUN privilège de
-- `service_role` modifié (son seul GRANT métier direct, `SELECT` sur
-- `public.workshops`, date de la migration précédente et reste intact).
--
-- FERMÉES ENTIÈREMENT (aucun GRANT, aucune politique) :
--   - `sync_conflicts` : aucune fonction/Edge Function ne crée encore de
--     conflit de synchronisation (Phase 12) — moindre privilège, rouvrir
--     alors seulement.
--   - `subscription_plans` / `subscriptions` / `subscription_transactions` /
--     `promo_codes` : fermées jusqu'à la Phase 14 (déjà partiellement
--     durcies en Phase 2 ; cette migration complète la fermeture, y compris
--     le SELECT que le bootstrap local laissait subsister).
--
-- PRÉREQUIS NON TRAITÉ ICI (documenté, pas corrigé) : `fiches.version`
-- (verrou optimiste) n'est incrémenté par aucun trigger ni aucune fonction
-- existante (vérifié : seul `trg_fiches_updated_at` existe sur `fiches`, et
-- ne touche que `updated_at`). Un mécanisme d'incrémentation devra exister
-- AVANT que la Phase 5/12 n'implémente un `UPDATE ... WHERE version = $base`
-- — hors périmètre de cette migration, `version` est donc exclue de tout
-- GRANT UPDATE ci-dessous (immuable par ce chemin, comme les autres
-- identifiants).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NORMALISATION DÉTERMINISTE — REVOKE explicite, table par table
-- ═══════════════════════════════════════════════════════════════════════════
revoke all privileges on table public.workshops                 from anon, authenticated;
revoke all privileges on table public.workshop_members          from anon, authenticated;
revoke all privileges on table public.carnets                    from anon, authenticated;
revoke all privileges on table public.clients                    from anon, authenticated;
revoke all privileges on table public.fiches                     from anon, authenticated;
revoke all privileges on table public.client_payments            from anon, authenticated;
revoke all privileges on table public.media_assets               from anon, authenticated;
revoke all privileges on table public.modeles                    from anon, authenticated;
revoke all privileges on table public.modele_medias              from anon, authenticated;
revoke all privileges on table public.subscription_plans         from anon, authenticated;
revoke all privileges on table public.subscriptions              from anon, authenticated;
revoke all privileges on table public.subscription_transactions  from anon, authenticated;
revoke all privileges on table public.promo_codes                from anon, authenticated;
revoke all privileges on table public.sync_conflicts              from anon, authenticated;
revoke all privileges on table public.reminders                  from anon, authenticated;
revoke all privileges on table public.fiches_view                 from anon, authenticated;
revoke all privileges on table public.fiche_balances              from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. GRANT explicites minimaux — `authenticated` uniquement
-- ═══════════════════════════════════════════════════════════════════════════

-- workshops : lecture des ateliers dont l'utilisateur est membre ; seul le
-- nom est modifiable, par l'owner (politique). id/owner_id/created_at/is_demo
-- hors GRANT — is_demo n'a aucun besoin métier documenté justifiant une
-- écriture par authenticated ; le transfert de propriété n'a aucun chemin
-- callable actuel (sync_owner_membership est un trigger réactif, pas une API).
grant select on table public.workshops to authenticated;
grant update (name) on table public.workshops to authenticated;

-- workshop_members : lecture (soi-même + son atelier si owner), l'owner peut
-- ajouter/retirer des assistants (jamais promouvoir/rétrograder un rôle) —
-- aucun GRANT UPDATE du tout : aucune modification directe de rôle.
grant select, insert, delete on table public.workshop_members to authenticated;

-- carnets : lecture + changement de statut (archivage) uniquement. Aucune
-- création/suppression directe — effet de bord exclusif de
-- app_hidden.create_fiche_from_draft (SECURITY DEFINER, service_role).
grant select on table public.carnets to authenticated;
grant update (status) on table public.carnets to authenticated;

-- clients : lecture, création, mise à jour des champs d'identité/contact
-- uniquement. id/workshop_id/created_at hors GRANT (immuables).
grant select, insert on table public.clients to authenticated;
grant update (display_name, first_name, last_name, nickname, phone_e164, phone_display, metadata, deleted_at)
  on table public.clients to authenticated;

-- fiches : lecture + mise à jour des champs métier uniquement. AUCUN INSERT
-- (seule porte : create_fiche_from_draft, SECURITY DEFINER, service_role).
-- id/workshop_id/carnet_id/client_id/number/page_number/slot_number/version
-- hors GRANT — client_id et version explicitement exclus (immuables par ce
-- chemin ; version : voir note de tête, aucun mécanisme d'incrémentation
-- n'existe encore).
grant select on table public.fiches to authenticated;
grant update (status, measurements, garment, description, fabric_notes, quantity, due_date, total_price, settled_at, metadata, deleted_at)
  on table public.fiches to authenticated;

-- client_payments : lecture + création uniquement. Un versement est
-- IMMUABLE après insertion (aucun UPDATE, aucun DELETE) — une correction
-- future nécessitera un mécanisme explicite de contre-écriture, hors
-- périmètre de cette migration.
grant select, insert on table public.client_payments to authenticated;

-- media_assets : lecture, création, et mise à jour limitée aux métadonnées /
-- suppression logique. Aucun DELETE physique.
grant select, insert on table public.media_assets to authenticated;
grant update (metadata, deleted_at) on table public.media_assets to authenticated;

-- modeles : lecture, création, mise à jour du nom / suppression logique.
grant select, insert on table public.modeles to authenticated;
grant update (nom, deleted_at) on table public.modeles to authenticated;

-- modele_medias : attacher/détacher un média d'un modèle. Aucun UPDATE —
-- aucune nécessité démontrée (repositionnement non implémenté côté front).
grant select, insert, delete on table public.modele_medias to authenticated;

-- reminders : gestion complète (paramétrage opérationnel, pas administratif)
-- mais UPDATE restreint aux colonnes réellement modifiables par l'écran de
-- réglages — id/workshop_id/type/created_at hors GRANT.
grant select, insert, delete on table public.reminders to authenticated;
grant update (at_time, enabled, sound) on table public.reminders to authenticated;

-- Vues dérivées (security_invoker = on, Phase 2) : la RLS des tables
-- sous-jacentes s'applique à l'appelant, mais un GRANT de vue reste
-- nécessaire (privilège indépendant des tables sources).
grant select on table public.fiches_view    to authenticated;
grant select on table public.fiche_balances to authenticated;

-- sync_conflicts, subscription_plans, subscriptions, subscription_transactions,
-- promo_codes : AUCUN GRANT pour authenticated ni anon — entièrement fermées
-- (voir notes de tête). RLS déjà activée sans policy = refus par défaut.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. POLITIQUES RLS — une par opération, jamais `for all`, `to authenticated`
-- ═══════════════════════════════════════════════════════════════════════════

-- ── workshops ────────────────────────────────────────────────────────────
create policy workshops_select_member on public.workshops
  for select to authenticated
  using (id in (select app_hidden.current_workshop_ids()));

create policy workshops_update_owner on public.workshops
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ── workshop_members (correction E — non récursive) ─────────────────────
-- Une seule politique SELECT (fusion demandée par l'advisor Performance
-- "multiple_permissive_policies" : deux politiques permissives distinctes
-- pour la même action/le même rôle sont évaluées et combinées par un OR à
-- chaque requête — les fusionner en une seule condition OR évite ce coût
-- sans changer le résultat) : sa propre ligne, OU toutes les lignes de son
-- atelier si owner.
create policy workshop_members_select on public.workshop_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.workshops w
      where w.id = workshop_members.workshop_id and w.owner_id = (select auth.uid())
    )
  );

create policy workshop_members_insert_owner on public.workshop_members
  for insert to authenticated
  with check (
    role = 'assistant'
    and exists (
      select 1 from public.workshops w
      where w.id = workshop_members.workshop_id and w.owner_id = (select auth.uid())
    )
  );

create policy workshop_members_delete_owner on public.workshop_members
  for delete to authenticated
  using (
    role = 'assistant'
    and exists (
      select 1 from public.workshops w
      where w.id = workshop_members.workshop_id and w.owner_id = (select auth.uid())
    )
  );

-- ── carnets ──────────────────────────────────────────────────────────────
create policy carnets_select_member on public.carnets
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy carnets_update_member on public.carnets
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── clients ──────────────────────────────────────────────────────────────
create policy clients_select_member on public.clients
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy clients_insert_member on public.clients
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy clients_update_member on public.clients
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── fiches (aucune politique INSERT/DELETE) ─────────────────────────────
create policy fiches_select_member on public.fiches
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy fiches_update_member on public.fiches
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── client_payments (SELECT + INSERT seulement) ─────────────────────────
create policy client_payments_select_member on public.client_payments
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy client_payments_insert_member on public.client_payments
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── media_assets ─────────────────────────────────────────────────────────
create policy media_assets_select_member on public.media_assets
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy media_assets_insert_member on public.media_assets
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy media_assets_update_member on public.media_assets
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── modeles ──────────────────────────────────────────────────────────────
create policy modeles_select_member on public.modeles
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy modeles_insert_member on public.modeles
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy modeles_update_member on public.modeles
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── modele_medias (SELECT + INSERT + DELETE, aucun UPDATE) ──────────────
create policy modele_medias_select_member on public.modele_medias
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy modele_medias_insert_member on public.modele_medias
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy modele_medias_delete_member on public.modele_medias
  for delete to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

-- ── reminders (CRUD complet, UPDATE limité par colonne) ─────────────────
create policy reminders_select_member on public.reminders
  for select to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

create policy reminders_insert_member on public.reminders
  for insert to authenticated
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy reminders_update_member on public.reminders
  for update to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()))
  with check (workshop_id in (select app_hidden.current_workshop_ids()));

create policy reminders_delete_member on public.reminders
  for delete to authenticated
  using (workshop_id in (select app_hidden.current_workshop_ids()));

-- sync_conflicts, subscription_plans, subscriptions, subscription_transactions,
-- promo_codes : AUCUNE politique — RLS activée sans GRANT ni policy = refus
-- par défaut, intentionnel (voir notes de tête).
