-- harden_legacy_import_idempotency (Phase 6B0)
--
-- CONTEXTE (corr. R, D9) : `app_hidden.create_fiche_from_draft()` ALLOUE
-- elle-même le numéro suivant depuis `carnets.next_number` — elle n'accepte
-- AUCUN numéro en paramètre. Rejouer un carnet legacy `1, 2, 5` via 3 appels
-- produirait `1, 2, 3` (numéros perdus), jamais `1, 2, 5` : elle est donc
-- STRUCTURELLEMENT interdite pour l'import legacy et reste exclusivement la
-- porte de la création métier NORMALE (Phase 9A/9). L'import a besoin d'un
-- chemin serveur entièrement distinct — c'est l'objet de cette migration et
-- des fonctions `app_hidden.import_legacy_*` ci-dessous.
--
-- PRINCIPE D'IDEMPOTENCE (acté définitivement, corr. R) : `migrationMap`
-- (IndexedDB, côté client) n'est JAMAIS l'autorité — un accélérateur de
-- reprise uniquement. L'AUTORITÉ EST POSTGRESQL : contraintes `UNIQUE`
-- partielles tenant-aware + verrou advisory par clé logique dans chaque
-- fonction `import_legacy_*`. Effacer IndexedDB, changer de navigateur, ou
-- crasher entre l'INSERT serveur et l'écriture de `migrationMap` ne doit
-- JAMAIS produire de doublon.
--
-- FRONTIÈRE service_role (corr. Q, même schéma que `create_fiche_from_draft`/
-- `provision_workshop`) : `service_role` n'a AUCUN privilège de table direct
-- généralisé sur ce projet — seules ces fonctions `SECURITY DEFINER`
-- (`search_path=''`, noms qualifiés) peuvent écrire dans les tables métier
-- pour l'import legacy. `EXECUTE` réservé au SEUL `service_role`. Aucun
-- `INSERT` brut `service_role` sur une table métier n'est jamais introduit —
-- voir T75 (test dédié à cette absence).
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. modeles.metadata — colonne absente à ce jour (vérifié dans
--    20260829120100_create_core_schema.sql : modeles n'a que
--    id/workshop_id/nom/created_at/updated_at/deleted_at). Nécessaire pour
--    porter metadata.legacy_id (idempotence import) comme les autres tables.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.modeles
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. fiches — l'index `fiches_legacy_id_idx` existant (Phase 2) n'est PAS
--    `UNIQUE` : il accélère une recherche mais n'empêche AUCUN doublon.
--    Remplacé par un index UNIQUE partiel tenant-aware — l'index simple
--    devient redondant (même expression), donc retiré plutôt que conservé
--    en double.
-- ═════════════════════════════════════════════════════════════════════════════
drop index if exists public.fiches_legacy_id_idx;

create unique index fiches_workshop_legacy_id_uidx
  on public.fiches (workshop_id, (metadata ->> 'legacy_id'))
  where metadata ? 'legacy_id';

comment on index public.fiches_workshop_legacy_id_uidx is
  'Idempotence import legacy (Phase 6B0) — un legacy_id donné ne peut exister '
  'qu''UNE fois par atelier ; le même legacy_id dans deux ateliers différents '
  'ne crée jamais de collision (workshop_id fait partie de la clé).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. clients — aucun index d'idempotence legacy à ce jour. Le téléphone seul
