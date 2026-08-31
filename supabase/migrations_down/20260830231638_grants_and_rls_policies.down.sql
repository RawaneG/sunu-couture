-- grants_and_rls_policies (Phase 4) — rollback
--
-- Rollback de SÉCURITÉ vers un état client entièrement fermé : sûr, mais PAS
-- un retour au bootstrap CRUD automatique de la stack Docker locale (cet état
-- n'a jamais existé côté distant et n'est reconstruit par aucun rollback
-- applicatif). Aucun changement à `service_role` (son GRANT SELECT sur
-- `public.workshops`, migration précédente, reste intact). RLS JAMAIS
-- désactivée — seules les policies et les GRANT ajoutés par la migration
-- correspondante sont retirés.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. DROP POLICY — tables uniquement (aucune politique n'existe sur les vues)
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists reminders_delete_member       on public.reminders;
drop policy if exists reminders_update_member       on public.reminders;
drop policy if exists reminders_insert_member       on public.reminders;
drop policy if exists reminders_select_member       on public.reminders;

drop policy if exists modele_medias_delete_member   on public.modele_medias;
drop policy if exists modele_medias_insert_member   on public.modele_medias;
drop policy if exists modele_medias_select_member   on public.modele_medias;

drop policy if exists modeles_update_member         on public.modeles;
drop policy if exists modeles_insert_member         on public.modeles;
drop policy if exists modeles_select_member         on public.modeles;

drop policy if exists media_assets_update_member    on public.media_assets;
drop policy if exists media_assets_insert_member    on public.media_assets;
drop policy if exists media_assets_select_member    on public.media_assets;

drop policy if exists client_payments_insert_member on public.client_payments;
drop policy if exists client_payments_select_member on public.client_payments;

drop policy if exists fiches_update_member          on public.fiches;
drop policy if exists fiches_select_member          on public.fiches;

drop policy if exists clients_update_member         on public.clients;
drop policy if exists clients_insert_member         on public.clients;
drop policy if exists clients_select_member         on public.clients;

drop policy if exists carnets_update_member         on public.carnets;
drop policy if exists carnets_select_member         on public.carnets;

drop policy if exists workshop_members_delete_owner on public.workshop_members;
drop policy if exists workshop_members_insert_owner on public.workshop_members;
drop policy if exists workshop_members_select        on public.workshop_members;

drop policy if exists workshops_update_owner        on public.workshops;
drop policy if exists workshops_select_member       on public.workshops;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. REVOKE — miroir exact du GRANT (listes de colonnes complètes)
-- ═══════════════════════════════════════════════════════════════════════════
revoke update (at_time, enabled, sound) on table public.reminders from authenticated;
revoke select, insert, delete on table public.reminders from authenticated;

revoke select, insert, delete on table public.modele_medias from authenticated;

revoke update (nom, deleted_at) on table public.modeles from authenticated;
revoke select, insert on table public.modeles from authenticated;

revoke update (metadata, deleted_at) on table public.media_assets from authenticated;
revoke select, insert on table public.media_assets from authenticated;

revoke select, insert on table public.client_payments from authenticated;

revoke update (status, measurements, garment, description, fabric_notes, quantity, due_date, total_price, settled_at, metadata, deleted_at)
  on table public.fiches from authenticated;
revoke select on table public.fiches from authenticated;

revoke update (display_name, first_name, last_name, nickname, phone_e164, phone_display, metadata, deleted_at)
  on table public.clients from authenticated;
revoke select, insert on table public.clients from authenticated;

revoke update (status) on table public.carnets from authenticated;
revoke select on table public.carnets from authenticated;

revoke select, insert, delete on table public.workshop_members from authenticated;

revoke update (name) on table public.workshops from authenticated;
revoke select on table public.workshops from authenticated;

revoke select on table public.fiches_view    from authenticated;
revoke select on table public.fiche_balances from authenticated;

-- sync_conflicts, subscription_plans, subscriptions, subscription_transactions,
-- promo_codes : aucun GRANT n'aura été accordé par la migration — rien à
-- révoquer ici.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — jamais désactivée. `service_role` — jamais touché.
-- ═══════════════════════════════════════════════════════════════════════════
-- (intentionnellement aucune ligne ici)
