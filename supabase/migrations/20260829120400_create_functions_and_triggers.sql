-- create_functions_and_triggers
-- Toutes les fonctions vivent dans le schéma privé app_hidden (non exposé par
-- l'API). SECURITY DEFINER minimal, search_path vide, noms entièrement qualifiés.
-- Chaque `create function` est suivi, DANS LA MÊME TRANSACTION, d'un
-- `revoke all … from public` explicite (point 5 — aucune ADP schema-scoped).
-- Audit complet des grants : supabase/README.md.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. updated_at automatique
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function app_hidden.set_updated_at() from public;

create trigger trg_workshops_updated_at     before update on public.workshops     for each row execute function app_hidden.set_updated_at();
create trigger trg_carnets_updated_at       before update on public.carnets       for each row execute function app_hidden.set_updated_at();
create trigger trg_clients_updated_at       before update on public.clients       for each row execute function app_hidden.set_updated_at();
create trigger trg_fiches_updated_at        before update on public.fiches        for each row execute function app_hidden.set_updated_at();
create trigger trg_modeles_updated_at       before update on public.modeles       for each row execute function app_hidden.set_updated_at();
create trigger trg_subscriptions_updated_at before update on public.subscriptions for each row execute function app_hidden.set_updated_at();
create trigger trg_reminders_updated_at     before update on public.reminders     for each row execute function app_hidden.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Propriétaire d'atelier canonique (point 1 / point 6)
--    workshops.owner_id fait foi. Deux déclencheurs garantissent qu'il ne peut
--    JAMAIS diverger de la ligne workshop_members(role='owner'), y compris lors
--    d'un TRANSFERT de propriétaire.
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. Après INSERT / changement d'owner_id : synchronise la ligne membre 'owner'.
--     Lors d'un transfert A → B : RÉTROGRADE A **avant** de promouvoir B (sinon
--     l'index unique partiel « un seul owner » bloque la promotion), puis vérifie
--     qu'il reste EXACTEMENT un owner. Le verrou de ligne sur `workshops` (pris
--     par l'UPDATE déclencheur) + le FOR UPDATE ci-dessous sérialisent deux
--     transferts concurrents.
create or replace function app_hidden.sync_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_count int;
begin
  perform 1
  from public.workshop_members
  where workshop_id = new.id
    and user_id in (new.owner_id, coalesce(old.owner_id, new.owner_id))
  for update;

  if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
    -- 1. rétrograder l'ANCIEN propriétaire d'abord
    update public.workshop_members
       set role = 'assistant'
     where workshop_id = new.id and user_id = old.owner_id and role = 'owner';
  end if;

  -- 2. (ré)assurer la ligne 'owner' du propriétaire courant
  insert into public.workshop_members (workshop_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workshop_id, user_id) do update set role = 'owner';

  -- 3. invariant : exactement un owner
  select count(*) into v_owner_count
  from public.workshop_members
  where workshop_id = new.id and role = 'owner';
  if v_owner_count <> 1 then
    raise exception 'invariant atelier % : % ligne(s) owner (attendu 1)', new.id, v_owner_count
      using errcode = 'integrity_constraint_violation';
  end if;

  return null;
end;
$$;
revoke all on function app_hidden.sync_owner_membership() from public;

create trigger trg_workshops_sync_owner
  after insert or update of owner_id on public.workshops
  for each row execute function app_hidden.sync_owner_membership();

-- 2b. Protège la ligne membre du propriétaire OFFICIEL (celui pointé par
--     workshops.owner_id) : ni suppression, ni rétrogradation, ni modification
--     de workshop_id / user_id. Le transfert passe UNIQUEMENT par
--     UPDATE workshops.owner_id (géré par 2a).
create or replace function app_hidden.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_official_owner boolean;
begin
  v_is_official_owner := (old.role = 'owner')
    and exists (select 1 from public.workshops w
                where w.id = old.workshop_id and w.owner_id = old.user_id);

  if tg_op = 'DELETE' then
    if v_is_official_owner then
      raise exception 'ligne membre "owner" protégée : % reste owner_id de l''atelier % '
        '(transférer via workshops.owner_id, ou supprimer l''atelier)',
        old.user_id, old.workshop_id using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  -- UPDATE
  if v_is_official_owner then
    if new.role <> 'owner' then
      raise exception 'rôle "owner" protégé : % reste owner_id de l''atelier %',
        old.user_id, old.workshop_id using errcode = 'restrict_violation';
    end if;
    if new.workshop_id <> old.workshop_id or new.user_id <> old.user_id then
      raise exception 'ligne "owner" officielle : workshop_id / user_id non modifiables'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_hidden.protect_owner_membership() from public;

create trigger trg_workshop_members_protect_owner
  before delete or update on public.workshop_members
  for each row execute function app_hidden.protect_owner_membership();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. app_hidden.current_workshop_ids() — ateliers de l'utilisateur courant.
--    UNION : ateliers dont owner_id = auth.uid()  ∪  ateliers via workshop_members.
--    SECURITY DEFINER, STABLE, search_path vide. Base des politiques Phase 4
--    (sauf workshop_members — corr. E). Pas de récursion.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.current_workshop_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workshops w
  where w.owner_id = (select auth.uid())
  union
  select wm.workshop_id
  from public.workshop_members wm
  where wm.user_id = (select auth.uid())
$$;
revoke all on function app_hidden.current_workshop_ids() from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. app_hidden.provision_workshop(owner, name) — création transactionnelle.
--    FRONTIÈRE service_role : `p_owner` = identité dérivée d'un JWT vérifié côté
--    Edge Function, JAMAIS un paramètre fourni librement par le client
--    (exigence bloquante Phase 3).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.provision_workshop(p_owner uuid, p_name text)
returns public.workshops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws public.workshops;
begin
  if p_owner is null then
    raise exception 'provision_workshop: owner requis' using errcode = 'null_value_not_allowed';
  end if;
  insert into public.workshops (name, owner_id)
  values (btrim(coalesce(p_name, '')), p_owner)
  returning * into v_ws;      -- CHECK sur name rejette un nom vide
  return v_ws;
end;
$$;
revoke all on function app_hidden.provision_workshop(uuid, text) from public;

comment on function app_hidden.provision_workshop(uuid, text) is
  'FRONTIÈRE service_role : p_owner = identité dérivée d''un JWT vérifié côté Edge '
  'Function, jamais un paramètre client (exigence bloquante Phase 3).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. app_hidden.create_fiche_from_draft(workshop, client, payload) — SEULE porte
--    d'attribution de numéro + création de fiche (point 3). Le brouillon
--    « Nouvelle fiche » vit uniquement en local ; RIEN en base à l'ouverture du
--    formulaire ; AUCUN numéro consommé sans création de fiche dans la même
--    transaction.
--
--    RÈGLE MÉTIER (point 2) : une fiche 'active' doit contenir AU MOINS
--      - un client valide (p_client_id non nul), OU
--      - une information significative parmi garment / description /
--        measurements / metadata.legacy_identity.
--    Les chaînes vides ou uniquement composées d'espaces ne comptent pas.
--    Un payload vide `{}` ou blanc est REFUSÉ **avant** tout verrou / allocation
--    → aucune fiche, aucun numéro.
--
--    p_fiche n'a PAS de valeur par défaut (point 2). Les 3 paramètres sont requis.
--
--    FRONTIÈRE service_role (point 7) : `p_workshop_id` et `p_client_id` NE
--    DOIVENT PAS être fournis librement par le client. L'Edge Function dérive
--    l'identité d'un JWT vérifié et contrôle appartenance + rôle AVANT l'appel
--    (exigences bloquantes Phases 3–4).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.create_fiche_from_draft(
  p_workshop_id uuid,
  p_client_id   uuid,
  p_fiche       jsonb
)
returns public.fiches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carnet       public.carnets;
  v_number       int;
  v_page         int;
  v_slot         int;
  v_fiche        public.fiches;
  v_significatif  boolean;   -- toujours TRUE ou FALSE (jamais NULL)
begin
  if p_workshop_id is null then
    raise exception 'create_fiche_from_draft: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_fiche is null then
    raise exception 'create_fiche_from_draft: payload requis (pas de valeur par défaut)'
      using errcode = 'null_value_not_allowed';
  end if;
  if jsonb_typeof(p_fiche) is distinct from 'object' then
    raise exception 'create_fiche_from_draft: payload doit être un objet JSON (reçu %)',
      coalesce(jsonb_typeof(p_fiche), 'null') using errcode = 'invalid_parameter_value';
  end if;

  -- RÈGLE MÉTIER « fiche non vide » — évaluée AVANT tout verrou / allocation.
  -- Une chaîne « blanche » = uniquement espace / tabulation / saut de ligne / CR /
  -- form-feed / tab vertical → `btrim(x, E' \t\n\r\f\v')` puis `nullif(…, '')`.
  -- Chaque terme est STRICTEMENT booléen :
  --   * `nullif(btrim(<texte>, <ws>), '') is not null`  → jamais NULL (clé absente /
  --     valeur JSON null / chaîne blanche → FALSE) ;
  --   * `jsonb_each` n'est appelé QUE si `measurements` est un objet JSON
  --     (CASE : les branches non 'object' renvoient FALSE sans évaluer la sous-requête) ;
  --   * OR de termes booléens → booléen. Le `is not true` final est une double garde.
  v_significatif :=
       (p_client_id is not null)
    or (nullif(btrim(p_fiche ->> 'garment',     E' \t\n\r\f\v'), '') is not null)
    or (nullif(btrim(p_fiche ->> 'description', E' \t\n\r\f\v'), '') is not null)
    or (case
          when jsonb_typeof(p_fiche -> 'measurements') = 'object' then
            exists (
              select 1
              from jsonb_each(p_fiche -> 'measurements') m
              where nullif(btrim(
                case
                  when jsonb_typeof(m.value) = 'object'              then m.value ->> 'valeur'
                  when jsonb_typeof(m.value) in ('string', 'number') then m.value #>> '{}'
                  else null
                end, E' \t\n\r\f\v'), '') is not null
            )
          else false
        end)
    or (nullif(btrim(p_fiche #>> '{metadata,legacy_identity,nom}',       E' \t\n\r\f\v'), '') is not null)
    or (nullif(btrim(p_fiche #>> '{metadata,legacy_identity,prenom}',    E' \t\n\r\f\v'), '') is not null)
    or (nullif(btrim(p_fiche #>> '{metadata,legacy_identity,telephone}', E' \t\n\r\f\v'), '') is not null);

  if v_significatif is not true then
    raise exception 'create_fiche_from_draft: fiche vide refusée — fournir un client '
      'valide OU une information (garment / description / measurements / legacy_identity)'
      using errcode = 'check_violation';
  end if;

  -- 1. verrou par atelier (sérialise l'allocation de numéro)
  perform pg_advisory_xact_lock(hashtextextended(p_workshop_id::text, 42));

  -- 2. carnet actif le plus récent (verrouillé), sinon créé
  select * into v_carnet
  from public.carnets
  where workshop_id = p_workshop_id
  order by number desc
  limit 1
  for update;

  if not found then
    insert into public.carnets (workshop_id, number, status)
    values (p_workshop_id, 1, 'active')
    returning * into v_carnet;
  elsif v_carnet.status <> 'active' or v_carnet.next_number > v_carnet.fiches_par_carnet then
    insert into public.carnets (workshop_id, number, status)
    values (p_workshop_id, v_carnet.number + 1, 'active')
    returning * into v_carnet;
  end if;

  -- 3. numéro + 4. page / slot
  v_number := v_carnet.next_number;
  v_page   := ((v_number - 1) / 4) + 1;
  v_slot   := ((v_number - 1) % 4) + 1;

  -- 5. insertion de la fiche (FK composites → client du même atelier)
  begin
    insert into public.fiches (
      workshop_id, carnet_id, client_id, number, page_number, slot_number,
      state, status, measurements, garment, description, fabric_notes,
      quantity, due_date, total_price, metadata
    ) values (
      p_workshop_id, v_carnet.id, p_client_id, v_number, v_page, v_slot, 'active',
      coalesce((p_fiche ->> 'status')::public.fiche_status, 'received'),
      coalesce(p_fiche -> 'measurements', '{}'::jsonb),
      coalesce(p_fiche ->> 'garment', ''),
      nullif(btrim(coalesce(p_fiche ->> 'description',  ''), E' \t\n\r\f\v'), ''),
      nullif(btrim(coalesce(p_fiche ->> 'fabric_notes', ''), E' \t\n\r\f\v'), ''),
      coalesce((p_fiche ->> 'quantity')::int, 1),
      (p_fiche ->> 'due_date')::date,
      coalesce((p_fiche ->> 'total_price')::int, 0),
      coalesce(p_fiche -> 'metadata', '{}'::jsonb)
    )
    returning * into v_fiche;
  exception when foreign_key_violation then
    raise exception 'create_fiche_from_draft: client % hors de l''atelier %', p_client_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end;

  -- 6. avance le compteur ; bascule + carnet suivant si plein
  update public.carnets
     set next_number = next_number + 1,
         status = case when next_number + 1 > fiches_par_carnet
                       then 'full'::public.carnet_status else status end
   where id = v_carnet.id;

  if v_number + 1 > v_carnet.fiches_par_carnet then
    insert into public.carnets (workshop_id, number, status)
    values (p_workshop_id, v_carnet.number + 1, 'active')
    on conflict (workshop_id, number) do nothing;   -- prépare le carnet suivant
  end if;

  return v_fiche;
end;
$$;
revoke all on function app_hidden.create_fiche_from_draft(uuid, uuid, jsonb) from public;

comment on function app_hidden.create_fiche_from_draft(uuid, uuid, jsonb) is
  'SEULE porte d''attribution de numéro + création de fiche (aucun numéro consommé '
  'sans fiche). FRONTIÈRE service_role : p_workshop_id / p_client_id NE DOIVENT PAS '
  'être fournis librement par le client ; l''Edge Function dérive l''identité d''un '
  'JWT vérifié et contrôle appartenance + rôle AVANT l''appel (exigences bloquantes '
  'Phases 3–4).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Droits EXECUTE strictement nécessaires (point 5). Rôles Supabase garantis
--    en prod ; garde d'existence pour un Postgres nu de test.
--      current_workshop_ids   → authenticated (appelée dans les politiques RLS)
--      create_fiche_from_draft → service_role  (Edge Function ; SEULE porte)
--      provision_workshop      → service_role  (Edge Function)
--      set_updated_at / sync_owner_membership / protect_owner_membership
--                              → aucun grant (déclencheurs)
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function app_hidden.current_workshop_ids()                     from anon;
    revoke all on function app_hidden.create_fiche_from_draft(uuid, uuid, jsonb) from anon;
    revoke all on function app_hidden.provision_workshop(uuid, text)             from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function app_hidden.create_fiche_from_draft(uuid, uuid, jsonb) from authenticated;
    revoke all on function app_hidden.provision_workshop(uuid, text)             from authenticated;
    grant usage   on schema app_hidden                          to authenticated;
    grant execute on function app_hidden.current_workshop_ids() to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage   on schema app_hidden to service_role;
    grant execute on function app_hidden.create_fiche_from_draft(uuid, uuid, jsonb) to service_role;
    grant execute on function app_hidden.provision_workshop(uuid, text)             to service_role;
  end if;
end;
$$;
