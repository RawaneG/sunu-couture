-- pin_auth (corr. Gate Auth — pivot téléphone + PIN, atelier invisible)
--
-- CONTEXTE : remplace le parcours SMS OTP (jamais activé côté fournisseur
-- réel — voir supabase/config.toml, `[auth.sms.test_otp]` local uniquement)
-- par une authentification téléphone + PIN à 4 chiffres, entièrement gérée
-- par l'Edge Function `tayoo-pin-auth`. `external.phone` reste désactivé —
-- ce pivot ne dépend d'AUCUN fournisseur SMS, ne produit AUCUN SMS.
--
-- ARCHITECTURE (voir supabase/functions/tayoo-pin-auth/index.ts) : un PIN à
-- 4 chiffres n'a que 10 000 valeurs possibles — il ne devient JAMAIS
-- directement un mot de passe Supabase Auth. À la place :
--   - une identité Supabase Auth TECHNIQUE (email/mot de passe interne,
--     jamais vus par l'utilisateur) est dérivée par HMAC-SHA256 à partir du
--     numéro normalisé + PIN + un sel aléatoire par compte + un secret
--     serveur (`TAYOO_PIN_AUTH_SECRET`, jamais commité, jamais dans une
--     variable VITE_*, jamais dans le navigateur) ;
--   - `app_hidden.pin_auth_accounts` ne stocke QUE le nécessaire pour
--     reconstruire cette identité au login suivant — jamais le numéro brut,
--     jamais le PIN, jamais le mot de passe technique ;
--   - `app_hidden.pin_auth_throttle` implémente un anti brute-force PERSISTANT
--     (les Edge Functions sont stateless/distribuées — un `Map()` en mémoire
--     ne protège rien) avec verrouillage progressif, scopé par clé opaque
--     (jamais l'IP ni le numéro bruts) — voir seuils dans
--     `app_hidden.pin_auth_throttle_record_failure` ci-dessous.
--
-- FRONTIÈRE service_role (même principe que `provision_workshop_api`/
-- `create_fiche_from_draft_api`, corr. Q) : AUCUN wrapper `public.pin_auth_*_api`
-- n'est exécutable par `anon`/`authenticated` — seul `service_role` (donc
-- exclusivement l'Edge Function `tayoo-pin-auth`, qui implémente elle-même
-- une authentification stricte avant d'appeler quoi que ce soit ici) le peut.
-- `app_hidden` n'étant pas dans `[api].schemas`, ces wrappers `public` sont la
-- SEULE porte PostgREST vers les fonctions `app_hidden.pin_auth_*`
-- (SECURITY DEFINER) — exactement le même schéma que Phase 3A/9A.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Tables privées — AUCUN téléphone brut, AUCUN PIN, AUCUN mot de passe
--    technique n'est jamais stocké ici (corr. Gate Auth §26).
-- ═════════════════════════════════════════════════════════════════════════════
create table app_hidden.pin_auth_accounts (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  phone_key      text not null unique,
  password_salt  text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_login_at  timestamptz
);
comment on table app_hidden.pin_auth_accounts is
  'Identité PIN Tayoo — phone_key/password_salt sont des sorties HMAC/aléatoires '
  'OPAQUES (jamais le numéro brut, jamais le PIN, jamais le mot de passe '
  'technique Supabase). Seule porte d''écriture/lecture : les fonctions '
  'app_hidden.pin_auth_* ci-dessous, appelées uniquement par service_role via '
  'les wrappers public.pin_auth_*_api (Edge Function tayoo-pin-auth).';
revoke all on app_hidden.pin_auth_accounts from public;

create table app_hidden.pin_auth_throttle (
  key_hash      text primary key,
  fail_count    int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
comment on table app_hidden.pin_auth_throttle is
  'Anti brute-force PERSISTANT (corr. Gate Auth §27) — key_hash est une clé '
  'opaque dérivée (HMAC), jamais l''IP ni le numéro bruts. Une ligne par '
  '(portée, valeur) — ex. une pour le téléphone, une pour l''IP, sur chaque '
  'tentative register/login.';
revoke all on app_hidden.pin_auth_throttle from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. app_hidden.pin_auth_register_account — SEULE porte d'écriture du compte
--    PIN. Violation d'unicité sur phone_key (23505) = inscription déjà
--    existante pour ce numéro — laissée remonter telle quelle à l'appelant
--    (l'Edge Function la traduit en réponse UX contrôlée, jamais un 500).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_register_account(p_user_id uuid, p_phone_key text, p_password_salt text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'pin_auth_register_account: user_id requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_phone_key is null or btrim(p_phone_key) = '' then
    raise exception 'pin_auth_register_account: phone_key requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_password_salt is null or btrim(p_password_salt) = '' then
    raise exception 'pin_auth_register_account: password_salt requis' using errcode = 'null_value_not_allowed';
  end if;

  insert into app_hidden.pin_auth_accounts (user_id, phone_key, password_salt)
  values (p_user_id, p_phone_key, p_password_salt);
end;
$$;
revoke all on function app_hidden.pin_auth_register_account(uuid, text, text) from public;
comment on function app_hidden.pin_auth_register_account(uuid, text, text) is
  'FRONTIÈRE service_role : appelée uniquement par tayoo-pin-auth après '
  'auth.admin.createUser() — jamais depuis le navigateur.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. app_hidden.pin_auth_lookup_account — lecture par phone_key (login).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_lookup_account(p_phone_key text)
returns table(user_id uuid, password_salt text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.password_salt
  from app_hidden.pin_auth_accounts a
  where a.phone_key = p_phone_key;
$$;
revoke all on function app_hidden.pin_auth_lookup_account(text) from public;
comment on function app_hidden.pin_auth_lookup_account(text) is
  'FRONTIÈRE service_role : résout user_id/password_salt à partir d''une '
  'phone_key déjà dérivée par tayoo-pin-auth — ne reçoit jamais un numéro brut.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. app_hidden.pin_auth_touch_login — horodatage du dernier login réussi.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_touch_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update app_hidden.pin_auth_accounts
     set last_login_at = now(), updated_at = now()
   where user_id = p_user_id;
$$;
revoke all on function app_hidden.pin_auth_touch_login(uuid) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Anti brute-force — verrouillage PROGRESSIF (corr. Gate Auth §28) :
--      1-4 échecs   -> aucun verrou
--      5-7 échecs   -> verrou  1 minute
--      8-9 échecs   -> verrou  5 minutes
--      10+ échecs   -> verrou 30 minutes
--    `p_now` a un DEFAULT `now()` mais n'est JAMAIS exposé par les wrappers
--    `public.pin_auth_throttle_*_api` ci-dessous (leur signature n'a pas ce
--    paramètre) — seuls les TESTS SQL internes (10_schema_tests.sql, exécutés
--    directement contre app_hidden en tant que postgres) peuvent l'utiliser
--    pour vérifier le déverrouillage après fenêtre SANS attendre réellement
--    (« clock injection », jamais une horloge contrôlable depuis l'extérieur).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_throttle_status(p_key_hash text, p_now timestamptz default now())
returns table(locked boolean, locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_locked_until timestamptz;
begin
  select t.locked_until into v_locked_until
  from app_hidden.pin_auth_throttle t
  where t.key_hash = p_key_hash;

  return query select (v_locked_until is not null and v_locked_until > p_now), v_locked_until;
end;
$$;
revoke all on function app_hidden.pin_auth_throttle_status(text, timestamptz) from public;

create or replace function app_hidden.pin_auth_throttle_record_failure(p_key_hash text, p_now timestamptz default now())
returns table(locked boolean, locked_until timestamptz, fail_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fail_count int;
  v_locked_until timestamptz;
begin
  insert into app_hidden.pin_auth_throttle (key_hash, fail_count, updated_at)
  values (p_key_hash, 1, p_now)
  on conflict (key_hash) do update
    set fail_count = app_hidden.pin_auth_throttle.fail_count + 1,
        updated_at = p_now
  returning app_hidden.pin_auth_throttle.fail_count into v_fail_count;

  v_locked_until :=
    case
      when v_fail_count >= 10 then p_now + interval '30 minutes'
      when v_fail_count >= 8  then p_now + interval '5 minutes'
      when v_fail_count >= 5  then p_now + interval '1 minute'
      else null
    end;

  update app_hidden.pin_auth_throttle
     set locked_until = v_locked_until
   where key_hash = p_key_hash;

  return query select (v_locked_until is not null and v_locked_until > p_now), v_locked_until, v_fail_count;
end;
$$;
revoke all on function app_hidden.pin_auth_throttle_record_failure(text, timestamptz) from public;

create or replace function app_hidden.pin_auth_throttle_reset(p_key_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app_hidden.pin_auth_throttle where key_hash = p_key_hash;
$$;
revoke all on function app_hidden.pin_auth_throttle_reset(text) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Wrappers `public` — SEULE porte PostgREST vers les fonctions `app_hidden`
--    ci-dessus (`app_hidden` n'est pas dans `[api].schemas`). SECURITY INVOKER
--    (jamais DEFINER — elles ne font que relayer un appel déjà DEFINER),
--    `search_path = ''`, noms qualifiés, EXECUTE réservé à `service_role`.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.pin_auth_register_account_api(p_user_id uuid, p_phone_key text, p_password_salt text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.pin_auth_register_account(p_user_id, p_phone_key, p_password_salt);
$$;
comment on function public.pin_auth_register_account_api(uuid, text, text) is
  'SEULE porte PostgREST vers app_hidden.pin_auth_register_account(). EXECUTE '
  'réservé à service_role — jamais anon/authenticated.';
revoke all on function public.pin_auth_register_account_api(uuid, text, text) from public;

create or replace function public.pin_auth_lookup_account_api(p_phone_key text)
returns table(user_id uuid, password_salt text)
language sql
security invoker
set search_path = ''
as $$
  select * from app_hidden.pin_auth_lookup_account(p_phone_key);
$$;
revoke all on function public.pin_auth_lookup_account_api(text) from public;

create or replace function public.pin_auth_touch_login_api(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.pin_auth_touch_login(p_user_id);
$$;
revoke all on function public.pin_auth_touch_login_api(uuid) from public;

-- Note : PAS de paramètre `p_now` ici — toujours `now()` réel côté serveur.
create or replace function public.pin_auth_throttle_status_api(p_key_hash text)
returns table(locked boolean, locked_until timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from app_hidden.pin_auth_throttle_status(p_key_hash);
$$;
revoke all on function public.pin_auth_throttle_status_api(text) from public;

create or replace function public.pin_auth_throttle_record_failure_api(p_key_hash text)
returns table(locked boolean, locked_until timestamptz, fail_count int)
language sql
security invoker
set search_path = ''
as $$
  select * from app_hidden.pin_auth_throttle_record_failure(p_key_hash);
$$;
revoke all on function public.pin_auth_throttle_record_failure_api(text) from public;

create or replace function public.pin_auth_throttle_reset_api(p_key_hash text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.pin_auth_throttle_reset(p_key_hash);
$$;
revoke all on function public.pin_auth_throttle_reset_api(text) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Grants — même style que la migration Phase 2 (fonctions app_hidden) :
--    revoke explicite anon/authenticated (défense en profondeur — ils ne
--    peuvent de toute façon pas résoudre `app_hidden` via PostgREST), grant
--    EXECUTE à service_role UNIQUEMENT sur les wrappers `public` (la seule
--    porte réellement empruntée) ET sur les fonctions `app_hidden` elles-mêmes
--    (les wrappers sont SECURITY INVOKER : l'appelant — service_role — a
--    besoin d'EXECUTE sur la fonction interne qu'il appelle, exactement comme
--    provision_workshop_api/app_hidden.provision_workshop).
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function app_hidden.pin_auth_register_account(uuid, text, text)  from anon;
    revoke all on function app_hidden.pin_auth_lookup_account(text)                from anon;
    revoke all on function app_hidden.pin_auth_touch_login(uuid)                   from anon;
    revoke all on function app_hidden.pin_auth_throttle_status(text, timestamptz)  from anon;
    revoke all on function app_hidden.pin_auth_throttle_record_failure(text, timestamptz) from anon;
    revoke all on function app_hidden.pin_auth_throttle_reset(text)                from anon;
    revoke all on function public.pin_auth_register_account_api(uuid, text, text)  from anon;
    revoke all on function public.pin_auth_lookup_account_api(text)                from anon;
    revoke all on function public.pin_auth_touch_login_api(uuid)                   from anon;
    revoke all on function public.pin_auth_throttle_status_api(text)               from anon;
    revoke all on function public.pin_auth_throttle_record_failure_api(text)       from anon;
    revoke all on function public.pin_auth_throttle_reset_api(text)                from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function app_hidden.pin_auth_register_account(uuid, text, text)  from authenticated;
    revoke all on function app_hidden.pin_auth_lookup_account(text)                from authenticated;
    revoke all on function app_hidden.pin_auth_touch_login(uuid)                   from authenticated;
    revoke all on function app_hidden.pin_auth_throttle_status(text, timestamptz)  from authenticated;
    revoke all on function app_hidden.pin_auth_throttle_record_failure(text, timestamptz) from authenticated;
    revoke all on function app_hidden.pin_auth_throttle_reset(text)                from authenticated;
    revoke all on function public.pin_auth_register_account_api(uuid, text, text)  from authenticated;
    revoke all on function public.pin_auth_lookup_account_api(text)                from authenticated;
    revoke all on function public.pin_auth_touch_login_api(uuid)                   from authenticated;
    revoke all on function public.pin_auth_throttle_status_api(text)               from authenticated;
    revoke all on function public.pin_auth_throttle_record_failure_api(text)       from authenticated;
    revoke all on function public.pin_auth_throttle_reset_api(text)                from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage   on schema app_hidden to service_role; -- déjà accordé Phase 2, idempotent
    grant execute on function app_hidden.pin_auth_register_account(uuid, text, text)  to service_role;
    grant execute on function app_hidden.pin_auth_lookup_account(text)                to service_role;
    grant execute on function app_hidden.pin_auth_touch_login(uuid)                   to service_role;
    grant execute on function app_hidden.pin_auth_throttle_status(text, timestamptz)  to service_role;
    grant execute on function app_hidden.pin_auth_throttle_record_failure(text, timestamptz) to service_role;
    grant execute on function app_hidden.pin_auth_throttle_reset(text)                to service_role;
    grant execute on function public.pin_auth_register_account_api(uuid, text, text)  to service_role;
    grant execute on function public.pin_auth_lookup_account_api(text)                to service_role;
    grant execute on function public.pin_auth_touch_login_api(uuid)                   to service_role;
    grant execute on function public.pin_auth_throttle_status_api(text)               to service_role;
    grant execute on function public.pin_auth_throttle_record_failure_api(text)       to service_role;
    grant execute on function public.pin_auth_throttle_reset_api(text)                to service_role;
  end if;
end;
$$;
