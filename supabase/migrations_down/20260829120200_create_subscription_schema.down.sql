-- Rollback de 20260829120200_create_subscription_schema
drop table if exists public.promo_codes;
drop table if exists public.subscription_transactions;
drop table if exists public.subscriptions;
drop table if exists public.subscription_plans;