--    est insuffisant comme clé (absent/malformé/plusieurs identités legacy
--    possibles, décision D4) — d'où metadata.legacy_id, même principe que
--    fiches/modeles.
-- ═════════════════════════════════════════════════════════════════════════════
create unique index clients_workshop_legacy_id_uidx
  on public.clients (workshop_id, (metadata ->> 'legacy_id'))
  where metadata ? 'legacy_id';

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. modeles — même principe ; le `nom` seul n'est PAS une clé d'idempotence
--    fiable (deux modèles peuvent légitimement porter le même nom).
-- ═════════════════════════════════════════════════════════════════════════════
create unique index modeles_workshop_legacy_id_uidx
  on public.modeles (workshop_id, (metadata ->> 'legacy_id'))
  where metadata ? 'legacy_id';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. client_payments — au plus UN paiement legacy importé par fiche (décision
--    D6). Défense en profondeur OBLIGATOIRE (corr. R, pas optionnelle) :
--    protège un retry après crash, une reprise sur un second appareil, ou un
--    appel concurrent — pas seulement `migrationMap`.
-- ═════════════════════════════════════════════════════════════════════════════
create unique index client_payments_one_legacy_per_fiche_uidx
  on public.client_payments (fiche_id)
  where metadata ->> 'source' = 'legacy_import';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Carnets — AUCUNE nouvelle contrainte : `unique (workshop_id, number)`
