-- create_subscription_schema
-- Abonnement configurable EN BASE (jamais en dur dans le front).
--
-- ⚠️ AUCUN seed ici. Les 4 offres et leurs tarifs (décrits dans le cahier des
-- charges comme « expérimentaux ») ne sont PAS validés métier. Un brouillon non
-- actif est fourni dans supabase/seeds/draft_subscription_plans.sql, NON câblé
-- dans config.toml [db.seed] → `supabase db reset` laisse subscription_plans VIDE.
-- Phase 14 (abonnement) réintroduira des offres validées via une migration dédiée.

-- ─────────────────────────────────────────────────────────────────────────────
create table public.subscription_plans (
  code              text primary key,
  label             text not null,
  period            public.subscription_plan_period not null,
  price_fcfa        integer not null check (price_fcfa >= 0),
  trial_fiche_limit integer check (trial_fiche_limit is null or trial_fiche_limit >= 0),
  is_active         boolean not null default false,   -- rien d'actif tant que non validé
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  workshop_id          uuid not null unique references public.workshops (id) on delete cascade,
  plan_code            text not null references public.subscription_plans (code),
  status               public.subscription_status not null default 'trialing',
  trial_fiche_limit    integer check (trial_fiche_limit is null or trial_fiche_limit >= 0),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_period_end     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_period_order
    check (current_period_end is null
        or current_period_start is null
        or current_period_end >= current_period_start)
);
create index subscriptions_plan_code_idx on public.subscriptions (plan_code);   -- FK couvert

-- Argent versé POUR L'ABONNEMENT — jamais mélangé avec client_payments.
create table public.subscription_transactions (
  id                 uuid primary key default gen_random_uuid(),
  workshop_id        uuid not null references public.workshops (id) on delete cascade,
  provider           text not null,                    -- 'manual' au pilote
  provider_reference text,
  amount             integer not null check (amount >= 0),
  currency           text not null default 'XOF' check (char_length(currency) = 3),
  status             public.subscription_txn_status not null default 'pending',
  idempotency_key    text not null,
  paid_at            timestamptz,
  validated_by       uuid references auth.users (id),  -- journalisation de la validation
  raw_metadata       jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (provider, idempotency_key)
);
create index subscription_transactions_workshop_idx     on public.subscription_transactions (workshop_id);
create index subscription_transactions_validated_by_idx on public.subscription_transactions (validated_by)
  where validated_by is not null;   -- FK auth.users couvert

create table public.promo_codes (
  code            text primary key,
  plan_code       text not null references public.subscription_plans (code),
  description     text,
  max_redemptions integer check (max_redemptions is null or max_redemptions >= 0),
  redeemed_count  integer not null default 0 check (redeemed_count >= 0),
  valid_until     timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint promo_codes_not_over_redeemed
    check (max_redemptions is null or redeemed_count <= max_redemptions)
);
create index promo_codes_plan_code_idx on public.promo_codes (plan_code);   -- FK couvert
