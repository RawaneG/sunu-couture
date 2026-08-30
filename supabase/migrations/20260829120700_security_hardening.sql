-- security_hardening
-- Durcissement transverse. Idempotent, tolérant à l'absence des objets (Postgres
-- nu de test / image Supabase selon version).
--
-- NB : la sécurisation de `public.rls_auto_enable()` est dans sa propre migration
--      dédiée `20260829120800_secure_rls_auto_enable.sql`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables de facturation : aucune écriture par les rôles clients. La RLS
--    (Phase 4) ajoutera les politiques de LECTURE nécessaires (plans, propre
--    abonnement). Les transactions et codes promo restent hors de portée totale
--    des rôles clients — gérés par `owner` via Edge Function (service_role).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  has_anon bool := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth bool := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if has_anon then
    revoke insert, update, delete on public.subscription_plans        from anon;
    revoke insert, update, delete on public.subscriptions             from anon;
    revoke all                    on public.subscription_transactions from anon;
    revoke all                    on public.promo_codes               from anon;
  end if;
  if has_auth then
    revoke insert, update, delete on public.subscription_plans        from authenticated;
    revoke insert, update, delete on public.subscriptions             from authenticated;
    revoke all                    on public.subscription_transactions from authenticated;
    revoke all                    on public.promo_codes               from authenticated;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rappel : les fonctions app_hidden.* ont déjà leurs droits verrouillés
--    (revoke explicite dans la même transaction que chaque CREATE FUNCTION,
--    20260829120400). Blanket supplémentaire : rien d'exécutable par défaut
--    dans app_hidden pour public.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on all functions in schema app_hidden from public;