--    (Phase 2, déjà existante) est déjà la clé d'idempotence naturelle et
--    suffisante pour `import_legacy_carnet` ci-dessous.
--
-- 7. Médias — AUCUNE nouvelle contrainte : `unique(storage_path) where
--    deleted_at is null` existe déjà sur `media_assets` ET `modele_medias`
--    (Phase 2) et reste la garantie centrale d'idempotence, à condition que
--    le `storage_path` construit par l'Edge Function soit déterministe
--    (jamais `crypto.randomUUID()` pour un chemin d'import — voir
--    supabase/functions/import-legacy-data/index.ts).
-- ═════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. app_hidden.import_legacy_client — retrouve/crée un client par
--    (workshop_id, legacy_id). Décision D2 : `display_name` = nom legacy
--    VERBATIM, jamais découpé par heuristique ("premier mot = prénom").
--    `first_name`/`last_name` restent NULL sauf si le CALLER (6B, pas 6B0)
--    les fournit explicitement depuis une source fiable.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_client(
  p_workshop_id   uuid,
  p_legacy_id     text,
  p_display_name  text,
  p_first_name    text default null,
  p_last_name     text default null,
  p_phone_e164    text default null,
  p_phone_display text default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client   public.clients;
  v_metadata jsonb;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_client: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_legacy_id is null or btrim(p_legacy_id) = '' then
    raise exception 'import_legacy_client: legacy_id requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'import_legacy_client: display_name requis' using errcode = 'null_value_not_allowed';
  end if;

  -- Verrou advisory scopé (atelier, entité, legacy_id) — sérialise deux appels
  -- concurrents identiques ; la contrainte UNIQUE reste la défense finale.
  perform pg_advisory_xact_lock(hashtextextended('import_legacy_client:' || p_workshop_id::text || ':' || p_legacy_id, 42));

  select * into v_client
  from public.clients
  where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
  limit 1;
  if found then
    return v_client;
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('legacy_id', p_legacy_id);

  insert into public.clients (workshop_id, display_name, first_name, last_name, phone_e164, phone_display, metadata)
  values (p_workshop_id, p_display_name, p_first_name, p_last_name, p_phone_e164, p_phone_display, v_metadata)
  on conflict (workshop_id, (metadata ->> 'legacy_id')) where metadata ? 'legacy_id'
  do nothing
  returning * into v_client;

  if not found then
    -- Un appel concurrent a gagné la course (même après le verrou advisory,
    -- défense en profondeur) — retrouver la ligne qu'il a créée.
    select * into v_client
    from public.clients
    where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
    limit 1;
  end if;

  return v_client;
end;
$$;
revoke all on function app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. app_hidden.import_legacy_carnet — préserve le `number` legacy EXACT (pas
--    d'allocation automatique), positionne `next_number` d'un seul coup
--    (calculé par l'appelant à partir de MAX(numéro legacy de ce carnet)+1 —
--    jamais incrémentalement comme `create_fiche_from_draft`). Idempotence
--    NATURELLE via `unique(workshop_id, number)` (Phase 2, aucune migration
--    nécessaire pour les carnets).
--
--    CORRECTIF revue PR #20 (§1) : `p_status` explicite — le mapping
--    canonique Phase 6 exige que SEUL le carnet legacy le plus élevé soit
--    `active`, tous les précédents `archived`. Défaut `'active'` conservé
--    pour la compatibilité des appels existants (mono-carnet), mais 6B doit
--    fournir explicitement `'archived'` pour tout carnet non courant. Aucune
--    valeur arbitraire : seules `active`/`archived` sont acceptées ici — le
--    3ᵉ membre de l'enum (`full`) n'a pas de sens pour un import legacy
--    (calculé dynamiquement par l'app normale, jamais fourni à l'import) et
--    est donc explicitement refusé. Jamais un second UPDATE après création :
--    le statut fait partie de l'INSERT initial, dans le même chemin
--    idempotent.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_carnet(
  p_workshop_id uuid,
  p_number      int,
  p_next_number int,
  p_status      public.carnet_status default 'active'
)
returns public.carnets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carnet public.carnets;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_carnet: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'import_legacy_carnet: number invalide' using errcode = 'invalid_parameter_value';
  end if;
  if p_next_number is null or p_next_number < 1 then
    raise exception 'import_legacy_carnet: next_number invalide' using errcode = 'invalid_parameter_value';
  end if;
  if p_status is null or p_status not in ('active', 'archived') then
    raise exception 'import_legacy_carnet: status % invalide — attendu active/archived uniquement (jamais full, calculé par l''app normale)', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_carnet:' || p_workshop_id::text || ':' || p_number::text, 42));

  select * into v_carnet
  from public.carnets
  where workshop_id = p_workshop_id and number = p_number;
  if found then
    return v_carnet;
  end if;

  insert into public.carnets (workshop_id, number, status, next_number)
  values (p_workshop_id, p_number, p_status, p_next_number)
  on conflict (workshop_id, number) do nothing
  returning * into v_carnet;

  if not found then
    select * into v_carnet
    from public.carnets
    where workshop_id = p_workshop_id and number = p_number;
  end if;

  return v_carnet;
end;
$$;
revoke all on function app_hidden.import_legacy_carnet(uuid, int, int, public.carnet_status) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. app_hidden.import_legacy_fiche — préserve le `number` legacy EXACT,
--     jamais `create_fiche_from_draft` (voir en-tête). `page_number`/
--     `slot_number` calculés avec la MÊME formule canonique que
--     `create_fiche_from_draft` (contrainte `fiches_page_slot_coherent`).
--     Mappe les statuts app legacy → enum cible (décision D8). Idempotente
--     par (workshop_id, legacy_id) — voir index §2 ci-dessus.
--
--     CORRECTIF revue PR #20 (§2) : `p_created_at`/`p_settled_at` explicites
--     — le mapping canonique Phase 6 est `f.createdAt -> created_at` et
--     `f.soldeLe -> settled_at`, perdus sans ces paramètres. Comportement :
--     `created_at` = valeur legacy fournie, sinon `now()` UNIQUEMENT si
--     réellement absente (jamais une heuristique) ; `settled_at` = valeur
--     legacy fournie ou NULL. `updated_at` continue de ne recevoir AUCUNE
--     valeur explicite ici : `trg_fiches_updated_at` ne se déclenche que sur
--     UPDATE (jamais INSERT — vérifié dans
--     20260829120400_create_functions_and_triggers.sql), donc le défaut de
--     colonne `now()` s'applique à l'INSERT, exactement le comportement
--     cible. Ajoutés en DERNIÈRE position (après p_metadata) pour que tout
--     appel positionnel existant (tests, wrapper) reste valide sans
--     modification si ces 2 valeurs ne sont pas fournies.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_fiche(
  p_workshop_id    uuid,
  p_carnet_id      uuid,
  p_client_id      uuid,
  p_legacy_id      text,
  p_number         int,
  p_legacy_status  text,
  p_measurements   jsonb default '{}'::jsonb,
  p_garment        text default '',
  p_description    text default null,
  p_fabric_notes   text default null,
  p_quantity       int default 1,
  p_due_date       date default null,
  p_total_price    int default 0,
  p_metadata       jsonb default '{}'::jsonb,
  p_created_at     timestamptz default null,
  p_settled_at     timestamptz default null
)
returns public.fiches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fiche      public.fiches;
  v_status     public.fiche_status;
  v_page       int;
  v_slot       int;
  v_metadata   jsonb;
  v_created_at timestamptz;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_fiche: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_carnet_id is null then
    raise exception 'import_legacy_fiche: carnet requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_legacy_id is null or btrim(p_legacy_id) = '' then
    raise exception 'import_legacy_fiche: legacy_id requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'import_legacy_fiche: number invalide' using errcode = 'invalid_parameter_value';
  end if;
  -- Défense en profondeur (le carnet doit appartenir au MÊME atelier) — la FK
  -- composite fiches_carnet_same_workshop_fk le garantirait de toute façon à
  -- l'INSERT, mais un rejet explicite ici donne un message clair.
  if not exists (select 1 from public.carnets where id = p_carnet_id and workshop_id = p_workshop_id) then
    raise exception 'import_legacy_fiche: carnet % hors de l''atelier %', p_carnet_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_fiche:' || p_workshop_id::text || ':' || p_legacy_id, 42));

  select * into v_fiche
  from public.fiches
  where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
  limit 1;
  if found then
    return v_fiche;
  end if;

  -- Mapping des statuts (décision D8) — accepte le libellé app legacy
  -- ('recu'/'couture'/'pret'/'livre') OU déjà la valeur enum cible ; toute
  -- autre valeur retombe sur 'received' (jamais une exception pour un statut
  -- legacy inconnu — l'import ne doit pas bloquer sur un détail cosmétique).
  v_status := case p_legacy_status
    when 'recu'      then 'received'
    when 'couture'   then 'sewing'
    when 'pret'      then 'ready'
    when 'livre'     then 'delivered'
    when 'received'  then 'received'
    when 'sewing'    then 'sewing'
    when 'ready'     then 'ready'
    when 'delivered' then 'delivered'
    else 'received'
  end::public.fiche_status;

  -- Même formule canonique que app_hidden.create_fiche_from_draft (30 pages × 4).
  v_page := ((p_number - 1) / 4) + 1;
  v_slot := ((p_number - 1) % 4) + 1;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('legacy_id', p_legacy_id);
  -- `created_at` : valeur legacy si fournie, `now()` UNIQUEMENT si réellement
  -- absente (jamais une heuristique — corr. PR #20 §2).
  v_created_at := coalesce(p_created_at, now());

  begin
    insert into public.fiches (
      workshop_id, carnet_id, client_id, number, page_number, slot_number,
      state, status, measurements, garment, description, fabric_notes,
      quantity, due_date, total_price, metadata, created_at, settled_at
    ) values (
      p_workshop_id, p_carnet_id, p_client_id, p_number, v_page, v_slot, 'active', v_status,
      coalesce(p_measurements, '{}'::jsonb),
      coalesce(p_garment, ''),
      nullif(btrim(coalesce(p_description,  ''), E' \t\n\r\f\v'), ''),
      nullif(btrim(coalesce(p_fabric_notes, ''), E' \t\n\r\f\v'), ''),
      coalesce(p_quantity, 1),
      p_due_date,
      coalesce(p_total_price, 0),
      v_metadata,
      v_created_at,
      p_settled_at
    )
    on conflict (workshop_id, (metadata ->> 'legacy_id')) where metadata ? 'legacy_id'
    do nothing
    returning * into v_fiche;
  exception when foreign_key_violation then
    raise exception 'import_legacy_fiche: client % hors de l''atelier %', p_client_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end;

  if not found then
    select * into v_fiche
    from public.fiches
    where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
    limit 1;
  end if;

  return v_fiche;
end;
$$;
revoke all on function app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. app_hidden.import_legacy_payment — décision D6. Au plus UN paiement
--     legacy par fiche (index §5 ci-dessus). N'est appelée que pour une
--     avance historique > 0 (responsabilité de l'appelant — l'orchestration
--     Edge Function/6B) ; `amount > 0` reste vérifié ici aussi (défense en
--     profondeur, la contrainte CHECK existante est la garantie finale).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_payment(
  p_workshop_id uuid,
  p_fiche_id    uuid,
  p_amount      int,
  p_recorded_at timestamptz default now()
)
returns public.client_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.client_payments;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_payment: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_fiche_id is null then
    raise exception 'import_legacy_payment: fiche requise' using errcode = 'null_value_not_allowed';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'import_legacy_payment: montant invalide (doit être > 0)' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.fiches where id = p_fiche_id and workshop_id = p_workshop_id) then
    raise exception 'import_legacy_payment: fiche % hors de l''atelier %', p_fiche_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_payment:' || p_fiche_id::text, 42));

  select * into v_payment
  from public.client_payments
  where fiche_id = p_fiche_id and metadata ->> 'source' = 'legacy_import'
  limit 1;
  if found then
    return v_payment;
  end if;

  insert into public.client_payments (workshop_id, fiche_id, amount, paid_at, recorded_at, method, note, metadata)
  values (
    p_workshop_id, p_fiche_id, p_amount, null, coalesce(p_recorded_at, now()), null,
    'Reprise du carnet — date du versement inconnue',
    jsonb_build_object('source', 'legacy_import')
  )
  on conflict (fiche_id) where metadata ->> 'source' = 'legacy_import'
  do nothing
  returning * into v_payment;

  if not found then
    select * into v_payment
    from public.client_payments
    where fiche_id = p_fiche_id and metadata ->> 'source' = 'legacy_import'
    limit 1;
  end if;

  return v_payment;
end;
$$;
revoke all on function app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. app_hidden.import_legacy_modele — même principe que import_legacy_client.
--     Le `nom` n'est PAS une clé d'idempotence (deux modèles peuvent porter
--     le même nom) — seul `(workshop_id, legacy_id)` fait foi.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_modele(
  p_workshop_id uuid,
  p_legacy_id   text,
  p_nom         text,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.modeles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modele   public.modeles;
  v_metadata jsonb;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_modele: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_legacy_id is null or btrim(p_legacy_id) = '' then
    raise exception 'import_legacy_modele: legacy_id requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'import_legacy_modele: nom requis' using errcode = 'null_value_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_modele:' || p_workshop_id::text || ':' || p_legacy_id, 42));

  select * into v_modele
  from public.modeles
  where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
  limit 1;
  if found then
    return v_modele;
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('legacy_id', p_legacy_id);

  insert into public.modeles (workshop_id, nom, metadata)
  values (p_workshop_id, p_nom, v_metadata)
  on conflict (workshop_id, (metadata ->> 'legacy_id')) where metadata ? 'legacy_id'
  do nothing
  returning * into v_modele;

  if not found then
    select * into v_modele
    from public.modeles
    where workshop_id = p_workshop_id and metadata ->> 'legacy_id' = p_legacy_id
    limit 1;
  end if;

  return v_modele;
end;
$$;
revoke all on function app_hidden.import_legacy_modele(uuid, text, text, jsonb) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. app_hidden.import_legacy_media_asset — médias de FICHE uniquement
--     (`fiche_id not null`, corr. D7/R). L'upload Storage a DÉJÀ eu lieu côté
--     Edge Function (storage_path déterministe, jamais une écriture SQL) ;
--     cette fonction crée/retrouve la ligne `media_assets` correspondante,
--     idempotente sur `storage_path` (contrainte déjà existante, Phase 2).
--     `type = 'model_photo'` est explicitement REFUSÉ ici (réservé à
--     `modele_medias` / `import_legacy_modele_media` ci-dessous).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_media_asset(
  p_workshop_id  uuid,
  p_fiche_id     uuid,
  p_type         text,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint default 0,
  p_metadata     jsonb default '{}'::jsonb
)
returns public.media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media_assets;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_media_asset: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_fiche_id is null then
    raise exception 'import_legacy_media_asset: fiche requise' using errcode = 'null_value_not_allowed';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'import_legacy_media_asset: storage_path requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_type is null or p_type not in ('fabric_photo', 'voice_note', 'signature') then
    raise exception 'import_legacy_media_asset: type % invalide — attendu fabric_photo/voice_note/signature '
      '(model_photo réservé à modele_medias/import_legacy_modele_media)', p_type
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.fiches where id = p_fiche_id and workshop_id = p_workshop_id) then
    raise exception 'import_legacy_media_asset: fiche % hors de l''atelier %', p_fiche_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_media_asset:' || p_storage_path, 42));

  select * into v_media
  from public.media_assets
  where storage_path = p_storage_path and deleted_at is null;
  if found then
    return v_media;
  end if;

  insert into public.media_assets (workshop_id, fiche_id, type, storage_path, mime_type, size_bytes, metadata)
  values (p_workshop_id, p_fiche_id, p_type::public.media_type, p_storage_path, p_mime_type, coalesce(p_size_bytes, 0), coalesce(p_metadata, '{}'::jsonb))
  on conflict (storage_path) where deleted_at is null
  do nothing
  returning * into v_media;

  if not found then
    select * into v_media
    from public.media_assets
    where storage_path = p_storage_path and deleted_at is null;
  end if;

  return v_media;
end;
$$;
revoke all on function app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 14. app_hidden.import_legacy_modele_media — médias de MODÈLE uniquement,
--     table `modele_medias` (jamais `media_assets`, corr. D7/R). Même
--     principe d'idempotence sur `storage_path`.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function app_hidden.import_legacy_modele_media(
  p_workshop_id  uuid,
  p_modele_id    uuid,
  p_kind         text,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint default 0,
  p_position     int default 0,
  p_metadata     jsonb default '{}'::jsonb
)
returns public.modele_medias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.modele_medias;
begin
  if p_workshop_id is null then
    raise exception 'import_legacy_modele_media: workshop requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_modele_id is null then
    raise exception 'import_legacy_modele_media: modèle requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'import_legacy_modele_media: storage_path requis' using errcode = 'null_value_not_allowed';
  end if;
  if p_kind is null or p_kind not in ('photo', 'patron') then
    raise exception 'import_legacy_modele_media: kind % invalide — attendu photo/patron', p_kind
      using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.modeles where id = p_modele_id and workshop_id = p_workshop_id) then
    raise exception 'import_legacy_modele_media: modèle % hors de l''atelier %', p_modele_id, p_workshop_id
      using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('import_legacy_modele_media:' || p_storage_path, 42));

  select * into v_media
  from public.modele_medias
  where storage_path = p_storage_path and deleted_at is null;
  if found then
    return v_media;
  end if;

  insert into public.modele_medias (workshop_id, modele_id, kind, storage_path, mime_type, size_bytes, position, metadata)
  values (p_workshop_id, p_modele_id, p_kind, p_storage_path, p_mime_type, coalesce(p_size_bytes, 0), coalesce(p_position, 0), coalesce(p_metadata, '{}'::jsonb))
  on conflict (storage_path) where deleted_at is null
  do nothing
  returning * into v_media;

  if not found then
    select * into v_media
    from public.modele_medias
    where storage_path = p_storage_path and deleted_at is null;
  end if;

  return v_media;
