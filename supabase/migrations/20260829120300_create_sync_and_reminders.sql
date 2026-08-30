-- create_sync_and_reminders

-- ─────────────────────────────────────────────────────────────────────────────
-- sync_conflicts — matérialise un conflit d'écriture concurrente (correction F).
-- JAMAIS une seconde fiche visible/numérotée. La résolution met à jour la fiche
-- d'origine sans consommer de numéro.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.sync_conflicts (
  id                 uuid primary key default gen_random_uuid(),
  workshop_id        uuid not null references public.workshops (id) on delete cascade,
  fiche_id           uuid not null,
  local_version      int  not null,
  remote_version     int  not null,
  conflicting_fields jsonb not null default '[]'::jsonb,
  local_payload      jsonb not null default '{}'::jsonb,
  remote_payload     jsonb not null default '{}'::jsonb,
  detected_at        timestamptz not null default now(),
  resolution_state   public.sync_conflict_state not null default 'open',
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users (id),
  constraint sync_conflicts_resolved_coherent
    check ((resolution_state = 'open') = (resolved_at is null)),
  -- FK COMPOSITE : le conflit et sa fiche sont du MÊME atelier (point 1).
  constraint sync_conflicts_fiche_same_workshop_fk
    foreign key (workshop_id, fiche_id)
    references public.fiches (workshop_id, id) on delete cascade
);
-- Au plus un conflit ouvert par fiche à la fois.
create unique index sync_conflicts_one_open_per_fiche_uidx
  on public.sync_conflicts (fiche_id)
  where resolution_state = 'open';
-- Index de préfixe EXACT pour la FK composite (point 4) + FK simples (Perf. Advisor)
create index sync_conflicts_fiche_idx          on public.sync_conflicts (fiche_id);
create index sync_conflicts_workshop_fiche_idx on public.sync_conflicts (workshop_id, fiche_id);
create index sync_conflicts_resolved_by_idx    on public.sync_conflicts (resolved_by) where resolved_by is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- reminders — rappels configurables par le tailleur (type, heure, on/off, son).
-- Pas de série quotidienne, pas de mécanisme culpabilisant (cahier des charges).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  type        text not null check (type in ('retrait_jour', 'retard', 'pret', 'reste')),
  at_time     time not null default '08:00',
  enabled     boolean not null default true,
  sound       boolean not null default false,   -- false = notification silencieuse
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (workshop_id, type)
);
