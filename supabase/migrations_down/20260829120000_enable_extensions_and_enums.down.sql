-- Rollback de 20260829120000_enable_extensions_and_enums
drop type if exists public.sync_conflict_state;
drop type if exists public.subscription_txn_status;
drop type if exists public.subscription_plan_period;
drop type if exists public.subscription_status;
drop type if exists public.payment_method;
drop type if exists public.media_type;
drop type if exists public.fiche_status;
drop type if exists public.fiche_state;
drop type if exists public.carnet_status;
drop type if exists public.workshop_role;
drop schema if exists app_hidden cascade;
-- pgcrypto / schéma `extensions` laissés en place (image Supabase les fournit d'office).