end;
$$;
revoke all on function app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 15. Wrappers `public.*_api` — SEULE porte PostgREST vers les fonctions
--     `app_hidden` ci-dessus (`app_hidden` n'est pas dans `[api].schemas`,
--     même limite déjà rencontrée pour `create_fiche_from_draft_api`/
--     `provision_workshop_api`). SECURITY INVOKER (jamais DEFINER — relaie
--     seulement un appel déjà DEFINER), `search_path=''`, noms qualifiés,
--     EXECUTE réservé à `service_role`. Aucun privilège métier propre.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.import_legacy_client_api(
  p_workshop_id   uuid,
  p_legacy_id     text,
  p_display_name  text,
  p_first_name    text default null,
  p_last_name     text default null,
  p_phone_e164    text default null,
  p_phone_display text default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns public.clients
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_client(p_workshop_id, p_legacy_id, p_display_name, p_first_name, p_last_name, p_phone_e164, p_phone_display, p_metadata);
$$;
revoke all on function public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb) from public;

create or replace function public.import_legacy_carnet_api(
  p_workshop_id uuid,
  p_number      int,
  p_next_number int,
  p_status      public.carnet_status default 'active'
)
returns public.carnets
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_carnet(p_workshop_id, p_number, p_next_number, p_status);
$$;
revoke all on function public.import_legacy_carnet_api(uuid, int, int, public.carnet_status) from public;

