-- 00_local_auth_shim.sql
-- POUR TEST LOCAL SUR POSTGRES NU UNIQUEMENT (complément, ne remplace pas
-- `supabase db reset`). Ne JAMAIS appliquer sur Supabase : `auth`, `auth.uid()`
-- et les rôles y existent déjà. `supabase db reset` n'exécute que `migrations/`.

create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  phone      text unique,
  email      text unique,
  created_at timestamptz not null default now()
);

-- Reproduit la sémantique Supabase : sujet du JWT dans une GUC de session.
-- Les tests font `set local request.jwt.claim.sub = '<uuid>'` pour simuler un user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Rôles Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

-- Émule les « default privileges » Supabase : anon / authenticated reçoivent les
-- droits de TABLE larges dans public — la RLS est la vraie barrière. (Aucune
-- fonction n'est concernée : toutes les nôtres sont dans app_hidden.)
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Émule l'AVERTISSEMENT Supabase « rls_auto_enable » : sur le projet distant réel,
-- `public.rls_auto_enable()` (SECURITY DEFINER) existe avec EXECUTE ouvert à
-- anon / authenticated, et un event trigger `ensure_rls` actif. On le reproduit
-- ici pour que la migration 20260829120800 et le test T35 s'exécutent réellement.
-- (Sur Supabase, ce fichier n'est PAS appliqué : la fonction/le trigger y sont déjà.)
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''   -- comme la vraie fonction Supabase (évite le faux positif advisor)
as $$
begin
  -- no-op de test (le vrai auto-active la RLS sur les nouvelles tables ; ici sans effet)
  null;
end;
$$;
-- proacl NULL par défaut ⇒ EXECUTE PUBLIC ⇒ anon + authenticated l'héritent.

do $$
begin
  execute 'create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable()';
exception
  when duplicate_object then null;
  when insufficient_privilege then
    raise notice 'shim: event trigger ensure_rls non créé (rôle non superuser) — T35 (evt) sera SKIP';
end;
$$;
