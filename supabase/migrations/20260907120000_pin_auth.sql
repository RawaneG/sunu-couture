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
--     et ATOMIQUE (corr. throttle §2-8 — les Edge Functions sont
--     stateless/distribuées, un `Map()` ne protège rien, ET plusieurs
--     requêtes concurrentes doivent être sérialisées côté PostgreSQL, jamais
--     seulement côté application) avec verrouillage progressif, scopé par
--     clé opaque (jamais l'IP ni le numéro bruts) ;
--   - `app_hidden.pin_auth_register_throttle` limite le RYTHME de création de
--     comptes depuis une même source (corr. §9-13 — le téléphone étant
--     volontairement non vérifié par SMS, `phone_key unique` seul ne protège
--     pas contre un attaquant qui essaie une SÉRIE de numéros neufs).
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
  'Anti brute-force LOGIN, PERSISTANT et ATOMIQUE (corr. throttle §2-8) — '
  'key_hash est une clé opaque dérivée (HMAC : portée "phone" ou "ip"), jamais '
  'l''IP ni le numéro bruts. Toute lecture+décision+incrément passe par '
  'app_hidden.pin_auth_throttle_consume_attempt() en UNE transaction '
  '(verrouillage de ligne SELECT...FOR UPDATE, ordre trié déterministe) — '
  'jamais un "vérifier puis agir" en deux temps côté application, qui '
  'laisserait passer des tentatives concurrentes avant le premier incrément.';
revoke all on app_hidden.pin_auth_throttle from public;

create table app_hidden.pin_auth_register_throttle (
  key_hash      text primary key,
  window_start  timestamptz not null,
  count         int not null default 0,
  updated_at    timestamptz not null default now()
);
comment on table app_hidden.pin_auth_register_throttle is
  'Anti-spray REGISTRATION (corr. throttle §9-13) — fenêtre FIXE (1h), scopée '
  'par IP opaque UNIQUEMENT (le téléphone est déjà protégé par phone_key '
  'unique). Compteur volontairement PAS remis à zéro par un succès '
  '(corr. §12) : sinon une série d''inscriptions réussies contournerait '
  'indéfiniment la limite. Seuil volontairement généreux (CGNAT Sénégal, '
  'corr. §11) — objectif : empêcher la création illimitée par bot, pas '
  'identifier parfaitement un humain.';
revoke all on app_hidden.pin_auth_register_throttle from public;

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
-- 5. Anti brute-force LOGIN — ATOMIQUE (corr. throttle §3/§4/§6/§7/§8).
--
--    CONTRAT : une tentative est CONSOMMÉE (incrémentée) AVANT toute
--    vérification réelle du PIN — jamais après. `pin_auth_throttle_consume_attempt`
--    reçoit TOUTES les clés concernées d'un même login (portée "phone" ET
--    "ip") et les traite en UNE seule transaction :
--      1. trie les clés (ordre déterministe — évite tout deadlock entre deux
--         appels concurrents qui verrouilleraient les 2 mêmes lignes dans un
--         ordre différent) ;
--      2. garantit l'existence de CHAQUE ligne (INSERT ... ON CONFLICT DO
--         NOTHING) — une ligne absente ne peut pas être verrouillée par
--         SELECT ... FOR UPDATE ;
--      3. verrouille TOUTES les lignes concernées (SELECT ... FOR UPDATE,
--         ordre trié) — les transactions concurrentes sur les MÊMES clés sont
--         donc réellement SÉRIALISÉES par PostgreSQL, jamais seulement par le
--         code applicatif ;
--      4. si L'UNE des clés est déjà verrouillée (locked_until > p_now) :
--         refuse l'ENTIÈRE tentative (`allowed = false`) SANS incrémenter
--         quoi que ce soit — la décision "verrouillé" pour une portée bloque
--         tout, jamais un scope consommé pendant que l'autre ne l'est pas ;
--      5. sinon : incrémente `fail_count` sur CHAQUE clé (une seule fois —
--         c'est CETTE tentative qui est comptée, avant même de savoir si le
--         PIN sera correct) et arme `locked_until` selon le palier atteint,
--         renvoie `allowed = true`.
--
--    Verrouillage progressif (inchangé) :
--      1-4 échecs   -> aucun verrou
--      5-7 échecs   -> verrou  1 minute
--      8-9 échecs   -> verrou  5 minutes
--      10+ échecs   -> verrou 30 minutes
--
--    Après un login RÉUSSI : l'appelant appelle `pin_auth_throttle_reset`
--    (efface les 2 clés) — jamais un second incrément. Après un ÉCHEC :
--    l'appelant NE rappelle RIEN — l'incrément déjà fait par
--    `consume_attempt` EST l'enregistrement de cet échec (corr. §8, jamais un
--    double incrément).
--
--    `p_now` a un DEFAULT `now()` mais n'est JAMAIS exposé par les wrappers
--    `public.pin_auth_*_api` ci-dessous (leur signature n'a pas ce paramètre)
--    — seuls les TESTS SQL internes (10_schema_tests.sql, exécutés
--    directement contre app_hidden en tant que postgres) peuvent l'utiliser
--    pour vérifier le déverrouillage après fenêtre SANS attendre réellement
--    (« clock injection », jamais une horloge contrôlable depuis l'extérieur).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_throttle_consume_attempt(p_key_hashes text[], p_now timestamptz default now())
returns table(allowed boolean, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
  v_rec record;
  v_locked_keys text[] := array[]::text[];
  v_locked_untils timestamptz[] := array[]::timestamptz[];
  v_fail_counts int[] := array[]::int[];
  v_any_locked boolean := false;
  v_max_existing_locked_until timestamptz := null;
  v_max_new_locked_until timestamptz := null;
  v_new_fail_count int;
  v_new_locked_until timestamptz;
begin
  if p_key_hashes is null or array_length(p_key_hashes, 1) is null then
    raise exception 'pin_auth_throttle_consume_attempt: au moins une clé requise' using errcode = 'null_value_not_allowed';
  end if;

  -- Ordre déterministe et dédoublonné — jamais deux ordres différents entre
  -- deux appels concurrents touchant les mêmes clés (prévention deadlock).
  select array_agg(distinct k order by k) into v_keys from unnest(p_key_hashes) as k;

  -- Garantit l'existence de CHAQUE ligne avant le verrouillage — une ligne
  -- absente ne peut pas être verrouillée par SELECT ... FOR UPDATE.
  -- ON CONFLICT DO NOTHING rend ceci sûr entre transactions concurrentes sur
  -- la MÊME clé neuve (une seule insertion "gagne", les autres voient déjà la
  -- ligne au FOR UPDATE suivant).
  insert into app_hidden.pin_auth_throttle (key_hash, fail_count, updated_at)
  select k, 0, p_now from unnest(v_keys) as k
  on conflict (key_hash) do nothing;

  -- Verrouille TOUTES les lignes concernées, ordre trié déterministe.
  -- Bloque jusqu'à obtention du verrou si une autre transaction le détient
  -- déjà — c'est PRÉCISÉMENT la sérialisation recherchée : deux tentatives
  -- concurrentes sur le même numéro/IP ne peuvent jamais lire+décider en
  -- parallèle, l'une attend que l'autre ait committé son incrément.
  for v_rec in
    select t.key_hash, t.fail_count, t.locked_until
    from app_hidden.pin_auth_throttle t
    where t.key_hash = any(v_keys)
    order by t.key_hash
    for update
  loop
    v_fail_counts := array_append(v_fail_counts, v_rec.fail_count);
    v_locked_keys := array_append(v_locked_keys, v_rec.key_hash);
    if v_rec.locked_until is not null and v_rec.locked_until > p_now then
      v_any_locked := true;
      v_locked_untils := array_append(v_locked_untils, v_rec.locked_until);
      if v_max_existing_locked_until is null or v_rec.locked_until > v_max_existing_locked_until then
        v_max_existing_locked_until := v_rec.locked_until;
      end if;
    end if;
  end loop;

  if v_any_locked then
    -- REFUSÉ — aucune des clés n'est modifiée : la tentative n'est PAS
    -- consommée (elle n'a jamais atteint la vérification réelle).
    return query select false, v_max_existing_locked_until;
    return;
  end if;

  -- Aucune clé n'était verrouillée : consomme UNE tentative sur CHAQUE clé —
  -- incrément PESSIMISTE, avant même de savoir si le PIN sera correct.
  for v_i in 1 .. array_length(v_locked_keys, 1) loop
    v_new_fail_count := v_fail_counts[v_i] + 1;
    v_new_locked_until :=
      case
        when v_new_fail_count >= 10 then p_now + interval '30 minutes'
        when v_new_fail_count >= 8  then p_now + interval '5 minutes'
        when v_new_fail_count >= 5  then p_now + interval '1 minute'
        else null
      end;
    update app_hidden.pin_auth_throttle
       set fail_count = v_new_fail_count, locked_until = v_new_locked_until, updated_at = p_now
     where key_hash = v_locked_keys[v_i];
    if v_new_locked_until is not null and (v_max_new_locked_until is null or v_new_locked_until > v_max_new_locked_until) then
      v_max_new_locked_until := v_new_locked_until;
    end if;
  end loop;

  return query select true, v_max_new_locked_until;
end;
$$;
revoke all on function app_hidden.pin_auth_throttle_consume_attempt(text[], timestamptz) from public;

create or replace function app_hidden.pin_auth_throttle_reset(p_key_hashes text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app_hidden.pin_auth_throttle where key_hash = any(p_key_hashes);
$$;
revoke all on function app_hidden.pin_auth_throttle_reset(text[]) from public;
comment on function app_hidden.pin_auth_throttle_reset(text[]) is
  'Appelée UNIQUEMENT après un login réussi — efface les compteurs des DEUX '
  'portées (phone + ip) d''un coup. Ne touche jamais '
  'app_hidden.pin_auth_register_throttle (corr. §12 : un succès ne remet '
  'jamais à zéro le quota anti-spray registration).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Anti-spray REGISTRATION — fenêtre FIXE, scope IP UNIQUEMENT
--    (corr. throttle §9-13). Le téléphone reste protégé par `phone_key
--    unique` (violation → 23505, traduite en réponse contrôlée) ; cette
--    primitive protège contre la création EN MASSE de numéros NEUFS depuis
--    une même source, ce que l'unicité seule ne peut pas empêcher.
--
--    Fenêtre fixe de 1 heure, limite 25 tentatives — volontairement
--    généreux (CGNAT Sénégal, corr. §11) : l'objectif est d'empêcher un bot
--    de créer des comptes sans limite, pas d'identifier parfaitement un
--    utilisateur unique derrière une IP partagée.
--
--    IMPORTANT (corr. §12) : AUCUNE fonction de reset n'existe pour cette
--    table — un succès de `register` compte dans le quota comme un échec,
--    il n'y a tout simplement rien à appeler pour l'en exempter.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.pin_auth_register_consume_attempt(p_key_hash text, p_now timestamptz default now())
returns table(allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit constant int := 25;
  v_window constant interval := interval '1 hour';
  v_row record;
begin
  if p_key_hash is null or btrim(p_key_hash) = '' then
    raise exception 'pin_auth_register_consume_attempt: key_hash requis' using errcode = 'null_value_not_allowed';
  end if;

  insert into app_hidden.pin_auth_register_throttle (key_hash, window_start, count, updated_at)
  values (p_key_hash, p_now, 0, p_now)
  on conflict (key_hash) do nothing;

  select * into v_row
  from app_hidden.pin_auth_register_throttle
  where key_hash = p_key_hash
  for update;

  if p_now - v_row.window_start > v_window then
    -- Fenêtre expirée — en redémarre une fraîche (jamais un quota qui ne se
    -- réinitialise plus, corr. §11).
    update app_hidden.pin_auth_register_throttle
       set window_start = p_now, count = 1, updated_at = p_now
     where key_hash = p_key_hash;
    return query select true;
    return;
  end if;

  if v_row.count >= v_limit then
    return query select false;
    return;
  end if;

  update app_hidden.pin_auth_register_throttle
     set count = count + 1, updated_at = p_now
   where key_hash = p_key_hash;
  return query select true;
end;
$$;
revoke all on function app_hidden.pin_auth_register_consume_attempt(text, timestamptz) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Wrappers `public` — SEULE porte PostgREST vers les fonctions `app_hidden`
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
create or replace function public.pin_auth_throttle_consume_attempt_api(p_key_hashes text[])
returns table(allowed boolean, locked_until timestamptz)
language sql
security invoker
set search_path = ''
as $$
  select * from app_hidden.pin_auth_throttle_consume_attempt(p_key_hashes);
$$;
revoke all on function public.pin_auth_throttle_consume_attempt_api(text[]) from public;

create or replace function public.pin_auth_throttle_reset_api(p_key_hashes text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.pin_auth_throttle_reset(p_key_hashes);
$$;
revoke all on function public.pin_auth_throttle_reset_api(text[]) from public;

-- Note : PAS de paramètre `p_now` ici non plus.
create or replace function public.pin_auth_register_consume_attempt_api(p_key_hash text)
returns table(allowed boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from app_hidden.pin_auth_register_consume_attempt(p_key_hash);
$$;
revoke all on function public.pin_auth_register_consume_attempt_api(text) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Grants — même style que la migration Phase 2 (fonctions app_hidden) :
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
    revoke all on function app_hidden.pin_auth_register_account(uuid, text, text)          from anon;
    revoke all on function app_hidden.pin_auth_lookup_account(text)                        from anon;
    revoke all on function app_hidden.pin_auth_touch_login(uuid)                           from anon;
    revoke all on function app_hidden.pin_auth_throttle_consume_attempt(text[], timestamptz) from anon;
    revoke all on function app_hidden.pin_auth_throttle_reset(text[])                       from anon;
    revoke all on function app_hidden.pin_auth_register_consume_attempt(text, timestamptz)  from anon;
    revoke all on function public.pin_auth_register_account_api(uuid, text, text)          from anon;
    revoke all on function public.pin_auth_lookup_account_api(text)                        from anon;
    revoke all on function public.pin_auth_touch_login_api(uuid)                           from anon;
    revoke all on function public.pin_auth_throttle_consume_attempt_api(text[])            from anon;
    revoke all on function public.pin_auth_throttle_reset_api(text[])                      from anon;
    revoke all on function public.pin_auth_register_consume_attempt_api(text)              from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function app_hidden.pin_auth_register_account(uuid, text, text)          from authenticated;
    revoke all on function app_hidden.pin_auth_lookup_account(text)                        from authenticated;
    revoke all on function app_hidden.pin_auth_touch_login(uuid)                           from authenticated;
    revoke all on function app_hidden.pin_auth_throttle_consume_attempt(text[], timestamptz) from authenticated;
    revoke all on function app_hidden.pin_auth_throttle_reset(text[])                       from authenticated;
    revoke all on function app_hidden.pin_auth_register_consume_attempt(text, timestamptz)  from authenticated;
    revoke all on function public.pin_auth_register_account_api(uuid, text, text)          from authenticated;
    revoke all on function public.pin_auth_lookup_account_api(text)                        from authenticated;
    revoke all on function public.pin_auth_touch_login_api(uuid)                           from authenticated;
    revoke all on function public.pin_auth_throttle_consume_attempt_api(text[])            from authenticated;
    revoke all on function public.pin_auth_throttle_reset_api(text[])                      from authenticated;
    revoke all on function public.pin_auth_register_consume_attempt_api(text)              from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage   on schema app_hidden to service_role; -- déjà accordé Phase 2, idempotent
    grant execute on function app_hidden.pin_auth_register_account(uuid, text, text)          to service_role;
    grant execute on function app_hidden.pin_auth_lookup_account(text)                        to service_role;
    grant execute on function app_hidden.pin_auth_touch_login(uuid)                           to service_role;
    grant execute on function app_hidden.pin_auth_throttle_consume_attempt(text[], timestamptz) to service_role;
    grant execute on function app_hidden.pin_auth_throttle_reset(text[])                       to service_role;
    grant execute on function app_hidden.pin_auth_register_consume_attempt(text, timestamptz)  to service_role;
    grant execute on function public.pin_auth_register_account_api(uuid, text, text)          to service_role;
    grant execute on function public.pin_auth_lookup_account_api(text)                        to service_role;
    grant execute on function public.pin_auth_touch_login_api(uuid)                           to service_role;
    grant execute on function public.pin_auth_throttle_consume_attempt_api(text[])            to service_role;
    grant execute on function public.pin_auth_throttle_reset_api(text[])                       to service_role;
    grant execute on function public.pin_auth_register_consume_attempt_api(text)              to service_role;
  end if;
end;
$$;