create or replace function public.import_legacy_fiche_api(
  p_workshop_id    uuid,
  p_carnet_id      uuid,
  p_client_id      uuid,
  p_legacy_id      text,
  p_number         int,
  p_legacy_status  text,
  p_measurements   jsonb default '{}'::jsonb,
  p_garment        text default '',
  p_description    text default null,
  p_fabric_notes   text default null,
  p_quantity       int default 1,
  p_due_date       date default null,
  p_total_price    int default 0,
  p_metadata       jsonb default '{}'::jsonb,
  p_created_at     timestamptz default null,
  p_settled_at     timestamptz default null
)
returns public.fiches
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_fiche(p_workshop_id, p_carnet_id, p_client_id, p_legacy_id, p_number, p_legacy_status, p_measurements, p_garment, p_description, p_fabric_notes, p_quantity, p_due_date, p_total_price, p_metadata, p_created_at, p_settled_at);
$$;
revoke all on function public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from public;

create or replace function public.import_legacy_payment_api(
  p_workshop_id uuid,
  p_fiche_id    uuid,
  p_amount      int,
  p_recorded_at timestamptz default now()
)
returns public.client_payments
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_payment(p_workshop_id, p_fiche_id, p_amount, p_recorded_at);
$$;
revoke all on function public.import_legacy_payment_api(uuid, uuid, int, timestamptz) from public;

create or replace function public.import_legacy_modele_api(
  p_workshop_id uuid,
  p_legacy_id   text,
  p_nom         text,
  p_metadata    jsonb default '{}'::jsonb
)
returns public.modeles
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_modele(p_workshop_id, p_legacy_id, p_nom, p_metadata);
$$;
revoke all on function public.import_legacy_modele_api(uuid, text, text, jsonb) from public;

create or replace function public.import_legacy_media_asset_api(
  p_workshop_id  uuid,
  p_fiche_id     uuid,
  p_type         text,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint default 0,
  p_metadata     jsonb default '{}'::jsonb
)
returns public.media_assets
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_media_asset(p_workshop_id, p_fiche_id, p_type, p_storage_path, p_mime_type, p_size_bytes, p_metadata);
$$;
revoke all on function public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb) from public;

create or replace function public.import_legacy_modele_media_api(
  p_workshop_id  uuid,
  p_modele_id    uuid,
  p_kind         text,
  p_storage_path text,
  p_mime_type    text,
  p_size_bytes   bigint default 0,
  p_position     int default 0,
  p_metadata     jsonb default '{}'::jsonb
)
returns public.modele_medias
language sql
security invoker
set search_path = ''
as $$
  select app_hidden.import_legacy_modele_media(p_workshop_id, p_modele_id, p_kind, p_storage_path, p_mime_type, p_size_bytes, p_position, p_metadata);
$$;
revoke all on function public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb) from public;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16. Grants — même schéma que Phase 9A (create_fiche_from_draft) : revoke
--     explicite anon/authenticated (défense en profondeur — ils ne peuvent de
--     toute façon pas résoudre `app_hidden` via PostgREST), EXECUTE à
--     service_role UNIQUEMENT sur les wrappers `public` (la seule porte
--     réellement empruntée par l'Edge Function) ET sur les fonctions
--     `app_hidden` elles-mêmes (les wrappers sont SECURITY INVOKER :
--     l'appelant — service_role — a besoin d'EXECUTE sur la fonction interne
--     qu'il appelle). AUCUN GRANT de table n'est ajouté ici, à
--     `service_role` ou à quiconque — voir T75.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regrole('anon') is not null then
    revoke all on function app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb) from anon;
    revoke all on function app_hidden.import_legacy_carnet(uuid, int, int, public.carnet_status) from anon;
    revoke all on function app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from anon;
    revoke all on function app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz) from anon;
    revoke all on function app_hidden.import_legacy_modele(uuid, text, text, jsonb) from anon;
    revoke all on function app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb) from anon;
    revoke all on function app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb) from anon;
    revoke all on function public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb) from anon;
    revoke all on function public.import_legacy_carnet_api(uuid, int, int, public.carnet_status) from anon;
    revoke all on function public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from anon;
    revoke all on function public.import_legacy_payment_api(uuid, uuid, int, timestamptz) from anon;
    revoke all on function public.import_legacy_modele_api(uuid, text, text, jsonb) from anon;
    revoke all on function public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb) from anon;
    revoke all on function public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb) from anon;
  end if;

  if to_regrole('authenticated') is not null then
    revoke all on function app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb) from authenticated;
    revoke all on function app_hidden.import_legacy_carnet(uuid, int, int, public.carnet_status) from authenticated;
    revoke all on function app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from authenticated;
    revoke all on function app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz) from authenticated;
    revoke all on function app_hidden.import_legacy_modele(uuid, text, text, jsonb) from authenticated;
    revoke all on function app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb) from authenticated;
    revoke all on function app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb) from authenticated;
    revoke all on function public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb) from authenticated;
    revoke all on function public.import_legacy_carnet_api(uuid, int, int, public.carnet_status) from authenticated;
    revoke all on function public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) from authenticated;
    revoke all on function public.import_legacy_payment_api(uuid, uuid, int, timestamptz) from authenticated;
    revoke all on function public.import_legacy_modele_api(uuid, text, text, jsonb) from authenticated;
    revoke all on function public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb) from authenticated;
    revoke all on function public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb) from authenticated;
  end if;

  if to_regrole('service_role') is not null then
    grant execute on function app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb) to service_role;
    grant execute on function app_hidden.import_legacy_carnet(uuid, int, int, public.carnet_status) to service_role;
    grant execute on function app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) to service_role;
    grant execute on function app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz) to service_role;
    grant execute on function app_hidden.import_legacy_modele(uuid, text, text, jsonb) to service_role;
    grant execute on function app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb) to service_role;
    grant execute on function app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb) to service_role;
    grant execute on function public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb) to service_role;
    grant execute on function public.import_legacy_carnet_api(uuid, int, int, public.carnet_status) to service_role;
    grant execute on function public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz) to service_role;
    grant execute on function public.import_legacy_payment_api(uuid, uuid, int, timestamptz) to service_role;
    grant execute on function public.import_legacy_modele_api(uuid, text, text, jsonb) to service_role;
    grant execute on function public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb) to service_role;
    grant execute on function public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb) to service_role;
  end if;
end;
$$;
