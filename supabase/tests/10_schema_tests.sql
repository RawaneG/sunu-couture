-- 10_schema_tests.sql — tests de schéma Phase 2 (contraintes, index, fonctions,
-- RLS activée, durcissement). COMPLÉMENTAIRE à `supabase db reset` + advisors.
--
-- Exécuter :  psql -v ON_ERROR_STOP=1 -f 10_schema_tests.sql
-- Tout est joué dans UNE transaction puis ROLLBACK — répétable, ne laisse rien.
-- Un RAISE EXCEPTION non rattrapé => psql sort en erreur => test rouge.

\set ON_ERROR_STOP on
begin;

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, phone) values
  ('11111111-1111-1111-1111-111111111111', '+221770000001'),
  ('22222222-2222-2222-2222-222222222222', '+221770000002'),
  ('33333333-3333-3333-3333-333333333333', '+221770000003');

-- Le déclencheur trg_workshops_sync_owner crée AUTOMATIQUEMENT la ligne
-- workshop_members(role='owner') — on n'insère donc PAS cette ligne à la main.
insert into public.workshops (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Atelier Test', '11111111-1111-1111-1111-111111111111');

insert into public.carnets (id, workshop_id, number) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1);

insert into public.clients (id, workshop_id, display_name, phone_e164) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Awa Diouf', '+221775124408');

insert into public.fiches (id, workshop_id, carnet_id, client_id, number, page_number, slot_number, state, status, total_price)
values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        1, 1, 1, 'active', 'received', 25000);

-- ── T1 — versement négatif ET nul rejetés (CHECK amount > 0) ────────────────
do $$
begin
  insert into public.client_payments (workshop_id, fiche_id, amount)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', -1);
  raise exception 'T1a FAIL: montant négatif accepté';
exception when check_violation then raise notice 'T1a OK — montant négatif rejeté';
end;
$$;
do $$
begin
  insert into public.client_payments (workshop_id, fiche_id, amount)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 0);
  raise exception 'T1b FAIL: montant nul accepté';
exception when check_violation then raise notice 'T1b OK — montant nul rejeté (amount > 0)';
end;
$$;

-- ── T2 — paid_at NULL autorisé (décision D6, import legacy) ─────────────────
insert into public.client_payments (workshop_id, fiche_id, amount, paid_at, note, metadata)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        10000, null, 'Reprise du carnet — date du versement inconnue',
        '{"source":"legacy_import"}'::jsonb);
do $$
begin
  if (select count(*) from public.client_payments
      where fiche_id = 'dddddddd-0000-0000-0000-000000000001' and paid_at is null) <> 1 then
    raise exception 'T2 FAIL: versement paid_at NULL non enregistré';
  end if;
  raise notice 'T2 OK  — paid_at NULL accepté';
end;
$$;

-- ── T3 — reste = total_price − Σ(amount), négatif possible (sur-paiement) ────
insert into public.client_payments (workshop_id, fiche_id, amount, paid_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 20000, now());
do $$
declare v_reste int; v_paid int;
begin
  select reste, total_paid into v_reste, v_paid
  from public.fiche_balances where fiche_id = 'dddddddd-0000-0000-0000-000000000001';
  if v_paid <> 30000 or v_reste <> -5000 then
    raise exception 'T3 FAIL: total_paid=% reste=% (attendu 30000 / -5000)', v_paid, v_reste;
  end if;
  raise notice 'T3 OK  — fiche_balances : total_paid=% reste=%', v_paid, v_reste;
end;
$$;

-- ── T4 — doublon (carnet_id, number) rejeté ────────────────────────────────
do $$
begin
  insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number, state, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 1, 1, 'active', 'received');
  raise exception 'T4 FAIL: fiche n°1 dupliquée acceptée';
exception when unique_violation then raise notice 'T4 OK  — doublon (carnet_id, number) rejeté';
end;
$$;

-- ── T5 — page_number / slot_number incohérents avec number rejetés ─────────
do $$
begin
  insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number, state, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 5, 1, 1, 'active', 'received');
  raise exception 'T5 FAIL: page/slot incohérents acceptés';
exception when check_violation then raise notice 'T5 OK  — cohérence page/slot/number vérifiée';
end;
$$;

-- ── T6 — unicité téléphone partielle (décision D3) ────────────────────────
insert into public.clients (workshop_id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Sans Tel Un'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Sans Tel Deux');   -- 2 clients SANS tel → OK
do $$
begin
  insert into public.clients (workshop_id, display_name, phone_e164)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Doublon Awa', '+221775124408');
  raise exception 'T6b FAIL: téléphone dupliqué accepté';
exception when unique_violation then raise notice 'T6b OK — doublon téléphone (client actif) rejeté';
end;
$$;
update public.clients set deleted_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
insert into public.clients (workshop_id, display_name, phone_e164)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Awa (nouvelle)', '+221775124408');
do $$ begin raise notice 'T6c OK — téléphone réutilisable après suppression logique'; end; $$;

-- ── T6d — regex E.164 ────────────────────────────────────────────────────
do $$
begin
  insert into public.clients (workshop_id, display_name, phone_e164)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Mauvais Tel', '77 512 44 08');
  raise exception 'T6d FAIL: téléphone non E.164 accepté';
exception when check_violation then raise notice 'T6d OK — format E.164 imposé';
end;
$$;

-- ── T7 — un seul owner par atelier ───────────────────────────────────────
do $$
begin
  insert into public.workshop_members (workshop_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');
  raise exception 'T7 FAIL: deuxième owner accepté';
exception when unique_violation then raise notice 'T7 OK  — un seul owner par atelier';
end;
$$;
insert into public.workshop_members (workshop_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'assistant');

-- ── T8 — un numéro archivé n'est JAMAIS réattribué (unique (carnet_id, number)) ─
--    (la séquence / bascule de carnet est couverte par T24 ; l'allocation de
--     numéro n'a plus qu'une seule porte, app_hidden.create_fiche_from_draft — T33.)
insert into public.carnets (id, workshop_id, number, fiches_par_carnet)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2, 2);
insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number, state, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 1, 1, 1, 'active', 'received'),
       ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 2, 1, 2, 'active', 'received');
update public.fiches set state = 'archived', deleted_at = now()
where carnet_id = 'bbbbbbbb-0000-0000-0000-000000000002' and number = 2;
do $$
begin
  insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number, state, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 2, 1, 2, 'active', 'received');
  raise exception 'T8 FAIL: numéro 2 réutilisé après archivage';
exception when unique_violation then raise notice 'T8 OK  — numéro archivé jamais réattribué';
end;
$$;

-- ── T9 — carnets.next_number hors bornes rejeté ──────────────────────────
do $$
begin
  insert into public.carnets (workshop_id, number, fiches_par_carnet, next_number)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 99, 120, 200);
  raise exception 'T9 FAIL: next_number=200 accepté pour cap 120';
exception when check_violation then raise notice 'T9 OK  — next_number borné à [1, cap+1]';
end;
$$;

-- ── T10 — subscription_transactions : idempotence (provider, idempotency_key) ─
insert into public.subscription_transactions (workshop_id, provider, amount, idempotency_key, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'manual', 1000, 'idem-key-001', 'validated');
do $$
begin
  insert into public.subscription_transactions (workshop_id, provider, amount, idempotency_key, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'manual', 1000, 'idem-key-001', 'validated');
  raise exception 'T10 FAIL: clé d''idempotence dupliquée acceptée';
exception when unique_violation then raise notice 'T10 OK — (provider, idempotency_key) unique';
end;
$$;

-- ── T11 — subscription_plans VIDE après migrations (seed = brouillon, instr. 8) ─
do $$
declare v_count int;
begin
  select count(*) into v_count from public.subscription_plans;
  if v_count <> 0 then
    raise exception 'T11 FAIL: subscription_plans contient % ligne(s) — aucun seed attendu', v_count;
  end if;
  -- structure OK : un plan inséré à la volée + FK (subscriptions & promo_codes)
  insert into public.subscription_plans (code, label, period, price_fcfa, is_active)
  values ('_probe', 'probe', 'trial', 0, false);
  insert into public.subscriptions (workshop_id, plan_code)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '_probe');
  begin
    insert into public.promo_codes (code, plan_code) values ('_probe_promo', 'plan_inexistant');
    raise exception 'T11 FAIL: FK plan_code non vérifiée';
  exception when foreign_key_violation then null;
  end;
  raise notice 'T11 OK — subscription_plans vide ; structure & FK plan_code OK';
end;
$$;

-- ── T12 — sync_conflicts : au plus un conflit ouvert par fiche ──────────
insert into public.sync_conflicts (workshop_id, fiche_id, local_version, remote_version)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 2, 3);
do $$
begin
  insert into public.sync_conflicts (workshop_id, fiche_id, local_version, remote_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 2, 4);
  raise exception 'T12 FAIL: 2e conflit ouvert accepté pour la même fiche';
exception when unique_violation then raise notice 'T12 OK — un seul conflit ouvert par fiche';
end;
$$;
update public.sync_conflicts set resolution_state = 'resolved', resolved_at = now()
where fiche_id = 'dddddddd-0000-0000-0000-000000000001' and resolution_state = 'open';
insert into public.sync_conflicts (workshop_id, fiche_id, local_version, remote_version)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 4, 5);
do $$ begin raise notice 'T12b OK — nouveau conflit possible après résolution'; end; $$;

-- ── T13 — is_late dérivé (décision D8) ────────────────────────────────────
update public.fiches set due_date = current_date - 3, state = 'active', status = 'sewing'
where id = 'dddddddd-0000-0000-0000-000000000001';
do $$
declare v_late boolean;
begin
  select is_late into v_late from public.fiches_view where id = 'dddddddd-0000-0000-0000-000000000001';
  if v_late is not true then raise exception 'T13 FAIL: fiche en retard non détectée'; end if;
  update public.fiches set status = 'delivered' where id = 'dddddddd-0000-0000-0000-000000000001';
  select is_late into v_late from public.fiches_view where id = 'dddddddd-0000-0000-0000-000000000001';
  if v_late is not false then raise exception 'T13 FAIL: fiche livrée encore "en retard"'; end if;
  raise notice 'T13 OK — is_late dérivé (retard puis livrée)';
end;
$$;

-- ── T14 — client_id nullable sur fiches (décision D4) ────────────────────
insert into public.fiches (workshop_id, carnet_id, client_id, number, page_number, slot_number, state, status, metadata)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', null,
        2, 1, 2, 'active', 'received', '{"legacy_identity":{"nom":"Fall","prenom":"Modou","telephone":"76 233 90 17"}}'::jsonb);
do $$ begin raise notice 'T14 OK — fiche sans client (client_id NULL) autorisée'; end; $$;

-- ── T15 — RLS activée sur les 15 tables exposées ────────────────────────
do $$
declare v_on int; v_off text;
begin
  select count(*) into v_on
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
  select string_agg(c.relname, ', ') into v_off
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_on <> 15 or v_off is not null then
    raise exception 'T15 FAIL: % tables avec RLS (attendu 15) ; sans RLS: %', v_on, coalesce(v_off, '—');
  end if;
  raise notice 'T15 OK — RLS activée sur les 15 tables publiques';
end;
$$;

-- ── T16 — RLS + 0 politique (+ absence de GRANT) => `authenticated` ne voit
-- AUCUNE ligne. Les deux issues sont acceptées : 0 ligne renvoyée (le
-- environnement a un GRANT de base type Supabase local) OU `insufficient_privilege`
-- (aucun GRANT table pour `authenticated` avant la Phase 4, cas du projet distant
-- réel `sunu-couture-dev` — refus encore plus strict, toujours conforme à l'intention
-- du test : deny-by-default). ──────────────────────────────────────────────
do $$
declare v_cnt int;
begin
  begin
    set local role authenticated;
    select count(*) into v_cnt from public.fiches;
    reset role;
  exception
    when insufficient_privilege then
      reset role;
      v_cnt := 0;
  end;
  if v_cnt <> 0 then
    raise exception 'T16 FAIL: authenticated voit % fiche(s) alors qu''aucune politique n''existe', v_cnt;
  end if;
  raise notice 'T16 OK — refus par défaut pour authenticated (GRANT + politiques = Phase 4)';
end;
$$;

-- ── T17 — fonctions dans app_hidden, droits EXECUTE minimaux (point 5) ──
do $$
declare v_pub int;
begin
  select count(*) into v_pub
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('current_workshop_ids', 'set_updated_at',
                      'create_fiche_from_draft', 'provision_workshop',
                      'sync_owner_membership', 'protect_owner_membership');
  if v_pub <> 0 then raise exception 'T17 FAIL: % fonction(s) interne(s) exposée(s) dans public', v_pub; end if;

  if not has_schema_privilege('authenticated', 'app_hidden', 'usage') then
    raise exception 'T17 FAIL: authenticated sans USAGE sur app_hidden';
  end if;
  if not has_function_privilege('authenticated', 'app_hidden.current_workshop_ids()', 'execute') then
    raise exception 'T17 FAIL: authenticated sans EXECUTE sur current_workshop_ids()';
  end if;
  -- authenticated / anon : AUCUN accès aux opérations privilégiées
  if has_function_privilege('authenticated', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute')
  or has_function_privilege('authenticated', 'app_hidden.provision_workshop(uuid, text)', 'execute') then
    raise exception 'T17 FAIL: authenticated a EXECUTE sur une opération privilégiée — interdit';
  end if;
  if has_function_privilege('anon', 'app_hidden.current_workshop_ids()', 'execute')
  or has_function_privilege('anon', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute') then
    raise exception 'T17 FAIL: anon a EXECUTE sur app_hidden.* — interdit';
  end if;
  -- service_role : accès aux opérations privilégiées (SEULE porte)
  if not has_function_privilege('service_role', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute')
  or not has_function_privilege('service_role', 'app_hidden.provision_workshop(uuid, text)', 'execute') then
    raise exception 'T17 FAIL: service_role sans EXECUTE sur une opération privilégiée attendue';
  end if;
  raise notice 'T17 OK — app_hidden.* : hors public, EXECUTE au strict nécessaire';
end;
$$;

-- ── T18 — vues en security_invoker (pas de "SECURITY DEFINER view") ─────
do $$
declare v_ok int;
begin
  select count(*) into v_ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('fiche_balances', 'fiches_view') and c.relkind = 'v'
    and c.reloptions is not null
    and (array_to_string(c.reloptions, ',') like '%security_invoker=on%'
      or array_to_string(c.reloptions, ',') like '%security_invoker=true%');
  if v_ok <> 2 then raise exception 'T18 FAIL: % vue(s) en security_invoker (attendu 2)', v_ok; end if;
  raise notice 'T18 OK — fiche_balances & fiches_view en security_invoker';
end;
$$;

-- ── T19 — AUCUNE fonction SECURITY DEFINER de NOTRE fait dans public ─────
--    (les SECURITY DEFINER des schémas système Supabase — auth, storage… — et
--     `public.rls_auto_enable()` fournie par Supabase — sont hors périmètre :
--     on ne les crée pas, on ne les supprime pas ; `rls_auto_enable` est
--     durcie par T35, pas par ce test.)
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname = 'public'
    and p.proname <> 'rls_auto_enable';
  if v_bad is not null then
    raise exception 'T19 FAIL: SECURITY DEFINER dans public : %', v_bad;
  end if;
  raise notice 'T19 OK — aucune fonction SECURITY DEFINER de notre fait dans public';
end;
$$;

-- ── T20 — chaque FK de `public` a un index dont le PRÉFIXE de colonnes
--          correspond EXACTEMENT, dans le bon ordre, aux colonnes de la FK
--          (point 4 — pas seulement « chaque colonne indexée séparément »).
--    Comparaison texte : indkey « 1 2 5 » doit commencer par conkey « 1 2 ».
do $$
declare v_bad text;
begin
  select string_agg(rel.relname || ' [' || c.conname || ']', ', ')
    into v_bad
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where c.contype = 'f' and ns.nspname = 'public'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid
        and (i.indkey::text || ' ') like
            (btrim(replace(replace(replace(c.conkey::text, '{', ''), '}', ''), ',', ' ')) || ' %')
    );
  if v_bad is not null then
    raise exception 'T20 FAIL: FK sans index au préfixe exact : %', v_bad;
  end if;
  raise notice 'T20 OK — chaque FK a un index au préfixe de colonnes exact';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Révision « candidate » : isolation multi-atelier, brouillons/numérotation,
-- modèles vides, signature, privilèges, propriétaire canonique (points 1–6).
-- ══════════════════════════════════════════════════════════════════════════

-- Fixtures atelier B (deuxième atelier, pour les tests inter-ateliers)
insert into public.workshops (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000b0', 'Atelier B', '22222222-2222-2222-2222-222222222222');
insert into public.carnets (id, workshop_id, number) values
  ('bbbbbbbb-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-0000000000b0', 1);
insert into public.clients (id, workshop_id, display_name) values
  ('cccccccc-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-0000000000b0', 'Client B');
insert into public.fiches (id, workshop_id, carnet_id, client_id, number, page_number, slot_number) values
  ('dddddddd-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-0000000000b0',
   'bbbbbbbb-0000-0000-0000-0000000000b0', null, 1, 1, 1);
insert into public.modeles (id, workshop_id, nom) values
  ('eeeeeeee-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-0000000000b0', 'Modele B'),
  ('eeeeeeee-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Modele A');

-- ── T21 — trg_workshops_sync_owner crée la ligne membre 'owner' (point 6) ──
--    (T7 a ajouté un 'assistant' à l'atelier A : on vérifie la ligne owner, pas le total)
do $$
declare v_role text; v_owners int;
begin
  select role into v_role from public.workshop_members
  where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and user_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into v_owners from public.workshop_members
  where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'owner';
  if v_role is distinct from 'owner' or v_owners <> 1 then
    raise exception 'T21 FAIL: user1 role=% / % owner(s) sur l''atelier A', v_role, v_owners;
  end if;
  raise notice 'T21 OK — ligne membre owner créée automatiquement à l''INSERT workshops';
end;
$$;

-- ── T22 — isolation multi-atelier : toute référence inter-ateliers rejetée ─
do $$ begin
  insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b0', 3, 1, 3);
  raise exception 'T22a FAIL: fiche A → carnet B acceptée';
exception when foreign_key_violation then raise notice 'T22a OK — fiche → carnet inter-ateliers rejetée';
end; $$;

do $$ begin
  insert into public.fiches (workshop_id, carnet_id, client_id, number, page_number, slot_number)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-0000000000b0', 3, 1, 3);
  raise exception 'T22b FAIL: fiche A → client B acceptée';
exception when foreign_key_violation then raise notice 'T22b OK — fiche → client inter-ateliers rejetée';
end; $$;

do $$ begin
  insert into public.client_payments (workshop_id, fiche_id, amount)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000b0', 1000);
  raise exception 'T22c FAIL: client_payment A → fiche B accepté';
exception when foreign_key_violation then raise notice 'T22c OK — client_payment → fiche inter-ateliers rejeté';
end; $$;

do $$ begin
  insert into public.media_assets (workshop_id, fiche_id, type, storage_path, mime_type, size_bytes)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000b0',
          'fabric_photo', 'ws-a/x.jpg', 'image/jpeg', 1);
  raise exception 'T22d FAIL: media_asset A → fiche B accepté';
exception when foreign_key_violation then raise notice 'T22d OK — media_asset → fiche inter-ateliers rejeté';
end; $$;

do $$ begin
  insert into public.modele_medias (workshop_id, modele_id, kind, storage_path, mime_type, size_bytes)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-0000000000b0',
          'photo', 'ws-a/m.jpg', 'image/jpeg', 1);
  raise exception 'T22e FAIL: modele_media A → modele B accepté';
exception when foreign_key_violation then raise notice 'T22e OK — modele_media → modele inter-ateliers rejeté';
end; $$;

do $$ begin
  insert into public.sync_conflicts (workshop_id, fiche_id, local_version, remote_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-0000000000b0', 1, 2);
  raise exception 'T22f FAIL: sync_conflict A → fiche B accepté';
exception when foreign_key_violation then raise notice 'T22f OK — sync_conflict → fiche inter-ateliers rejeté';
end; $$;

-- ── T23 — modèle sans nom rejeté (point 3) ──────────────────────────────
do $$ begin
  insert into public.modeles (workshop_id, nom) values ('aaaaaaaa-0000-0000-0000-000000000001', '');
  raise exception 'T23a FAIL: modèle au nom vide accepté';
exception when check_violation then raise notice 'T23a OK — modèle nom "" rejeté';
end; $$;
do $$ begin
  insert into public.modeles (workshop_id, nom) values ('aaaaaaaa-0000-0000-0000-000000000001', '   ');
  raise exception 'T23b FAIL: modèle au nom blanc accepté';
exception when check_violation then raise notice 'T23b OK — modèle nom "   " rejeté';
end; $$;
do $$ begin
  insert into public.modeles (workshop_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'T23c FAIL: modèle sans nom accepté';
exception when not_null_violation then raise notice 'T23c OK — modèle sans nom rejeté';
end; $$;

-- ── T24 — create_fiche_from_draft : séquence, page/slot, bascule carnet ──
insert into public.workshops (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000c0', 'Atelier C', '33333333-3333-3333-3333-333333333333');
insert into public.carnets (workshop_id, number, fiches_par_carnet) values
  ('aaaaaaaa-0000-0000-0000-0000000000c0', 1, 2);   -- petit plafond pour tester la bascule
do $$
declare f1 public.fiches; f2 public.fiches; f3 public.fiches; v_c2 int;
begin
  select * into f1 from app_hidden.create_fiche_from_draft(
    'aaaaaaaa-0000-0000-0000-0000000000c0', null, '{"garment":"Boubou","total_price":25000}'::jsonb);
  select * into f2 from app_hidden.create_fiche_from_draft(
    'aaaaaaaa-0000-0000-0000-0000000000c0', null, '{"garment":"Robe"}'::jsonb);
  select * into f3 from app_hidden.create_fiche_from_draft(
    'aaaaaaaa-0000-0000-0000-0000000000c0', null, '{"description":"Costume 3 pièces"}'::jsonb);

  if f1.number <> 1 or f2.number <> 2 or f3.number <> 1 then
    raise exception 'T24 FAIL: numéros f1=% f2=% f3=% (attendu 1,2,1)', f1.number, f2.number, f3.number;
  end if;
  if f1.page_number <> 1 or f1.slot_number <> 1 or f2.slot_number <> 2 then
    raise exception 'T24 FAIL: page/slot incorrects';
  end if;
  if f1.state <> 'active' or f1.garment <> 'Boubou' or f1.total_price <> 25000 then
    raise exception 'T24 FAIL: fiche non "active" ou payload ignoré';
  end if;
  if f2.carnet_id = f3.carnet_id then
    raise exception 'T24 FAIL: f3 aurait dû basculer sur le carnet suivant';
  end if;
  if (select status from public.carnets
      where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000c0' and number = 1) <> 'full' then
    raise exception 'T24 FAIL: carnet 1 non marqué full';
  end if;
  select count(*) into v_c2 from public.carnets
  where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000c0' and number = 2 and status = 'active';
  if v_c2 <> 1 then raise exception 'T24 FAIL: carnet 2 actif non préparé'; end if;
  raise notice 'T24 OK — create_fiche_from_draft : 1,2 puis bascule → carnet 2 n°1, carnet 1 "full"';
end;
$$;

-- ── T25 — create_fiche_from_draft rejette un client d'un autre atelier ──
insert into public.workshops (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000025', 'Atelier T25', '33333333-3333-3333-3333-333333333333');
do $$ begin
  perform app_hidden.create_fiche_from_draft(
    'aaaaaaaa-0000-0000-0000-000000000025',        -- atelier T25
    'cccccccc-0000-0000-0000-0000000000b0',        -- client de l'atelier B
    '{}'::jsonb);
  raise exception 'T25 FAIL: fiche créée avec un client hors atelier';
exception when foreign_key_violation then
  raise notice 'T25 OK — create_fiche_from_draft rejette un client hors atelier';
end; $$;
-- aucun effet de bord : le statement fautif est intégralement annulé
do $$
declare v_c int;
begin
  select count(*) into v_c from public.carnets where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000025';
  if v_c <> 0 then raise exception 'T25b FAIL: % carnet(s) créé(s) malgré l''échec', v_c; end if;
  raise notice 'T25b OK — échec create_fiche_from_draft : aucun carnet, aucun numéro';
end; $$;

-- ── T26 — enum fiche_state réaligné : pas d'état 'draft' serveur (point 2) ─
do $$
declare v_draft int; v_total int;
begin
  select count(*) filter (where e.enumlabel = 'draft'), count(*)
    into v_draft, v_total
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'fiche_state';
  if v_draft <> 0 then raise exception 'T26 FAIL: fiche_state contient encore ''draft'''; end if;
  if v_total <> 3 then raise exception 'T26 FAIL: fiche_state a % valeurs (attendu 3)', v_total; end if;
  raise notice 'T26 OK — fiche_state = {active, cancelled, archived}';
end;
$$;

-- ── T27 — provision_workshop : atelier + membre owner cohérents (point 6) ─
do $$
declare v_ws public.workshops; v_n int; v_role text; v_seen int;
begin
  select * into v_ws from app_hidden.provision_workshop(
    '33333333-3333-3333-3333-333333333333', '  Atelier Provisionné  ');
  if v_ws.owner_id <> '33333333-3333-3333-3333-333333333333' then raise exception 'T27 FAIL: owner_id'; end if;
  if v_ws.name <> 'Atelier Provisionné' then raise exception 'T27 FAIL: nom non trim "%"', v_ws.name; end if;
  select count(*), max(role) into v_n, v_role from public.workshop_members where workshop_id = v_ws.id;
  if v_n <> 1 or v_role <> 'owner' then raise exception 'T27 FAIL: membre owner = % / %', v_n, v_role; end if;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into v_seen from app_hidden.current_workshop_ids() x where x = v_ws.id;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_seen <> 1 then raise exception 'T27 FAIL: current_workshop_ids ne voit pas l''atelier'; end if;
  raise notice 'T27 OK — provision_workshop cohérent, vu par current_workshop_ids';
end;
$$;
do $$ begin
  perform app_hidden.provision_workshop('33333333-3333-3333-3333-333333333333', '   ');
  raise exception 'T27b FAIL: atelier au nom vide accepté';
exception when check_violation then raise notice 'T27b OK — provision_workshop rejette un nom vide';
end; $$;

-- ── T28 — current_workshop_ids : la branche owner_id opère même sans ligne membre ─
do $$
declare v_ws uuid; v_seen int;
begin
  insert into public.workshops (name, owner_id)
  values ('Owner sans membre', '33333333-3333-3333-3333-333333333333')
  returning id into v_ws;
  set local session_replication_role = replica;        -- contourne les déclencheurs
  delete from public.workshop_members where workshop_id = v_ws;
  set local session_replication_role = origin;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into v_seen from app_hidden.current_workshop_ids() x where x = v_ws;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_seen <> 1 then raise exception 'T28 FAIL: branche owner_id de current_workshop_ids inopérante'; end if;
  raise notice 'T28 OK — current_workshop_ids : branche owner_id opérante sans ligne membre';
end;
$$;

-- ── T29 — protect_owner_membership : ligne owner non supprimable / non rétrogradable ─
do $$ begin
  delete from public.workshop_members
  where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and user_id = '11111111-1111-1111-1111-111111111111';
  raise exception 'T29a FAIL: suppression de la ligne owner acceptée';
exception when restrict_violation then raise notice 'T29a OK — suppression de la ligne membre owner bloquée';
end; $$;
do $$ begin
  update public.workshop_members set role = 'assistant'
  where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    and user_id = '11111111-1111-1111-1111-111111111111';
  raise exception 'T29b FAIL: rétrogradation de l''owner acceptée';
exception when restrict_violation then raise notice 'T29b OK — rétrogradation de la ligne owner bloquée';
end; $$;

-- ── T30 — app_hidden : posture EXECUTE effective (point 5 / 6) ─────────────
--   Pas d'`ALTER DEFAULT PRIVILEGES` schema-scoped (no-op PG, retiré). L'ENFORCEMENT
--   réel = (a) `anon` sans USAGE sur app_hidden ; (b) `revoke all ... from public`
--   explicite dans la MÊME transaction que chaque `create function` + blanket dans
--   20260829120700 → aucune fonction n'accorde EXECUTE à PUBLIC / anon / authenticated
--   (sauf current_workshop_ids → authenticated, intentionnel pour les politiques RLS).
do $$
declare v_bad text;
begin
  if has_schema_privilege('anon', 'app_hidden', 'usage') then
    raise exception 'T30 FAIL: anon a USAGE sur app_hidden';
  end if;
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_hidden'
    and (p.proacl is null or array_to_string(p.proacl, ',') ~ '(^|,)=[^/]*/');  -- entrée PUBLIC
  if v_bad is not null then
    raise exception 'T30 FAIL: EXECUTE PUBLIC sur app_hidden.{%}', v_bad;
  end if;
  -- fonctions sensibles : non exécutables par anon NI authenticated
  if has_function_privilege('anon', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute')
  or has_function_privilege('authenticated', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute')
  or has_function_privilege('anon', 'app_hidden.provision_workshop(uuid, text)', 'execute')
  or has_function_privilege('authenticated', 'app_hidden.provision_workshop(uuid, text)', 'execute') then
    raise exception 'T30 FAIL: opération privilégiée exécutable par anon/authenticated';
  end if;
  raise notice 'T30 OK — aucune fonction sensible exécutable par PUBLIC / anon / authenticated';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Passe « statique finale » : transfert propriétaire, fiches vides,
-- porte unique d'attribution, protection des carnets (points 1–5).
-- ══════════════════════════════════════════════════════════════════════════

-- Fixtures dédiées
insert into public.workshops (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000d0', 'Atelier D (transfert)', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-0000000000e0', 'Atelier E (fiches vides)', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-0000-0000-0000-0000000000f0', 'Atelier F (carnets)', '33333333-3333-3333-3333-333333333333');
insert into public.workshop_members (workshop_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d0', '22222222-2222-2222-2222-222222222222', 'assistant');
insert into public.clients (id, workshop_id, display_name) values
  ('cccccccc-0000-0000-0000-0000000000e0', 'aaaaaaaa-0000-0000-0000-0000000000e0', 'Client E');
insert into public.carnets (id, workshop_id, number) values
  ('bbbbbbbb-0000-0000-0000-0000000000f0', 'aaaaaaaa-0000-0000-0000-0000000000f0', 1);
insert into public.fiches (id, workshop_id, carnet_id, number, page_number, slot_number) values
  ('dddddddd-0000-0000-0000-0000000000f0', 'aaaaaaaa-0000-0000-0000-0000000000f0',
   'bbbbbbbb-0000-0000-0000-0000000000f0', 1, 1, 1);
insert into public.client_payments (workshop_id, fiche_id, amount) values
  ('aaaaaaaa-0000-0000-0000-0000000000f0', 'dddddddd-0000-0000-0000-0000000000f0', 5000);

-- ── T31 — transfert de propriétaire A → B (point 1) ─────────────────────
do $$
declare v_r1 text; v_r2 text; v_owners int;
begin
  update public.workshops set owner_id = '22222222-2222-2222-2222-222222222222'
   where id = 'aaaaaaaa-0000-0000-0000-0000000000d0';
  select role into v_r1 from public.workshop_members
   where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0' and user_id = '11111111-1111-1111-1111-111111111111';
  select role into v_r2 from public.workshop_members
   where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0' and user_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_owners from public.workshop_members
   where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0' and role = 'owner';
  if v_r1 is distinct from 'assistant' then raise exception 'T31 FAIL: ancien propriétaire non rétrogradé (%)', v_r1; end if;
  if v_r2 is distinct from 'owner'     then raise exception 'T31 FAIL: nouveau propriétaire non promu (%)', v_r2; end if;
  if v_owners <> 1                     then raise exception 'T31 FAIL: % owner(s) après transfert', v_owners; end if;
  raise notice 'T31 OK — transfert A→B : A devient assistant, B devient owner, exactement 1 owner';
end;
$$;
-- modification directe de la ligne owner (désormais B) refusée
do $$ begin
  update public.workshop_members set user_id = '11111111-1111-1111-1111-111111111111'
   where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'owner';
  raise exception 'T31b FAIL: user_id de la ligne owner modifié';
exception when restrict_violation then raise notice 'T31b OK — user_id de la ligne owner non modifiable';
end; $$;
do $$ begin
  update public.workshop_members set workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0'
     and user_id = '22222222-2222-2222-2222-222222222222' and role = 'owner';
  raise exception 'T31c FAIL: workshop_id de la ligne owner modifié';
exception when restrict_violation then raise notice 'T31c OK — workshop_id de la ligne owner non modifiable';
end; $$;
-- suppression complète de l'atelier : comportement contrôlé (cascade propre)
do $$
declare v_m int;
begin
  delete from public.workshops where id = 'aaaaaaaa-0000-0000-0000-0000000000d0';
  select count(*) into v_m from public.workshop_members where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000d0';
  if v_m <> 0 then raise exception 'T31d FAIL: % membre(s) orphelin(s) après DELETE atelier', v_m; end if;
  raise notice 'T31d OK — DELETE atelier après transfert : cascade propre, 0 orphelin';
end; $$;

-- ── T32 — create_fiche_from_draft : règle « fiche non vide », codes d'erreur STRICTS ─
--    Aucun code n'est interchangeable : SQL NULL ⇒ null_value_not_allowed ;
--    JSON racine non-objet (y compris 'null'::jsonb) ⇒ invalid_parameter_value ;
--    objet vide / sans info significative ⇒ check_violation.
--    Après la série de refus : aucune fiche, aucun carnet, aucun numéro (atelier E).
do $$
declare
  v_fiches int; v_carnets int;
  -- objets « vides » → doivent produire EXACTEMENT check_violation
  v_empty jsonb[] := array[
    '{}'::jsonb,                                                                        -- objet vide
    '{"autre":"x"}'::jsonb,                                                             -- clés significatives absentes
    '{"garment":null,"description":null,"measurements":null,"metadata":null}'::jsonb,    -- clés explicitement null
    '{"garment":"   ","description":"\t \n"}'::jsonb,                                    -- chaînes blanches (espace, tab, saut de ligne)
    '{"measurements":null}'::jsonb,                                                     -- measurements = null
    '{"measurements":[1,2,3]}'::jsonb,                                                  -- measurements = tableau (jsonb_each NON appelé)
    '{"measurements":"foo"}'::jsonb,                                                    -- measurements = scalaire string
    '{"measurements":42}'::jsonb,                                                       -- measurements = scalaire number
    '{"measurements":{"E":{"valeur":"   "}}}'::jsonb,                                    -- measurements.valeur blanche
    '{"metadata":{"legacy_identity":{"nom":"  ","prenom":"","telephone":null}}}'::jsonb -- legacy_identity blanc
  ];
  -- JSON racine non-objet → doivent produire EXACTEMENT invalid_parameter_value
  v_nonobj jsonb[] := array['[]'::jsonb, '5'::jsonb, '"x"'::jsonb, 'true'::jsonb, 'null'::jsonb];
  v_p jsonb; v_state text;
begin
  -- (a) SQL NULL ⇒ null_value_not_allowed (22004), et RIEN d'autre
  begin
    perform app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null, null::jsonb);
    raise exception 'T32 FAIL: p_fiche SQL NULL accepté';
  exception
    when null_value_not_allowed then null;                                -- attendu
    when others then raise exception 'T32 FAIL: p_fiche NULL → % (attendu null_value_not_allowed)', sqlstate;
  end;

  -- (b) JSON racine non-objet ⇒ invalid_parameter_value (22023), et RIEN d'autre
  foreach v_p in array v_nonobj loop
    begin
      perform app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null, v_p);
      raise exception 'T32 FAIL: JSON racine non-objet accepté : %', v_p;
    exception
      when invalid_parameter_value then null;                             -- attendu
      when others then raise exception 'T32 FAIL: % → % (attendu invalid_parameter_value)', v_p, sqlstate;
    end;
  end loop;

  -- (c) objet vide / sans info ⇒ check_violation (23514), et RIEN d'autre
  foreach v_p in array v_empty loop
    begin
      perform app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null, v_p);
      raise exception 'T32 FAIL: objet vide accepté : %', v_p;
    exception
      when check_violation then null;                                     -- attendu
      when others then raise exception 'T32 FAIL: % → % (attendu check_violation)', v_p, sqlstate;
    end;
  end loop;

  -- aucun effet de bord : ni fiche, ni carnet, ni numéro
  select count(*) into v_fiches  from public.fiches  where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000e0';
  select count(*) into v_carnets from public.carnets where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000e0';
  if v_fiches <> 0 or v_carnets <> 0 then
    raise exception 'T32 FAIL: effet de bord après refus (fiches=% carnets=%)', v_fiches, v_carnets;
  end if;
  raise notice 'T32a OK — codes stricts : NULL→22004, JSON racine non-objet(×5, dont ''null'')→22023, objet vide(×10)→23514 ; 0 fiche, 0 carnet, 0 numéro';
end;
$$;
-- payloads réellement significatifs → fiche créée atomiquement
do $$
declare vf public.fiches; v_n int;
begin
  select * into vf from app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null,
    '{"measurements":{"E":{"valeur":"44"},"P":{"valeur":"  "}}}'::jsonb);   -- au moins 1 valeur non blanche
  if vf.number <> 1 or vf.state <> 'active' then raise exception 'T32b FAIL: fiche measurements non créée'; end if;
  select * into vf from app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null,
    '{"metadata":{"legacy_identity":{"nom":"Fall"}}}'::jsonb);
  if vf.number <> 2 then raise exception 'T32b FAIL: fiche legacy_identity non créée (n°%)', vf.number; end if;
  select * into vf from app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0', null,
    '{"garment":"Boubou"}'::jsonb);
  if vf.number <> 3 then raise exception 'T32b FAIL: fiche garment non créée (n°%)', vf.number; end if;
  select * into vf from app_hidden.create_fiche_from_draft('aaaaaaaa-0000-0000-0000-0000000000e0',
    'cccccccc-0000-0000-0000-0000000000e0', '{}'::jsonb);   -- client seul = significatif
  if vf.number <> 4 then raise exception 'T32b FAIL: fiche client-seul non créée (n°%)', vf.number; end if;
  select count(*) into v_n from public.fiches where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000e0';
  if v_n <> 4 then raise exception 'T32b FAIL: % fiches (attendu 4)', v_n; end if;
  raise notice 'T32b OK — measurements.valeur / legacy_identity / garment / client → fiche créée atomiquement (4)';
end;
$$;

-- ── T33 — une seule porte d'attribution de numéro (point 3) ────────────
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_hidden' and p.proname = 'allocate_fiche_number';
  if v_n <> 0 then raise exception 'T33 FAIL: allocate_fiche_number existe encore'; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname ~ 'allocate|next_number';
  if v_n <> 0 then raise exception 'T33 FAIL: fonction d''allocation exposée dans public'; end if;
  raise notice 'T33 OK — create_fiche_from_draft est la SEULE porte (allocate_fiche_number supprimée)';
end;
$$;

-- ── T34 — protection des carnets : ON DELETE NO ACTION (point 5) ───────
do $$ begin
  delete from public.carnets where id = 'bbbbbbbb-0000-0000-0000-0000000000f0';
  raise exception 'T34a FAIL: carnet contenant des fiches supprimé directement';
exception when foreign_key_violation then raise notice 'T34a OK — carnet avec fiches non supprimable directement';
end; $$;
update public.carnets set status = 'archived', archived_at = now()
where id = 'bbbbbbbb-0000-0000-0000-0000000000f0';
do $$ begin raise notice 'T34b OK — archivage du carnet possible (UPDATE)'; end; $$;
do $$
declare v_c int; v_fi int; v_p int;
begin
  delete from public.workshops where id = 'aaaaaaaa-0000-0000-0000-0000000000f0';
  select count(*) into v_c  from public.carnets         where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000f0';
  select count(*) into v_fi from public.fiches          where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000f0';
  select count(*) into v_p  from public.client_payments where workshop_id = 'aaaaaaaa-0000-0000-0000-0000000000f0';
  if v_c <> 0 or v_fi <> 0 or v_p <> 0 then
    raise exception 'T34c FAIL: orphelins après DELETE atelier (carnets=% fiches=% paiements=%)', v_c, v_fi, v_p;
  end if;
  raise notice 'T34c OK — DELETE atelier : NO ACTION vérifié en fin de commande → cascade propre, 0 orphelin';
end;
$$;

-- ── T35 — public.rls_auto_enable() sécurisée ; event trigger ensure_rls préservé ─
--    (SKIP propre si la fonction / l'event trigger n'existent pas dans l'env.)
do $$
declare
  v_fn regprocedure := to_regprocedure('public.rls_auto_enable()');
  v_evtenabled "char";
begin
  if v_fn is null then
    raise notice 'T35 SKIP — public.rls_auto_enable() absente dans cet environnement';
  else
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'T35 FAIL: anon peut EXECUTE public.rls_auto_enable()';
    end if;
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'T35 FAIL: authenticated peut EXECUTE public.rls_auto_enable()';
    end if;
    -- (anon hérite de PUBLIC : un grant PUBLIC résiduel ferait échouer le test anon ci-dessus)
    raise notice 'T35 OK — public.rls_auto_enable() : EXECUTE révoqué pour anon & authenticated (et PUBLIC)';
  end if;

  select evtenabled into v_evtenabled from pg_event_trigger where evtname = 'ensure_rls';
  if not found then
    raise notice 'T35 (evt) SKIP — event trigger ensure_rls absent dans cet environnement';
  elsif v_evtenabled = 'D' then
    raise exception 'T35 FAIL: event trigger ensure_rls DÉSACTIVÉ (evtenabled = D)';
  else
    raise notice 'T35 (evt) OK — event trigger ensure_rls toujours actif (evtenabled = %)', v_evtenabled;
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 3A — wrapper PostgREST `public.provision_workshop_api` (migration
-- 20260830…_provision_workshop_api.sql). `app_hidden` n'étant pas dans
-- [api].schemas, ce wrapper SECURITY INVOKER est la SEULE porte PostgREST
-- vers app_hidden.provision_workshop(). p_owner doit provenir exclusivement
-- de l'Edge Function (JWT vérifié), jamais du JSON client.
-- ══════════════════════════════════════════════════════════════════════════

-- ── T36 — privilèges : PUBLIC/anon/authenticated refusés, service_role seul ─
do $$
declare
  v_sig constant text := 'public.provision_workshop_api(uuid, text)';
  v_bad text;
begin
  -- PUBLIC : aucune entrée `=X/` (grant PUBLIC) dans proacl
  select p.proacl::text into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provision_workshop_api';
  if v_bad is not null and v_bad ~ '(^|,)=[^/]*/' then
    raise exception 'T36 FAIL: PUBLIC a EXECUTE sur %  (proacl=%)', v_sig, v_bad;
  end if;
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'T36 FAIL: anon a EXECUTE sur %', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'T36 FAIL: authenticated a EXECUTE sur %', v_sig;
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'T36 FAIL: service_role SANS EXECUTE sur %', v_sig;
  end if;
  -- app_hidden reste non accessible à anon (déjà couvert T17/T30, re-vérifié ici
  -- au cas où cette migration l'aurait régressé)
  if has_schema_privilege('anon', 'app_hidden', 'usage') then
    raise exception 'T36 FAIL: anon a USAGE sur app_hidden (régression)';
  end if;
  if has_function_privilege('anon', 'app_hidden.provision_workshop(uuid, text)', 'execute') then
    raise exception 'T36 FAIL: anon a EXECUTE sur app_hidden.provision_workshop (régression)';
  end if;
  -- security invoker, jamais definer, search_path verrouillé
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provision_workshop_api' and p.prosecdef
  ) then
    raise exception 'T36 FAIL: provision_workshop_api est SECURITY DEFINER (attendu INVOKER)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provision_workshop_api'
      and p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'T36 FAIL: provision_workshop_api sans search_path verrouillé';
  end if;
  raise notice 'T36 OK — provision_workshop_api : PUBLIC/anon/authenticated refusés, service_role seul, INVOKER, search_path verrouillé';
end;
$$;

-- ── T37 — provision_workshop_api : idempotent, aucun doublon, 0 divergence ─
do $$
declare
  v_owner constant uuid := '55555555-5555-5555-5555-555555555555';
  v_ws1 public.workshops; v_ws2 public.workshops;
  v_n_workshops int; v_n_owner_rows int;
begin
  insert into auth.users (id, phone) values (v_owner, '+221770000005');

  set local role service_role;
  select * into v_ws1 from public.provision_workshop_api(v_owner, 'Atelier Idempotent');
  select * into v_ws2 from public.provision_workshop_api(v_owner, 'Atelier Idempotent (rejoué)');
  reset role;

  if v_ws1.id <> v_ws2.id then
    raise exception 'T37 FAIL: deux appels identiques ont produit deux ateliers (% <> %)', v_ws1.id, v_ws2.id;
  end if;

  select count(*) into v_n_workshops from public.workshops where owner_id = v_owner;
  if v_n_workshops <> 1 then
    raise exception 'T37 FAIL: % atelier(s) pour un seul owner (attendu 1, aucun doublon)', v_n_workshops;
  end if;

  select count(*) into v_n_owner_rows
  from public.workshop_members
  where workshop_id = v_ws1.id and role = 'owner';
  if v_n_owner_rows <> 1 then
    raise exception 'T37 FAIL: % ligne(s) workshop_members(owner) pour l''atelier (attendu 1 — divergence owner_id/membre)', v_n_owner_rows;
  end if;
  if v_ws1.owner_id <> v_owner then
    raise exception 'T37 FAIL: workshops.owner_id (%) <> owner attendu (%)', v_ws1.owner_id, v_owner;
  end if;

  raise notice 'T37 OK — provision_workshop_api idempotent (même atelier, 0 doublon, 0 divergence owner_id/workshop_members)';
end;
$$;

-- ── T38 — p_name NULL/vide + AUCUN atelier existant → erreur WSN01 ──────────
-- (passe corrective : jamais de nom inventé automatiquement)
do $$
declare
  v_owner constant uuid := '66666666-6666-6666-6666-666666666666';
  v_n int;
begin
  insert into auth.users (id, phone) values (v_owner, '+221770000006');
  set local role service_role;

  begin
    perform public.provision_workshop_api(v_owner, null);
    raise exception 'T38 FAIL: p_name NULL sans atelier existant accepté (aurait dû échouer)';
  exception
    when sqlstate 'WSN01' then null;
    when others then raise exception 'T38 FAIL: p_name NULL → % (attendu SQLSTATE WSN01)', sqlstate;
  end;

  begin
    perform public.provision_workshop_api(v_owner, '   ');
    raise exception 'T38 FAIL: p_name blanc sans atelier existant accepté (aurait dû échouer)';
  exception
    when sqlstate 'WSN01' then null;
    when others then raise exception 'T38 FAIL: p_name blanc → % (attendu SQLSTATE WSN01)', sqlstate;
  end;

  reset role;
  select count(*) into v_n from public.workshops where owner_id = v_owner;
  if v_n <> 0 then
    raise exception 'T38 FAIL: % atelier(s) créé(s) malgré le refus (attendu 0)', v_n;
  end if;
  raise notice 'T38 OK — p_name NULL/vide sans atelier existant → WSN01, aucun atelier créé (jamais de nom inventé)';
end;
$$;

-- ── T39 — atelier déjà existant : p_name est IGNORÉ (NULL ou différent) ─────
do $$
declare
  v_owner constant uuid := '77777777-7777-7777-7777-777777777777';
  v_ws1 public.workshops; v_ws2 public.workshops; v_ws3 public.workshops;
  v_n int;
begin
  insert into auth.users (id, phone) values (v_owner, '+221770000007');
  set local role service_role;

  select * into v_ws1 from public.provision_workshop_api(v_owner, 'Atelier Réel');
  -- Sonde post-connexion : p_name NULL doit retrouver l'atelier existant, PAS échouer.
  select * into v_ws2 from public.provision_workshop_api(v_owner, null);
  -- Un nom différent envoyé par erreur ne doit jamais créer un second atelier
  -- ni renommer le premier.
  select * into v_ws3 from public.provision_workshop_api(v_owner, 'Nom Différent Ignoré');

  reset role;

  if v_ws2.id <> v_ws1.id or v_ws3.id <> v_ws1.id then
    raise exception 'T39 FAIL: sonde p_name NULL ou nom différent a produit un atelier distinct';
  end if;
  if v_ws2.name <> 'Atelier Réel' or v_ws3.name <> 'Atelier Réel' then
    raise exception 'T39 FAIL: le nom de l''atelier existant a été modifié ("%"/"%")', v_ws2.name, v_ws3.name;
  end if;
  select count(*) into v_n from public.workshops where owner_id = v_owner;
  if v_n <> 1 then
    raise exception 'T39 FAIL: % atelier(s) pour cet owner (attendu 1)', v_n;
  end if;
  raise notice 'T39 OK — atelier existant retourné tel quel, p_name (NULL ou différent) toujours ignoré, 0 doublon';
end;
$$;

-- ── T40 — GRANT ciblé (moindre privilège) : service_role + non-régression ──
-- Vérifie le correctif `20260830212932_grant_provision_workshop_service_role_
-- select.sql`.
--
-- LIMITE ASSUMÉE (locale), CONSTATÉE ET NON SUPPOSÉE : une vérification directe
-- (`information_schema.role_table_grants`) montre que l'image Docker Supabase
-- locale accorde par défaut, à `anon`/`authenticated`/`service_role` À LA
-- FOIS, le jeu complet DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE
-- sur `public.workshops` — INDÉPENDAMMENT de toute migration (c'est déjà le
-- cas avant même que ce correctif n'existe). C'est précisément la raison pour
-- laquelle `security_hardening.sql` (Phase 2) doit explicitement RÉVOQUER des
-- privilèges sur `subscription_plans`/`subscriptions`/etc. pour anon/authenticated
-- — sans quoi ils les auraient aussi par défaut en local. Sur le projet
-- distant, ce bootstrap large n'existe pas : seuls TRUNCATE/REFERENCES/TRIGGER
-- sont accordés par défaut à ces trois rôles (vérifié en Phase 3B.1).
--
-- CONSÉQUENCE : ce test ne peut PAS vérifier ici l'absence de SELECT pour
-- anon/authenticated sur public.workshops (elle serait localement fausse pour
-- une raison sans rapport avec ce correctif), ni que service_role n'a QUE
-- SELECT et rien de plus (INSERT/UPDATE/DELETE y sont déjà localement, par le
-- bootstrap, avant même cette migration). Ces deux points sont vérifiés
-- séparément, en lecture seule, sur le projet distant (voir rapport Phase 3B)
-- — jamais affirmés comme démontrés localement. Ce que ce test vérifie
-- localement, et qui reste discriminant dans les deux environnements, ce sont
-- les privilèges au niveau FONCTION (jamais élargis par le bootstrap local,
-- contrairement aux tables) : l'EXECUTE du wrapper reste réservé à service_role.
do $$
declare
  v_sig constant text := 'public.provision_workshop_api(uuid, text)';
begin
  if not has_table_privilege('service_role', 'public.workshops', 'select') then
    raise exception 'T40 FAIL: service_role sans SELECT sur public.workshops (correctif manquant ou régressé)';
  end if;
  -- Non-régression : le correctif ne doit pas avoir élargi qui peut EXECUTE
  -- le wrapper (déjà couvert par T36, revérifié ici après la nouvelle migration).
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'T40 FAIL: anon a EXECUTE sur % après le correctif (régression)', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'T40 FAIL: authenticated a EXECUTE sur % après le correctif (régression)', v_sig;
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'T40 FAIL: service_role a perdu EXECUTE sur % (régression)', v_sig;
  end if;
  raise notice 'T40 OK — service_role a SELECT sur public.workshops, EXECUTE du wrapper inchangé (anon/authenticated toujours refusés)';
end;
$$;

-- ── T40b — le correctif ne casse pas l'idempotence du wrapper (T37 rejoué) ──
do $$
declare
  v_owner constant uuid := '88888888-8888-8888-8888-888888888888';
  v_ws1 public.workshops; v_ws2 public.workshops;
  v_n int;
begin
  insert into auth.users (id, phone) values (v_owner, '+221770000008');
  set local role service_role;
  select * into v_ws1 from public.provision_workshop_api(v_owner, 'Atelier T40b');
  select * into v_ws2 from public.provision_workshop_api(v_owner, null);
  reset role;

  if v_ws1.id <> v_ws2.id then
    raise exception 'T40b FAIL: le correctif de privilège a cassé l''idempotence (% <> %)', v_ws1.id, v_ws2.id;
  end if;
  select count(*) into v_n from public.workshops where owner_id = v_owner;
  if v_n <> 1 then
    raise exception 'T40b FAIL: % atelier(s) pour cet owner après le correctif (attendu 1)', v_n;
  end if;
  raise notice 'T40b OK — wrapper toujours idempotent après le correctif de privilège (T37 rejoué)';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4 — GRANT + politiques RLS (T41+)
-- Deux ateliers A/B (chacun owner + assistant), un non-membre, et un
-- utilisateur DOUBLE-MEMBRE de A et B (pour le test d'immutabilité croisée).
-- Fixture stockée dans une table temporaire (déposée automatiquement à la fin
-- de la transaction) pour être réutilisée par les groupes suivants.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table t4x_fixture (key text primary key, value uuid) on commit drop;
-- Table de service du HARNAIS DE TEST uniquement (temporaire, déposée à la fin
-- de la transaction) — ce GRANT n'a aucun rapport avec les privilèges de la
-- migration Phase 4 et ne touche aucune table applicative.
grant select on t4x_fixture to authenticated, anon;

do $$
declare
  v_owner_a    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_assist_a   constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
  v_owner_b    constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_assist_b   constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba';
  v_nonmember  constant uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_dual       constant uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_ws_a       public.workshops;
  v_ws_b       public.workshops;
  v_client_a   public.clients;
  v_client_b   public.clients;
  v_fiche_a    public.fiches;
  v_reminder_a public.reminders;
begin
  insert into auth.users (id, phone) values
    (v_owner_a,   '+221770000101'),
    (v_assist_a,  '+221770000102'),
    (v_owner_b,   '+221770000103'),
    (v_assist_b,  '+221770000104'),
    (v_nonmember, '+221770000105'),
    (v_dual,      '+221770000106');

  select * into v_ws_a from app_hidden.provision_workshop(v_owner_a, 'Atelier A (Phase 4)');
  select * into v_ws_b from app_hidden.provision_workshop(v_owner_b, 'Atelier B (Phase 4)');

  insert into public.workshop_members (workshop_id, user_id, role) values
    (v_ws_a.id, v_assist_a, 'assistant'),
    (v_ws_b.id, v_assist_b, 'assistant'),
    (v_ws_a.id, v_dual,     'assistant'),
    (v_ws_b.id, v_dual,     'assistant');

  insert into public.clients (workshop_id, display_name) values (v_ws_a.id, 'Cliente Phase4 A') returning * into v_client_a;
  insert into public.clients (workshop_id, display_name) values (v_ws_b.id, 'Cliente Phase4 B') returning * into v_client_b;

  set local role service_role;
  select * into v_fiche_a from app_hidden.create_fiche_from_draft(v_ws_a.id, v_client_a.id, jsonb_build_object('garment', 'Robe test Phase 4'));
  reset role;

  insert into public.reminders (workshop_id, type) values (v_ws_a.id, 'retard') returning * into v_reminder_a;

  insert into t4x_fixture (key, value) values
    ('owner_a', v_owner_a), ('assist_a', v_assist_a),
    ('owner_b', v_owner_b), ('assist_b', v_assist_b),
    ('nonmember', v_nonmember), ('dual', v_dual),
    ('ws_a', v_ws_a.id), ('ws_b', v_ws_b.id),
    ('client_a', v_client_a.id), ('client_b', v_client_b.id),
    ('carnet_a', v_fiche_a.carnet_id), ('fiche_a', v_fiche_a.id),
    ('reminder_a', v_reminder_a.id);

  raise notice 'T41 fixture OK — 2 ateliers, owner+assistant chacun, 1 non-membre, 1 double-membre';
end;
$$;

-- ── T42 — anon : refus au niveau du PRIVILÈGE (42501), pas seulement RLS ───
do $$
declare
  v_tbl text;
  v_code text;
  v_ok boolean;
begin
  foreach v_tbl in array array[
    'workshops','workshop_members','carnets','clients','fiches','client_payments',
    'media_assets','modeles','modele_medias','subscription_plans','subscriptions',
    'subscription_transactions','promo_codes','sync_conflicts','reminders',
    'fiches_view','fiche_balances'
  ] loop
    v_ok := false;
    begin
      set local role anon;
      execute format('select 1 from public.%I limit 1', v_tbl);
    exception
      when insufficient_privilege then v_ok := true;
    end;
    reset role;
    if not v_ok then
      raise exception 'T42 FAIL: anon a pu lire % sans erreur 42501', v_tbl;
    end if;
  end loop;
  raise notice 'T42 OK — anon reçoit 42501 (privilège manquant, pas juste 0 ligne) sur les 15 tables + 2 vues';
end;
$$;

-- ── T43 — authentifié non membre : GRANT présent, RLS filtre à 0 ligne ─────
-- (jamais insufficient_privilege ici : authenticated a le GRANT, seule la
-- RLS doit filtrer). Puis relecture privilégiée (postgres) confirmant que
-- les lignes existent toujours — la RLS masque, elle ne supprime rien.
do $$
declare v_cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'nonmember')::text, true);

  select count(*) into v_cnt from public.workshops where id in (select value from t4x_fixture where key in ('ws_a','ws_b'));
  if v_cnt <> 0 then raise exception 'T43 FAIL: non-membre voit % atelier(s)', v_cnt; end if;

  select count(*) into v_cnt from public.clients where workshop_id in (select value from t4x_fixture where key in ('ws_a','ws_b'));
  if v_cnt <> 0 then raise exception 'T43 FAIL: non-membre voit % client(s)', v_cnt; end if;

  select count(*) into v_cnt from public.fiches where workshop_id in (select value from t4x_fixture where key in ('ws_a','ws_b'));
  if v_cnt <> 0 then raise exception 'T43 FAIL: non-membre voit % fiche(s)', v_cnt; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;

  -- Relecture privilégiée (rôle postgres, propriétaire des tables) : les
  -- lignes existent toujours — confirmé, pas juste supposé.
  select count(*) into v_cnt from public.clients where id = (select value from t4x_fixture where key = 'client_a');
  if v_cnt <> 1 then raise exception 'T43 FAIL: la cliente A a disparu après le test de non-membre'; end if;

  raise notice 'T43 OK — non-membre : 0 ligne (RLS, pas privilège manquant), données intactes après relecture privilégiée';
end;
$$;

-- ── T44 — isolation croisée A/B, paramétrée sur les tables multi-atelier ──
do $$
declare
  v_tbl text;
  v_cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);
  foreach v_tbl in array array['clients','fiches','client_payments','media_assets','modeles','modele_medias','carnets','reminders'] loop
    execute format(
      'select count(*) from public.%I where workshop_id = $1', v_tbl
    ) into v_cnt using (select value from t4x_fixture where key = 'ws_b');
    if v_cnt <> 0 then raise exception 'T44 FAIL: owner A voit % ligne(s) de B sur %', v_cnt, v_tbl; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  raise notice 'T44 OK — owner A : 0 ligne de B sur les 8 tables multi-atelier testées';
end;
$$;

-- ── T45 — double-membre (A et B) : déplacement de workshop_id → 42501 ─────
-- Le privilège de colonne (workshop_id absent du GRANT UPDATE) bloque AVANT
-- même que la RLS soit évaluée — le test vérifie précisément ce point, pas
-- seulement un refus générique.
do $$
declare v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'dual')::text, true);

  v_blocked := false;
  begin
    update public.clients set workshop_id = (select value from t4x_fixture where key = 'ws_b')
      where id = (select value from t4x_fixture where key = 'client_a');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T45 FAIL: clients.workshop_id modifiable malgré la double appartenance'; end if;

  v_blocked := false;
  begin
    update public.fiches set workshop_id = (select value from t4x_fixture where key = 'ws_b')
      where id = (select value from t4x_fixture where key = 'fiche_a');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T45 FAIL: fiches.workshop_id modifiable malgré la double appartenance'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;

  -- Relecture privilégiée : la cliente A est toujours dans l'atelier A.
  if (select workshop_id from public.clients where id = (select value from t4x_fixture where key = 'client_a'))
     <> (select value from t4x_fixture where key = 'ws_a') then
    raise exception 'T45 FAIL: client_a a changé d''atelier malgré le refus attendu';
  end if;

  raise notice 'T45 OK — double-membre A+B : déplacement de workshop_id refusé (42501) sur clients ET fiches, données intactes';
end;
$$;

-- ── T46 — aucune insertion directe dans fiches / carnets ──────────────────
do $$
declare v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);

  v_blocked := false;
  begin
    insert into public.fiches (workshop_id, carnet_id, number, page_number, slot_number)
    values ((select value from t4x_fixture where key = 'ws_a'), (select value from t4x_fixture where key = 'carnet_a'), 999, 250, 3);
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T46 FAIL: INSERT direct dans fiches accepté'; end if;

  v_blocked := false;
  begin
    insert into public.carnets (workshop_id, number) values ((select value from t4x_fixture where key = 'ws_a'), 999);
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T46 FAIL: INSERT direct dans carnets accepté'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  raise notice 'T46 OK — aucun INSERT direct possible sur fiches/carnets (seule porte : create_fiche_from_draft)';
end;
$$;

-- ── T47 — workshop_members : aucune élévation / modification de rôle ──────
do $$
declare v_blocked boolean;
begin
  -- L'assistant ne peut pas se promouvoir lui-même (aucun GRANT UPDATE du tout).
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'assist_a')::text, true);
  v_blocked := false;
  begin
    update public.workshop_members set role = 'owner'
      where workshop_id = (select value from t4x_fixture where key = 'ws_a')
        and user_id = (select value from t4x_fixture where key = 'assist_a');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T47 FAIL: assistant a pu modifier son propre rôle'; end if;

  -- L'owner lui-même ne peut pas modifier un rôle par ce chemin (aucun GRANT UPDATE).
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);
  v_blocked := false;
  begin
    update public.workshop_members set role = 'owner'
      where workshop_id = (select value from t4x_fixture where key = 'ws_a')
        and user_id = (select value from t4x_fixture where key = 'assist_a');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T47 FAIL: owner a pu modifier un rôle via UPDATE (aucun GRANT prévu)'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;

  -- Protection trigger existante (indépendante de la RLS) : même en
  -- contournant la RLS (rôle postgres), la ligne owner officielle reste
  -- protégée par app_hidden.protect_owner_membership (régression T29a/b).
  v_blocked := false;
  begin
    update public.workshop_members set role = 'assistant'
      where workshop_id = (select value from t4x_fixture where key = 'ws_a')
        and user_id = (select value from t4x_fixture where key = 'owner_a');
  exception when restrict_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T47 FAIL: le trigger protect_owner_membership n''a pas bloqué la rétrogradation de l''owner'; end if;

  raise notice 'T47 OK — aucune élévation/modification de rôle par RLS (assistant et owner), protection trigger distincte confirmée';
end;
$$;

-- ── T48 — workshops.is_demo non modifiable ; name modifiable par l'owner seul ─
do $$
declare v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);

  v_blocked := false;
  begin
    update public.workshops set is_demo = true where id = (select value from t4x_fixture where key = 'ws_a');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T48 FAIL: is_demo modifiable par authenticated'; end if;

  update public.workshops set name = 'Atelier A renommé' where id = (select value from t4x_fixture where key = 'ws_a');
  if (select name from public.workshops where id = (select value from t4x_fixture where key = 'ws_a')) <> 'Atelier A renommé' then
    raise exception 'T48 FAIL: owner n''a pas pu renommer son atelier';
  end if;

  -- L'assistant ne peut pas renommer l'atelier (pas de politique UPDATE pour lui).
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'assist_a')::text, true);
  v_blocked := false;
  begin
    update public.workshops set name = 'Renommé par assistant' where id = (select value from t4x_fixture where key = 'ws_a');
    if not found then v_blocked := true; end if;  -- RLS filtre la ligne : 0 ligne affectée
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T48 FAIL: assistant a pu renommer l''atelier'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  raise notice 'T48 OK — is_demo immuable pour authenticated, name modifiable par l''owner uniquement';
end;
$$;

-- ── T49 — client_payments : immuable après insertion (aucun UPDATE/DELETE) ─
do $$
declare
  v_payment_id uuid;
  v_blocked boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);
  insert into public.client_payments (workshop_id, fiche_id, amount)
    values ((select value from t4x_fixture where key = 'ws_a'), (select value from t4x_fixture where key = 'fiche_a'), 5000)
    returning id into v_payment_id;

  v_blocked := false;
  begin
    update public.client_payments set amount = 1 where id = v_payment_id;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T49 FAIL: client_payments.amount modifiable après insertion'; end if;

  v_blocked := false;
  begin
    delete from public.client_payments where id = v_payment_id;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'T49 FAIL: client_payments supprimable par authenticated'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  raise notice 'T49 OK — versement immuable après insertion (aucun UPDATE ni DELETE possible)';
end;
$$;

-- ── T50 — vues : mêmes limites que les tables sous-jacentes ────────────────
do $$
declare v_cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'nonmember')::text, true);
  select count(*) into v_cnt from public.fiches_view where workshop_id = (select value from t4x_fixture where key = 'ws_a');
  if v_cnt <> 0 then raise exception 'T50 FAIL: non-membre voit % ligne(s) de fiches_view', v_cnt; end if;
  select count(*) into v_cnt from public.fiche_balances where workshop_id = (select value from t4x_fixture where key = 'ws_a');
  if v_cnt <> 0 then raise exception 'T50 FAIL: non-membre voit % ligne(s) de fiche_balances', v_cnt; end if;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);
  select count(*) into v_cnt from public.fiches_view where workshop_id = (select value from t4x_fixture where key = 'ws_a');
  if v_cnt <> 1 then raise exception 'T50 FAIL: owner A ne voit pas sa propre fiche via fiches_view (% ligne)', v_cnt; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  raise notice 'T50 OK — fiches_view/fiche_balances respectent exactement les limites de fiches/client_payments';
end;
$$;

-- ── T51 — privilèges de colonne exacts (has_column_privilege) ─────────────
-- Table de vérité (table, colonne, update attendu) — data-driven, sans
-- fonction auxiliaire (PL/pgSQL ne permet pas de fonction imbriquée dans un
-- bloc DO ; aucune nouvelle fonction persistante n'est créée).
do $$
declare
  v_row record;
  v_actual boolean;
  v_checks constant text[][] := array[
    ['clients',       'id',           'false'],
    ['clients',       'workshop_id',  'false'],
    ['clients',       'created_at',   'false'],
    ['clients',       'display_name', 'true'],
    ['fiches',        'workshop_id',  'false'],
    ['fiches',        'client_id',    'false'],
    ['fiches',        'version',      'false'],
    ['fiches',        'carnet_id',    'false'],
    ['fiches',        'status',       'true'],
    ['workshops',     'is_demo',      'false'],
    ['workshops',     'owner_id',     'false'],
    ['workshops',     'name',         'true'],
    ['reminders',     'id',           'false'],
    ['reminders',     'workshop_id',  'false'],
    ['reminders',     'type',         'false'],
    ['reminders',     'created_at',   'false'],
    ['reminders',     'at_time',      'true'],
    ['reminders',     'enabled',      'true'],
    ['reminders',     'sound',        'true'],
    ['carnets',       'next_number',  'false'],
    ['carnets',       'status',       'true'],
    ['media_assets',  'fiche_id',     'false'],
    ['media_assets',  'metadata',     'true'],
    ['modeles',       'workshop_id',  'false'],
    ['modeles',       'nom',          'true']
  ];
  v_i int;
begin
  for v_i in 1 .. array_length(v_checks, 1) loop
    v_actual := has_column_privilege(
      'authenticated',
      format('public.%s', v_checks[v_i][1])::regclass,
      v_checks[v_i][2],
      'update'
    );
    if v_actual <> (v_checks[v_i][3] = 'true') then
      raise exception 'T51 FAIL: %.% pour authenticated — attendu update=%, obtenu %',
        v_checks[v_i][1], v_checks[v_i][2], v_checks[v_i][3], v_actual;
    end if;
  end loop;
  raise notice 'T51 OK — % privilèges de colonne exacts conformes à la matrice', array_length(v_checks, 1);
end;
$$;

-- ── T52 — sync_conflicts et les 4 tables d'abonnement : fermées, testées séparément ─
do $$
declare v_tbl text;
begin
  foreach v_tbl in array array['sync_conflicts','subscription_plans','subscriptions','subscription_transactions','promo_codes'] loop
    if has_table_privilege('anon', format('public.%s', v_tbl)::regclass, 'select') then
      raise exception 'T52 FAIL: anon a un privilège sur %', v_tbl;
    end if;
    if has_table_privilege('authenticated', format('public.%s', v_tbl)::regclass, 'select')
       or has_table_privilege('authenticated', format('public.%s', v_tbl)::regclass, 'insert')
       or has_table_privilege('authenticated', format('public.%s', v_tbl)::regclass, 'update')
       or has_table_privilege('authenticated', format('public.%s', v_tbl)::regclass, 'delete') then
      raise exception 'T52 FAIL: authenticated a un privilège sur %', v_tbl;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = v_tbl) <> 0 then
      raise exception 'T52 FAIL: une politique existe sur % (devrait être fermée sans policy)', v_tbl;
    end if;
  end loop;
  raise notice 'T52 OK — sync_conflicts + 4 tables d''abonnement entièrement fermées (aucun GRANT, aucune politique), testées individuellement';
end;
$$;

-- ── T53 — aucune politique autoréférente dans pg_policies ─────────────────
do $$
declare v_bad int;
begin
  -- Le texte reconstruit par pg_get_expr omet le préfixe de schéma quand la
  -- table est sur le search_path par défaut au moment de la création de la
  -- politique — on teste donc la forme qualifiée ET la forme nue.
  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '')          ~ ('from\s+(public\.)?' || tablename || '\M')
      or coalesce(with_check, '') ~ ('from\s+(public\.)?' || tablename || '\M')
    );
  if v_bad <> 0 then
    raise exception 'T53 FAIL: % politique(s) relisent directement leur propre table', v_bad;
  end if;
  raise notice 'T53 OK — aucune politique RLS ne relit directement sa propre table (% politiques inspectées)',
    (select count(*) from pg_policies where schemaname = 'public');
end;
$$;

-- ── T54 — service_role : aucune régression sur les garanties Phase 2/3 ────
-- Cette migration ne mentionne `service_role` dans AUCUN GRANT/REVOKE (relu
-- dans le fichier de migration) — le test vérifie donc une INVARIANCE, pas
-- une forme figée : la base Docker locale accorde par défaut à service_role
-- un CRUD complet (bootstrap), le distant réel n'accorde que
-- REFERENCES/TRIGGER/TRUNCATE + SELECT ciblé sur workshops — les deux
-- environnements sont légitimement différents (documenté, Phase 3B) et
-- aucun des deux n'est la "bonne" forme absolue à comparer. Ce que cette
-- migration garantit, dans les deux environnements : le GRANT SELECT sur
-- workshops (Phase 3B) et l'EXECUTE sur les 7 fonctions restent présents —
-- rien n'a pu régresser, quel que soit l'environnement.
do $$
declare v_missing int;
begin
  if not has_table_privilege('service_role', 'public.workshops', 'select') then
    raise exception 'T54 FAIL: service_role a perdu SELECT sur public.workshops (régression Phase 3B)';
  end if;

  -- current_workshop_ids n'a JAMAIS été accordée à service_role (EXECUTE →
  -- authenticated seul, appelée depuis les politiques RLS) — exclue à raison.
  select count(*) into v_missing
  from (values
    ('public',     'provision_workshop_api'),
    ('app_hidden', 'create_fiche_from_draft'),
    ('app_hidden', 'provision_workshop')
  ) as expected(nspname, proname)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = expected.nspname and p.proname = expected.proname
      and has_function_privilege('service_role', p.oid, 'execute')
  );
  if v_missing <> 0 then
    raise exception 'T54 FAIL: service_role a perdu EXECUTE sur % fonction(s) attendue(s)', v_missing;
  end if;

  if not has_function_privilege('authenticated', 'app_hidden.current_workshop_ids()', 'execute') then
    raise exception 'T54 FAIL: authenticated a perdu EXECUTE sur current_workshop_ids (base des politiques Phase 4)';
  end if;

  raise notice 'T54 OK — service_role : garanties Phase 2/3 intactes (SELECT workshops, EXECUTE sur provision_workshop_api/create_fiche_from_draft/provision_workshop) — cette migration ne mentionne service_role dans aucun GRANT/REVOKE';
end;
$$;

-- ── T55 — absence de récursion sur workshop_members (statement_timeout) ───
do $$
declare v_cnt int;
begin
  set local statement_timeout = '2s';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', (select value from t4x_fixture where key = 'owner_a')::text, true);
  select count(*) into v_cnt from public.workshop_members;
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  set local statement_timeout = 0;
  raise notice 'T55 OK — requête sur workshop_members sans timeout ni 42P17 (% ligne(s) visibles pour owner A)', v_cnt;
exception
  when sqlstate '42P17' then
    raise exception 'T55 FAIL: récursion infinie détectée sur workshop_members (42P17)';
  when query_canceled then
    raise exception 'T55 FAIL: requête sur workshop_members au-delà du statement_timeout (2s) — suspicion de récursion';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 9A — wrapper PostgREST `public.create_fiche_from_draft_api` (migration
-- 20260905144612…). Même raison d'être que `provision_workshop_api` (T36) :
-- `app_hidden` n'étant pas dans [api].schemas, ce wrapper SECURITY INVOKER
-- est la SEULE porte PostgREST vers app_hidden.create_fiche_from_draft().
-- p_workshop_id/p_client_id doivent provenir exclusivement de l'Edge
-- Function (JWT vérifié + contrôle appartenance/rôle), jamais du JSON client.
-- ══════════════════════════════════════════════════════════════════════════

-- ── T56 — privilèges : PUBLIC/anon/authenticated refusés, service_role seul ─
do $$
declare
  v_sig constant text := 'public.create_fiche_from_draft_api(uuid, uuid, jsonb)';
  v_bad text;
begin
  -- PUBLIC : aucune entrée `=X/` (grant PUBLIC) dans proacl
  select p.proacl::text into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_fiche_from_draft_api';
  if v_bad is not null and v_bad ~ '(^|,)=[^/]*/' then
    raise exception 'T56 FAIL: PUBLIC a EXECUTE sur %  (proacl=%)', v_sig, v_bad;
  end if;
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'T56 FAIL: anon a EXECUTE sur %', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'T56 FAIL: authenticated a EXECUTE sur %', v_sig;
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'T56 FAIL: service_role SANS EXECUTE sur %', v_sig;
  end if;
  -- app_hidden reste non accessible à anon/authenticated (déjà couvert T17/T30,
  -- re-vérifié ici au cas où cette migration l'aurait régressé)
  if has_schema_privilege('anon', 'app_hidden', 'usage') then
    raise exception 'T56 FAIL: anon a USAGE sur app_hidden (régression)';
  end if;
  if has_function_privilege('anon', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute')
  or has_function_privilege('authenticated', 'app_hidden.create_fiche_from_draft(uuid, uuid, jsonb)', 'execute') then
    raise exception 'T56 FAIL: anon/authenticated a EXECUTE sur app_hidden.create_fiche_from_draft (régression)';
  end if;
  -- security invoker, jamais definer, search_path verrouillé
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_fiche_from_draft_api' and p.prosecdef
  ) then
    raise exception 'T56 FAIL: create_fiche_from_draft_api est SECURITY DEFINER (attendu INVOKER)';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_fiche_from_draft_api'
      and p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'T56 FAIL: create_fiche_from_draft_api sans search_path verrouillé';
  end if;
  raise notice 'T56 OK — create_fiche_from_draft_api : PUBLIC/anon/authenticated refusés, service_role seul, INVOKER, search_path verrouillé, app_hidden toujours non exposé';
end;
$$;

-- ── T57 — aucun GRANT INSERT / aucune politique INSERT sur fiches pour
-- authenticated : le wrapper Phase 9A ne doit RIEN ouvrir en écriture directe,
-- `create_fiche_from_draft_api` (via service_role) reste la SEULE porte ──
do $$
begin
  if has_table_privilege('authenticated', 'public.fiches', 'insert') then
    raise exception 'T57 FAIL: authenticated a INSERT sur public.fiches (devrait rester impossible — seule porte : create_fiche_from_draft_api)';
  end if;
  if has_table_privilege('anon', 'public.fiches', 'insert') then
    raise exception 'T57 FAIL: anon a INSERT sur public.fiches';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fiches' and cmd = 'INSERT'
  ) then
    raise exception 'T57 FAIL: une politique RLS INSERT existe sur public.fiches (attendu : aucune)';
  end if;
  raise notice 'T57 OK — aucun GRANT/politique INSERT sur public.fiches pour anon/authenticated (Phase 9A n''ouvre aucune écriture directe)';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 8A — bucket Storage privé `media` + policies (migration
-- 20260905184439_phase_8a_media_storage.sql). `storage.objects` a RLS active
-- par défaut (plateforme Supabase) — seules 2 policies existent ici,
-- SELECT/INSERT `authenticated`. `public.media_assets` (schéma métier,
-- Phase 2/4) n'est PAS modifiée par cette migration.
-- ══════════════════════════════════════════════════════════════════════════

-- ── T58 — bucket "media" : existe, privé, MIME restreints ─────────────────
do $$
declare
  v_bucket record;
begin
  select id, public, allowed_mime_types into v_bucket from storage.buckets where id = 'media';
  if not found then
    raise exception 'T58 FAIL: bucket "media" absent';
  end if;
  if v_bucket.public is distinct from false then
    raise exception 'T58 FAIL: bucket "media" doit être privé (public=false)';
  end if;
  if v_bucket.allowed_mime_types is null
     or v_bucket.allowed_mime_types::text[] <> array['image/jpeg', 'image/png', 'audio/webm', 'audio/mp4', 'audio/ogg']
  then
    raise exception 'T58 FAIL: allowed_mime_types inattendu : %', v_bucket.allowed_mime_types;
  end if;
  raise notice 'T58 OK — bucket "media" existe, privé, MIME restreints aux formats Phase 8A';
end;
$$;

-- ── T59 — storage.objects : SELECT/INSERT authenticated uniquement ────────
do $$
declare v_count int;
begin
  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('media_objects_select_member', 'media_objects_insert_member');
  if v_count <> 2 then
    raise exception 'T59 FAIL: attendu exactement 2 policies media_objects_*, trouvé %', v_count;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('media_objects_select_member', 'media_objects_insert_member')
      and roles <> array['authenticated']::name[]
  ) then
    raise exception 'T59 FAIL: une policy media_objects_* n''est pas restreinte exactement à authenticated';
  end if;

  raise notice 'T59 OK — storage.objects : SELECT/INSERT authenticated uniquement (2 policies)';
end;
$$;

-- ── T60 — storage.objects : aucune policy UPDATE/DELETE/anon Phase 8A ─────
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'media_objects_%' and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'T60 FAIL: une policy media_objects_* UPDATE/DELETE existe (interdit Phase 8A — suppression physique non navigateur)';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'media_objects_%' and 'anon' = any(roles)
  ) then
    raise exception 'T60 FAIL: une policy media_objects_* accorde un rôle anon';
  end if;
  raise notice 'T60 OK — aucune policy media_objects_* UPDATE/DELETE/anon';
end;
$$;

-- ── T61 — media_assets : grants Phase 4 inchangés par cette migration ─────
do $$
begin
  if not has_table_privilege('authenticated', 'public.media_assets', 'select') then
    raise exception 'T61 FAIL: authenticated a perdu SELECT sur media_assets (régression)';
  end if;
  if not has_table_privilege('authenticated', 'public.media_assets', 'insert') then
    raise exception 'T61 FAIL: authenticated a perdu INSERT sur media_assets (régression)';
  end if;
  if has_table_privilege('anon', 'public.media_assets', 'select')
     or has_table_privilege('anon', 'public.media_assets', 'insert') then
    raise exception 'T61 FAIL: anon a un accès sur media_assets (régression)';
  end if;
  raise notice 'T61 OK — media_assets : grants Phase 4 inchangés (authenticated select/insert, anon aucun accès)';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- PHASE 8B — extension des policies Storage `media` au catalogue de modèles
-- (`20260906161045_phase_8b_catalog_storage_policies.sql`). Aucun changement
-- de schéma `public.modeles`/`public.modele_medias` (déjà en place depuis
-- Phase 4) — cette migration ne touche QUE `storage.objects`. Les scénarios
-- FONCTIONNELS (upload réel, isolation cross-atelier, soft-delete modèle)
-- sont couverts par `scripts/test-phase-8b-catalog.mjs` (API Storage réelle),
-- pas ici — ces groupes restent au niveau STRUCTUREL, comme T58-T61.
-- ══════════════════════════════════════════════════════════════════════════

-- ── T62 — toujours exactement 2 policies combinées (fiche+modèle) ─────────
do $$
declare v_count int;
begin
  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('media_objects_select_member', 'media_objects_insert_member');
  if v_count <> 2 then
    raise exception 'T62 FAIL: attendu exactement 2 policies media_objects_* après Phase 8B, trouvé %', v_count;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('media_objects_select_member', 'media_objects_insert_member')
      and (roles <> array['authenticated']::name[] or cmd not in ('SELECT', 'INSERT'))
  ) then
    raise exception 'T62 FAIL: une policy media_objects_* n''est plus exactement SELECT/INSERT authenticated';
  end if;
  raise notice 'T62 OK — toujours exactement 2 policies (SELECT+INSERT authenticated), aucune duplication 8B';
end;
$$;

-- ── T63 — toujours aucune policy UPDATE/DELETE/anon après Phase 8B ────────
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'media_objects_%' and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'T63 FAIL: une policy media_objects_* UPDATE/DELETE existe après Phase 8B';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'media_objects_%' and 'anon' = any(roles)
  ) then
    raise exception 'T63 FAIL: une policy media_objects_* accorde un rôle anon après Phase 8B';
  end if;
  raise notice 'T63 OK — aucun UPDATE/DELETE/anon sur media_objects_* après Phase 8B';
end;
$$;

-- ── T64 — la branche FICHE (fonctionnellement identique à 8A) est préservée
do $$
declare v_select_qual text;
declare v_insert_check text;
begin
  select qual::text into v_select_qual from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_select_member';
  select with_check::text into v_insert_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_insert_member';

  if v_select_qual is null or v_select_qual !~ 'fiches' or v_select_qual !~ 'deleted_at IS NULL' then
    raise exception 'T64 FAIL: la branche fiche (public.fiches, deleted_at IS NULL) est absente de la policy SELECT : %', v_select_qual;
  end if;
  if v_insert_check is null or v_insert_check !~ 'fiches' or v_insert_check !~ 'deleted_at IS NULL' then
    raise exception 'T64 FAIL: la branche fiche est absente de la policy INSERT : %', v_insert_check;
  end if;
  raise notice 'T64 OK — branche FICHE (public.fiches, deleted_at IS NULL) préservée dans les 2 policies';
end;
$$;

-- ── T65 — la nouvelle branche MODELE est bien présente ────────────────────
do $$
declare v_select_qual text;
declare v_insert_check text;
begin
  select qual::text into v_select_qual from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_select_member';
  select with_check::text into v_insert_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_insert_member';

  if v_select_qual is null or v_select_qual !~ 'modeles' then
    raise exception 'T65 FAIL: la branche modèle (public.modeles) est absente de la policy SELECT : %', v_select_qual;
  end if;
  if v_insert_check is null or v_insert_check !~ 'modeles' then
    raise exception 'T65 FAIL: la branche modèle est absente de la policy INSERT : %', v_insert_check;
  end if;
  raise notice 'T65 OK — branche MODELE (public.modeles) présente dans les 2 policies';
end;
$$;

-- ── T66 — la branche MODELE exige modeles.deleted_at IS NULL (§29) ────────
do $$
declare v_select_qual text;
declare v_insert_check text;
begin
  select qual::text into v_select_qual from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_select_member';
  select with_check::text into v_insert_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_insert_member';

  -- Recherche la clause "m.deleted_at IS NULL" (alias utilisé côté modèle,
  -- distinct de "f.deleted_at IS NULL" côté fiche) : les DEUX clauses
  -- "deleted_at IS NULL" doivent apparaître (une pour chaque branche).
  if (select count(*) from regexp_matches(v_select_qual, 'deleted_at IS NULL', 'g')) < 2 then
    raise exception 'T66 FAIL: la policy SELECT ne vérifie pas deleted_at IS NULL sur les DEUX branches : %', v_select_qual;
  end if;
  if (select count(*) from regexp_matches(v_insert_check, 'deleted_at IS NULL', 'g')) < 2 then
    raise exception 'T66 FAIL: la policy INSERT ne vérifie pas deleted_at IS NULL sur les DEUX branches : %', v_insert_check;
  end if;
  raise notice 'T66 OK — couple workshop+modele exact (deleted_at IS NULL vérifié sur les 2 branches, pas seulement l''accessibilité de la fiche/du modèle)';
end;
$$;

-- ── T67 — aucun cast ::uuid non protégé sur un segment de path ────────────
do $$
declare v_select_qual text;
declare v_insert_check text;
begin
  select qual::text into v_select_qual from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_select_member';
  select with_check::text into v_insert_check from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_objects_insert_member';

  if v_select_qual ~ '::uuid' or v_insert_check ~ '::uuid' then
    raise exception 'T67 FAIL: un cast ::uuid non protégé subsiste (un path malformé pourrait lever une exception) — select=% insert=%', v_select_qual, v_insert_check;
  end if;
  raise notice 'T67 OK — comparaisons ::text uniquement, aucun cast ::uuid non protégé (path malformé jamais une exception)';
end;
$$;

-- ── T68 — bucket "media" inchangé par Phase 8B (privé, même allowlist) ────
do $$
declare
  v_bucket record;
begin
  select id, public, allowed_mime_types into v_bucket from storage.buckets where id = 'media';
  if not found then
    raise exception 'T68 FAIL: bucket "media" absent après Phase 8B';
  end if;
  if v_bucket.public is distinct from false then
    raise exception 'T68 FAIL: bucket "media" doit rester privé (public=false) après Phase 8B';
  end if;
  if v_bucket.allowed_mime_types is null
     or v_bucket.allowed_mime_types::text[] <> array['image/jpeg', 'image/png', 'audio/webm', 'audio/mp4', 'audio/ogg']
  then
    raise exception 'T68 FAIL: allowed_mime_types modifié par Phase 8B (ne devrait pas l''être) : %', v_bucket.allowed_mime_types;
  end if;
  raise notice 'T68 OK — bucket "media" inchangé par Phase 8B (privé, même allowlist MIME)';
end;
$$;

-- ── T69 — public.modeles / public.modele_medias : GRANT Phase 4 inchangés ─
do $$
begin
  if not has_table_privilege('authenticated', 'public.modeles', 'select')
     or not has_table_privilege('authenticated', 'public.modeles', 'insert') then
    raise exception 'T69 FAIL: authenticated a perdu SELECT/INSERT sur modeles (régression Phase 8B)';
  end if;
  if not has_table_privilege('authenticated', 'public.modele_medias', 'select')
     or not has_table_privilege('authenticated', 'public.modele_medias', 'insert')
     or not has_table_privilege('authenticated', 'public.modele_medias', 'delete') then
    raise exception 'T69 FAIL: authenticated a perdu SELECT/INSERT/DELETE sur modele_medias (régression Phase 8B)';
  end if;
  if has_table_privilege('authenticated', 'public.modele_medias', 'update') then
    raise exception 'T69 FAIL: authenticated a un UPDATE sur modele_medias — Phase 8B ne doit PAS l''ajouter (§6)';
  end if;
  if has_table_privilege('anon', 'public.modeles', 'select')
     or has_table_privilege('anon', 'public.modele_medias', 'select') then
    raise exception 'T69 FAIL: anon a un accès sur modeles/modele_medias (régression)';
  end if;
  raise notice 'T69 OK — GRANT Phase 4 inchangés sur modeles/modele_medias, aucun nouveau GRANT UPDATE ajouté par Phase 8B';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- Corr. Gate Auth — pivot téléphone + PIN 4 chiffres, atelier invisible
-- (migration 20260907120000_pin_auth.sql). `app_hidden.pin_auth_accounts`/
-- `pin_auth_throttle`/`pin_auth_register_throttle` ne stockent JAMAIS de
-- téléphone brut, PIN, ni mot de passe technique — seuls des identifiants
-- opaques dérivés par HMAC côté Edge Function `tayoo-pin-auth`. Mêmes
-- principes que Phase 3A/9A : `app_hidden` non exposé, wrappers
-- `public.pin_auth_*_api` SECURITY INVOKER réservés à `service_role`,
-- fonctions internes SECURITY DEFINER.
--
-- Corr. throttle — le couple check-then-record (`pin_auth_throttle_status` +
-- `pin_auth_throttle_record_failure`) a été REMPLACÉ par un unique primitif
-- atomique `pin_auth_throttle_consume_attempt` (verrouillage de ligne
-- `FOR UPDATE`, ordre déterministe, incrément AVANT vérification des
-- identifiants — jamais de race condition entre requêtes concurrentes) ; une
-- table dédiée `pin_auth_register_throttle` protège l'inscription contre le
-- spray de comptes (fenêtre fixe, jamais réinitialisée par un succès).
-- ══════════════════════════════════════════════════════════════════════════

-- ── T70 — schéma des tables privées : aucune colonne sensible, unicité,
-- cascade FK vers auth.users ─────────────────────────────────────────────
do $$
declare
  v_owner constant uuid := 'a0000000-0000-0000-0000-000000000001';
  v_n int;
begin
  if to_regclass('app_hidden.pin_auth_accounts') is null then
    raise exception 'T70 FAIL: app_hidden.pin_auth_accounts absente';
  end if;
  if to_regclass('app_hidden.pin_auth_throttle') is null then
    raise exception 'T70 FAIL: app_hidden.pin_auth_throttle absente';
  end if;
  if to_regclass('app_hidden.pin_auth_register_throttle') is null then
    raise exception 'T70 FAIL: app_hidden.pin_auth_register_throttle absente';
  end if;

  -- Aucune colonne portant un nom évoquant une donnée brute/sensible.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'app_hidden' and table_name = 'pin_auth_accounts'
      and column_name in ('phone', 'phone_number', 'phone_e164', 'pin', 'password', 'technical_password', 'technical_email')
  ) then
    raise exception 'T70 FAIL: pin_auth_accounts porte une colonne sensible interdite';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'app_hidden' and table_name = 'pin_auth_throttle'
      and column_name in ('phone', 'phone_number', 'ip', 'ip_address')
  ) then
    raise exception 'T70 FAIL: pin_auth_throttle porte une colonne IP/téléphone brute interdite';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'app_hidden' and table_name = 'pin_auth_register_throttle'
      and column_name in ('phone', 'phone_number', 'ip', 'ip_address')
  ) then
    raise exception 'T70 FAIL: pin_auth_register_throttle porte une colonne IP/téléphone brute interdite';
  end if;

  -- phone_key unique.
  insert into auth.users (id, phone) values (v_owner, null);
  insert into app_hidden.pin_auth_accounts (user_id, phone_key, password_salt) values (v_owner, 'phonekey-t70', 'salt-t70');
  begin
    insert into app_hidden.pin_auth_accounts (user_id, phone_key, password_salt)
    values ('a0000000-0000-0000-0000-000000000002', 'phonekey-t70', 'salt-autre');
    raise exception 'T70 FAIL: deuxième phone_key identique acceptée (devrait violer l''unicité)';
  exception when unique_violation then
    null; -- attendu
  end;

  -- Cascade : supprimer l'utilisateur Auth supprime la ligne pin_auth_accounts.
  delete from auth.users where id = v_owner;
  select count(*) into v_n from app_hidden.pin_auth_accounts where user_id = v_owner;
  if v_n <> 0 then
    raise exception 'T70 FAIL: pin_auth_accounts non supprimée après suppression de auth.users (FK cascade manquante)';
  end if;

  raise notice 'T70 OK — tables privées : aucune colonne brute/sensible, phone_key unique, cascade FK auth.users -> pin_auth_accounts';
end;
$$;

-- ── T71 — privilèges : PUBLIC/anon/authenticated refusés partout,
-- service_role seul (wrappers ET fonctions internes), INVOKER/DEFINER
-- corrects, search_path verrouillé. Les signatures exactes des wrappers
-- publics ci-dessous (SANS paramètre `timestamptz`) prouvent en même temps
-- que `p_now` (clock injection) n'est JAMAIS exposé publiquement : si un
-- wrapper portait un paramètre `p_now` en plus, la signature ci-dessous ne
-- résoudrait à AUCUNE fonction et `has_function_privilege` échouerait avec
-- une erreur (fonction introuvable), pas un simple `false` (corr. throttle
-- §18) ───────────────────────────────────────────────────────────────────
do $$
declare
  v_api_sigs text[] := array[
    'public.pin_auth_register_account_api(uuid, text, text)',
    'public.pin_auth_lookup_account_api(text)',
    'public.pin_auth_touch_login_api(uuid)',
    'public.pin_auth_throttle_consume_attempt_api(text[])',
    'public.pin_auth_throttle_reset_api(text[])',
    'public.pin_auth_register_consume_attempt_api(text)'
  ];
  v_hidden_sigs text[] := array[
    'app_hidden.pin_auth_register_account(uuid, text, text)',
    'app_hidden.pin_auth_lookup_account(text)',
    'app_hidden.pin_auth_touch_login(uuid)',
    'app_hidden.pin_auth_throttle_consume_attempt(text[], timestamptz)',
    'app_hidden.pin_auth_throttle_reset(text[])',
    'app_hidden.pin_auth_register_consume_attempt(text, timestamptz)'
  ];
  v_sig text;
begin
  foreach v_sig in array v_api_sigs loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'T71 FAIL: anon a EXECUTE sur %', v_sig;
    end if;
    if has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'T71 FAIL: authenticated a EXECUTE sur %', v_sig;
    end if;
    if not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'T71 FAIL: service_role SANS EXECUTE sur %', v_sig;
    end if;
  end loop;

  foreach v_sig in array v_hidden_sigs loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'T71 FAIL: anon a EXECUTE sur %', v_sig;
    end if;
    if has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'T71 FAIL: authenticated a EXECUTE sur %', v_sig;
    end if;
    if not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'T71 FAIL: service_role SANS EXECUTE sur % (nécessaire — les wrappers sont SECURITY INVOKER)', v_sig;
    end if;
  end loop;

  -- Aucun accès direct table (anon/authenticated) — accès uniquement via les
  -- fonctions SECURITY DEFINER ci-dessus, jamais un GRANT table.
  if has_table_privilege('anon', 'app_hidden.pin_auth_accounts', 'select')
     or has_table_privilege('authenticated', 'app_hidden.pin_auth_accounts', 'select')
     or has_table_privilege('service_role', 'app_hidden.pin_auth_accounts', 'select') then
    raise exception 'T71 FAIL: un rôle a un GRANT table direct sur pin_auth_accounts (attendu : aucun, uniquement via fonctions DEFINER)';
  end if;
  if has_table_privilege('anon', 'app_hidden.pin_auth_throttle', 'select')
     or has_table_privilege('authenticated', 'app_hidden.pin_auth_throttle', 'select')
     or has_table_privilege('service_role', 'app_hidden.pin_auth_throttle', 'select') then
    raise exception 'T71 FAIL: un rôle a un GRANT table direct sur pin_auth_throttle (attendu : aucun)';
  end if;
  if has_table_privilege('anon', 'app_hidden.pin_auth_register_throttle', 'select')
     or has_table_privilege('authenticated', 'app_hidden.pin_auth_register_throttle', 'select')
     or has_table_privilege('service_role', 'app_hidden.pin_auth_register_throttle', 'select') then
    raise exception 'T71 FAIL: un rôle a un GRANT table direct sur pin_auth_register_throttle (attendu : aucun)';
  end if;

  -- Wrappers public.*_api : SECURITY INVOKER (jamais DEFINER), search_path verrouillé.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pin_auth_%_api' and p.prosecdef
  ) then
    raise exception 'T71 FAIL: au moins un wrapper public.pin_auth_*_api est SECURITY DEFINER (attendu INVOKER)';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pin_auth_%_api'
      and (p.proconfig is null or array_to_string(p.proconfig, ',') not like '%search_path=%')
  ) then
    raise exception 'T71 FAIL: au moins un wrapper public.pin_auth_*_api sans search_path verrouillé';
  end if;

  -- Fonctions internes app_hidden.pin_auth_* : SECURITY DEFINER (sauf throttle_status
  -- en lecture seule, qui peut aussi être DEFINER — toutes le sont ici), search_path verrouillé.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_hidden' and p.proname like 'pin_auth_%' and not p.prosecdef
  ) then
    raise exception 'T71 FAIL: au moins une fonction app_hidden.pin_auth_* n''est pas SECURITY DEFINER';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_hidden' and p.proname like 'pin_auth_%'
      and (p.proconfig is null or array_to_string(p.proconfig, ',') not like '%search_path=%')
  ) then
    raise exception 'T71 FAIL: au moins une fonction app_hidden.pin_auth_* sans search_path verrouillé';
  end if;

  raise notice 'T71 OK — pin_auth_* : PUBLIC/anon/authenticated refusés partout, service_role seul (wrappers + fonctions internes), aucun GRANT table direct, INVOKER/DEFINER corrects, search_path verrouillé';
end;
$$;

-- ── T72 — register/lookup fonctionnels via les wrappers service_role,
-- duplicate refusé avec le code attendu (23505) ──────────────────────────
do $$
declare
  v_owner constant uuid := 'a0000000-0000-0000-0000-000000000003';
  v_found_user uuid;
  v_found_salt text;
  v_n int;
begin
  insert into auth.users (id, phone) values (v_owner, null);

  set local role service_role;
  perform public.pin_auth_register_account_api(v_owner, 'phonekey-t72', 'salt-t72');

  select user_id, password_salt into v_found_user, v_found_salt
  from public.pin_auth_lookup_account_api('phonekey-t72');
  reset role;

  if v_found_user <> v_owner or v_found_salt <> 'salt-t72' then
    raise exception 'T72 FAIL: lookup_account_api n''a pas renvoyé le compte inséré (user=%, salt=%)', v_found_user, v_found_salt;
  end if;

  set local role service_role;
  begin
    perform public.pin_auth_register_account_api('a0000000-0000-0000-0000-000000000004', 'phonekey-t72', 'salt-autre');
    reset role;
    raise exception 'T72 FAIL: un second register avec la même phone_key a été accepté (devrait violer l''unicité)';
  exception when unique_violation then
    reset role;
  end;

  -- touch_login met bien à jour last_login_at.
  set local role service_role;
  perform public.pin_auth_touch_login_api(v_owner);
  reset role;
  select count(*) into v_n from app_hidden.pin_auth_accounts where user_id = v_owner and last_login_at is not null;
  if v_n <> 1 then
    raise exception 'T72 FAIL: pin_auth_touch_login_api n''a pas mis à jour last_login_at';
  end if;

  raise notice 'T72 OK — register/lookup/touch_login fonctionnels via les wrappers service_role, duplicate phone_key refusé';
end;
$$;

-- ── T73 — throttle LOGIN atomique : verrouillage progressif MULTI-CLÉS
-- (phone+ip en une seule transaction), AUCUN double-incrément pendant le
-- verrou, déverrouillage après fenêtre PROUVÉ par injection d'horloge
-- (jamais une vraie attente), reset() efface tout (corr. throttle §1-§8/§18)
-- ──────────────────────────────────────────────────────────────────────
do $$
declare
  v_keys constant text[] := array['throttle-key-t73-phone', 'throttle-key-t73-ip'];
  v_allowed boolean; v_locked_until timestamptz;
  v_fail_counts int[];
  v_i int;
  v_now constant timestamptz := now();
begin
  set local role service_role;

  -- 1-4 tentatives : jamais verrouillé, les DEUX clés progressent ensemble.
  for v_i in 1..4 loop
    select allowed, locked_until into v_allowed, v_locked_until
    from public.pin_auth_throttle_consume_attempt_api(v_keys);
    if not v_allowed then
      raise exception 'T73 FAIL: verrouillé après seulement % tentative(s) (attendu : pas avant 5)', v_i;
    end if;
  end loop;

  -- 5e tentative : encore autorisée (le verrou ne s'arme qu'APRÈS avoir
  -- atteint le seuil, jamais avant — la vérification des identifiants doit
  -- pouvoir avoir lieu sur cette 5e tentative), mais locked_until est armé
  -- pour les tentatives suivantes.
  select allowed, locked_until into v_allowed, v_locked_until
  from public.pin_auth_throttle_consume_attempt_api(v_keys);
  if not v_allowed or v_locked_until is null then
    raise exception 'T73 FAIL: la 5e tentative doit rester autorisée tout en armant locked_until (allowed=%, locked_until=%)', v_allowed, v_locked_until;
  end if;

  -- 6e tentative : refusée AVANT toute vérification d'identifiants.
  select allowed into v_allowed from public.pin_auth_throttle_consume_attempt_api(v_keys);
  if v_allowed then
    raise exception 'T73 FAIL: la 6e tentative aurait dû être bloquée (verrou déjà armé)';
  end if;

  reset role;

  -- AUCUN double-incrément : la tentative bloquée (6e) ne doit PAS avoir
  -- augmenté fail_count au-delà de 5 sur les DEUX clés (corr. throttle §1/§8
  -- — c'est exactement le bug de l'ancienne implémentation check-then-record).
  select array_agg(fail_count order by key_hash) into v_fail_counts
  from app_hidden.pin_auth_throttle where key_hash = any(v_keys);
  if v_fail_counts <> array[5, 5] then
    raise exception 'T73 FAIL: fail_count devrait rester exactement à 5 sur les 2 clés après la tentative bloquée (obtenu %) — signe d''un double-incrément', v_fail_counts;
  end if;

  -- Déverrouillage après fenêtre — CLOCK INJECTION directe sur la fonction
  -- interne (jamais exposée au wrapper public, corr. Gate Auth §61/corr.
  -- throttle §18) : jamais une vraie attente de plusieurs minutes ici.
  select allowed into v_allowed from app_hidden.pin_auth_throttle_consume_attempt(v_keys, v_locked_until + interval '1 second');
  if not v_allowed then
    raise exception 'T73 FAIL: toujours verrouillé après la fenêtre (horloge injectée après locked_until)';
  end if;
  select allowed into v_allowed from app_hidden.pin_auth_throttle_consume_attempt(v_keys, v_locked_until - interval '1 second');
  if v_allowed then
    raise exception 'T73 FAIL: déjà déverrouillé AVANT la fin de la fenêtre (horloge injectée avant locked_until)';
  end if;

  -- reset() efface complètement les DEUX clés (jamais une seule).
  set local role service_role;
  perform public.pin_auth_throttle_reset_api(v_keys);
  reset role;
  if exists (select 1 from app_hidden.pin_auth_throttle where key_hash = any(v_keys)) then
    raise exception 'T73 FAIL: throttle_reset_api n''a pas effacé les lignes des 2 clés';
  end if;

  raise notice 'T73 OK — throttle LOGIN atomique multi-clés (aucun verrou avant 5, verrouillé au 6e, AUCUN double-incrément pendant le verrou), déverrouillage après fenêtre prouvé par horloge injectée, reset efface les 2 clés';
end;
$$;

-- ── T74 — quota REGISTER (anti-spray) : fenêtre fixe, JAMAIS réinitialisée
-- par un succès, expiration de fenêtre prouvée par horloge injectée
-- (corr. throttle §9-§13/§18) ─────────────────────────────────────────────
do $$
declare
  v_key constant text := 'register-throttle-key-t74';
  v_allowed boolean;
  v_count int;
  v_window_start timestamptz;
  v_i int;
  v_now constant timestamptz := now();
begin
  set local role service_role;

  -- 25 inscriptions (la limite) : toutes autorisées, sur la MÊME fenêtre.
  for v_i in 1..25 loop
    select allowed into v_allowed from app_hidden.pin_auth_register_consume_attempt(v_key, v_now);
    if not v_allowed then
      raise exception 'T74 FAIL: refusé avant d''atteindre la limite (tentative %)', v_i;
    end if;
  end loop;

  -- 26e : refusée, quota atteint.
  select allowed into v_allowed from app_hidden.pin_auth_register_consume_attempt(v_key, v_now);
  if v_allowed then
    raise exception 'T74 FAIL: la 26e inscription (au-delà de la limite de 25) aurait dû être refusée';
  end if;

  reset role;
  select count, window_start into v_count, v_window_start
  from app_hidden.pin_auth_register_throttle where key_hash = v_key;
  if v_count <> 25 then
    raise exception 'T74 FAIL: count devrait être exactement 25 après la tentative refusée (obtenu %) — signe d''un incrément malgré le refus', v_count;
  end if;

  -- Un succès (public.pin_auth_register_account_api, appelé par le VRAI flux
  -- register après consume_attempt) ne doit JAMAIS réinitialiser ce quota —
  -- aucune fonction de reset n'existe même pour cette table (corr. throttle
  -- §12) : le quota reste bloqué tant que la fenêtre n'est pas expirée.
  set local role service_role;
  select allowed into v_allowed from app_hidden.pin_auth_register_consume_attempt(v_key, v_now + interval '10 minutes');
  reset role;
  if v_allowed then
    raise exception 'T74 FAIL: encore dans la fenêtre d''1h — devrait rester refusé (aucun reset n''existe pour ce quota)';
  end if;

  -- Expiration de la fenêtre (1h) — CLOCK INJECTION, jamais une vraie
  -- attente : une nouvelle fenêtre s'ouvre, count reparaît à 1.
  set local role service_role;
  select allowed into v_allowed from app_hidden.pin_auth_register_consume_attempt(v_key, v_now + interval '1 hour 1 minute');
  reset role;
  if not v_allowed then
    raise exception 'T74 FAIL: après expiration de la fenêtre, une nouvelle tentative devrait être autorisée';
  end if;
  select count, window_start into v_count, v_window_start
  from app_hidden.pin_auth_register_throttle where key_hash = v_key;
  if v_count <> 1 or v_window_start <= v_now then
    raise exception 'T74 FAIL: la nouvelle fenêtre devrait repartir avec count=1 et window_start avancé (count=%, window_start=%)', v_count, v_window_start;
  end if;

  raise notice 'T74 OK — quota REGISTER anti-spray (fenêtre fixe 25/1h, jamais réinitialisé par un succès, aucun incrément au-delà du refus, nouvelle fenêtre après expiration prouvée par horloge injectée)';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6B0 — infrastructure sécurisée d'import legacy (migration
-- 20260908194925_harden_legacy_import_idempotency.sql). `app_hidden.
-- create_fiche_from_draft()` (Phase 9A) alloue elle-même `next_number` et ne
-- peut structurellement PAS préserver une numérotation legacy trouée
-- (1, 2, 5) — d'où ce chemin serveur entièrement séparé :
-- `app_hidden.import_legacy_*` (SECURITY DEFINER), exposé par PostgREST
-- UNIQUEMENT via les wrappers `public.import_legacy_*_api` (SECURITY
-- INVOKER, même raison d'être que `create_fiche_from_draft_api` T56 :
-- `app_hidden` n'est pas dans [api].schemas). Idempotence portée par
-- PostgreSQL (verrou advisory + contrainte UNIQUE partielle), jamais par
-- `migrationMap` IndexedDB côté client — voir l'en-tête de la migration.
--
-- Fixtures dédiées (préfixe 60600000, jamais réutilisé ailleurs dans ce
-- fichier) : deux ateliers A/B, pour prouver l'isolation tenant-aware en
-- plus de l'idempotence intra-atelier.
insert into auth.users (id, phone) values
  ('60600000-0000-0000-0000-000000000a01', '+221770000701'),
  ('60600000-0000-0000-0000-000000000a02', '+221770000702');

insert into public.workshops (id, name, owner_id) values
  ('60600000-0000-0000-0000-000000000b01', 'Atelier Import Legacy A', '60600000-0000-0000-0000-000000000a01'),
  ('60600000-0000-0000-0000-000000000b02', 'Atelier Import Legacy B', '60600000-0000-0000-0000-000000000a02');

-- ── T75 — privilèges EXECUTE : anon/authenticated refusés, service_role seul,
-- sur les 7 fonctions app_hidden ET leurs 7 wrappers public — jamais de GRANT
-- PUBLIC résiduel non plus (même exigence que T56) ─────────────────────────
do $$
declare
  v_fn text;
  v_bad text;
  v_fns constant text[] := array[
    'app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb)',
    'app_hidden.import_legacy_carnet(uuid, int, int, public.carnet_status)',
    'app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz)',
    'app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz)',
    'app_hidden.import_legacy_modele(uuid, text, text, jsonb)',
    'app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb)',
    'app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb)',
    'public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb)',
    'public.import_legacy_carnet_api(uuid, int, int, public.carnet_status)',
    'public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb, timestamptz, timestamptz)',
    'public.import_legacy_payment_api(uuid, uuid, int, timestamptz)',
    'public.import_legacy_modele_api(uuid, text, text, jsonb)',
    'public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb)',
    'public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb)'
  ];
  v_schema text;
  v_name text;
begin
  foreach v_fn in array v_fns loop
    v_schema := split_part(v_fn, '.', 1);
    v_name := split_part(split_part(v_fn, '.', 2), '(', 1);

    select p.proacl::text into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = v_schema and p.proname = v_name;
    if v_bad is not null and v_bad ~ '(^|,)=[^/]*/' then
      raise exception 'T75 FAIL: PUBLIC a EXECUTE sur %  (proacl=%)', v_fn, v_bad;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'T75 FAIL: anon a EXECUTE sur %', v_fn;
    end if;
    if has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'T75 FAIL: authenticated a EXECUTE sur %', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'T75 FAIL: service_role n''a PAS EXECUTE sur % (import bloqué)', v_fn;
    end if;
  end loop;
  raise notice 'T75 OK — 14 fonctions import_legacy_* (app_hidden + wrappers public) : PUBLIC/anon/authenticated refusés, service_role seul habilité';
end;
$$;

-- ── T76 — propriétés des fonctions : app_hidden.* = SECURITY DEFINER +
-- search_path verrouillé ; public.*_api = SECURITY INVOKER (relais pur, ne
-- doit JAMAIS élever ses propres privilèges) + search_path verrouillé
-- (même exigence que T56) ───────────────────────────────────────────────────
do $$
declare
  v_name text;
  v_names constant text[] := array[
    'import_legacy_client', 'import_legacy_carnet', 'import_legacy_fiche',
    'import_legacy_payment', 'import_legacy_modele', 'import_legacy_media_asset',
    'import_legacy_modele_media'
  ];
begin
  foreach v_name in array v_names loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_hidden' and p.proname = v_name and p.prosecdef
    ) then
      raise exception 'T76 FAIL: app_hidden.% n''est pas SECURITY DEFINER', v_name;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app_hidden' and p.proname = v_name
        and p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path=%'
    ) then
      raise exception 'T76 FAIL: app_hidden.% sans search_path verrouillé', v_name;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name || '_api' and p.prosecdef
    ) then
      raise exception 'T76 FAIL: public.%_api est SECURITY DEFINER (attendu INVOKER — ne doit jamais élever son propre privilège)', v_name;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name || '_api'
        and p.proconfig is not null and array_to_string(p.proconfig, ',') like '%search_path=%'
    ) then
      raise exception 'T76 FAIL: public.%_api sans search_path verrouillé', v_name;
    end if;
  end loop;
  raise notice 'T76 OK — 7 fonctions app_hidden.import_legacy_* SECURITY DEFINER + search_path verrouillé ; 7 wrappers public.*_api SECURITY INVOKER + search_path verrouillé, app_hidden toujours non exposé';
end;
$$;

-- ── T77 — §19/§24 : cette migration n'a NI ajouté de GRANT INSERT à
-- anon/authenticated sur les tables métier (régression — inchangé depuis
-- Phase 4/T57), NI généralisé/modifié le privilège de table de service_role
-- (constat T54, ligne ~1575 : service_role porte un GRANT ALL par défaut de
-- la plateforme Supabase sur `public.*`, PRÉEXISTANT et JAMAIS révoqué par
-- AUCUNE migration de ce dépôt — le tester "absent" serait donc un faux
-- test, toujours faux). La VRAIE garantie architecturale de l'import legacy
-- n'est pas un GRANT de table absent, mais que les 7 fonctions
-- `app_hidden.import_legacy_*` sont SECURITY DEFINER (T76) : l'écriture
-- métier passe par le privilège du PROPRIÉTAIRE de la fonction, jamais par
-- une dépendance au GRANT de table de l'appelant — un appel RPC direct à
-- une insertion service_role brute, hors de ces fonctions, n'existe nulle
-- part dans le code de ce dépôt (Edge Function : uniquement `.rpc(...)`,
-- jamais `.from(table).insert(...)`, cf. supabase/functions/
-- import-legacy-data/index.ts) ───────────────────────────────────────────
do $$
declare
  v_tbl text;
  v_tbls constant text[] := array['clients', 'carnets', 'fiches', 'client_payments', 'modeles', 'modele_medias', 'media_assets'];
begin
  -- anon : aucun INSERT métier nulle part (inchangé depuis Phase 4 — régression).
  foreach v_tbl in array v_tbls loop
    if has_table_privilege('anon', 'public.' || v_tbl, 'insert') then
      raise exception 'T77 FAIL: anon a INSERT sur public.% (régression — devrait rester absent depuis Phase 4)', v_tbl;
    end if;
  end loop;

  -- authenticated : `carnets`/`fiches` sont les 2 tables porteuses de
  -- numérotation touchées par les index de cette migration — exactement les
  -- 2 tables où un INSERT authenticated accidentel court-circuiterait
  -- `create_fiche_from_draft`/l'import legacy (déjà testé T46, reconfirmé ici
  -- spécifiquement APRÈS ce durcissement). `clients`/`client_payments`/
  -- `modeles`/`modele_medias`/`media_assets` ont légitimement INSERT pour
  -- authenticated depuis Phase 4 (flux métier normal, sans rapport avec
  -- l'import legacy) — volontairement HORS scope de cette vérification.
  if has_table_privilege('authenticated', 'public.carnets', 'insert') then
    raise exception 'T77 FAIL: authenticated a INSERT sur public.carnets (régression — devrait rester réservé à import_legacy_carnet/create_fiche_from_draft)';
  end if;
  if has_table_privilege('authenticated', 'public.fiches', 'insert') then
    raise exception 'T77 FAIL: authenticated a INSERT sur public.fiches (régression — devrait rester réservé à import_legacy_fiche/create_fiche_from_draft)';
  end if;

  raise notice 'T77 OK — aucun GRANT INSERT nouveau pour anon (toutes tables) / authenticated (carnets, fiches) ; l''écriture métier de l''import legacy passe exclusivement par les 7 fonctions SECURITY DEFINER (T76), jamais par une dépendance au GRANT de table de service_role (préexistant, plateforme, jamais modifié par ce dépôt — T54)';
end;
$$;

-- ── T78 — isolation multi-atelier : le MÊME legacy_id dans 2 ateliers
-- différents ne collisionne JAMAIS (client + modèle) ────────────────────────
do $$
declare
  v_client_a public.clients;
  v_client_b public.clients;
  v_modele_a public.modeles;
  v_modele_b public.modeles;
begin
  set local role service_role;
  select * into v_client_a from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t78-client', 'Aïda Ndiaye');
  select * into v_client_b from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b02', 'legacy-t78-client', 'Aïda Ndiaye (atelier B)');
  select * into v_modele_a from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t78-modele', 'Boubou');
  select * into v_modele_b from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b02', 'legacy-t78-modele', 'Boubou');
  reset role;

  if v_client_a.id = v_client_b.id then
    raise exception 'T78 FAIL: le même legacy_id client dans 2 ateliers a produit le MÊME uuid (collision)';
  end if;
  if v_modele_a.id = v_modele_b.id then
    raise exception 'T78 FAIL: le même legacy_id modèle dans 2 ateliers a produit le MÊME uuid (collision)';
  end if;
  raise notice 'T78 OK — isolation multi-atelier : même legacy_id dans 2 ateliers -> 2 uuid distincts (client + modèle), jamais de collision';
end;
$$;

-- ── T79 — client : idempotence stricte (retry -> même ligne, jamais un
-- doublon), display_name VERBATIM (décision D2, aucune heuristique de
-- découpage), legacy_id/legacy_name préservés dans metadata ────────────────
do $$
declare
  v_first public.clients;
  v_retry public.clients;
  v_count int;
begin
  set local role service_role;
  select * into v_first from app_hidden.import_legacy_client(
    '60600000-0000-0000-0000-000000000b01', 'legacy-t79-client', 'Modou Fall Sarr',
    null, null, null, null, jsonb_build_object('legacy_name', 'Modou Fall Sarr')
  );
  select * into v_retry from app_hidden.import_legacy_client(
    '60600000-0000-0000-0000-000000000b01', 'legacy-t79-client', 'Modou Fall Sarr'
  );
  reset role;

  if v_first.display_name <> 'Modou Fall Sarr' then
    raise exception 'T79 FAIL: display_name n''est pas verbatim (obtenu %)', v_first.display_name;
  end if;
  if v_first.metadata ->> 'legacy_id' <> 'legacy-t79-client' then
    raise exception 'T79 FAIL: metadata.legacy_id absent/incorrect';
  end if;
  if v_first.metadata ->> 'legacy_name' <> 'Modou Fall Sarr' then
    raise exception 'T79 FAIL: metadata.legacy_name non préservé';
  end if;
  if v_retry.id <> v_first.id then
    raise exception 'T79 FAIL: retry client -> uuid différent (%  vs  %), pas idempotent', v_first.id, v_retry.id;
  end if;

  select count(*) into v_count from public.clients
  where workshop_id = '60600000-0000-0000-0000-000000000b01' and metadata ->> 'legacy_id' = 'legacy-t79-client';
  if v_count <> 1 then
    raise exception 'T79 FAIL: % ligne(s) en base après retry (attendu exactement 1)', v_count;
  end if;
  raise notice 'T79 OK — client : idempotent, display_name verbatim, legacy_id/legacy_name préservés, aucun doublon après retry';
end;
$$;

-- ── T80 — modèle : idempotence, JAMAIS dédupliqué par nom seul (2 legacy_id
-- distincts portant le même nom => 2 modèles distincts) ─────────────────────
do $$
declare
  v_first public.modeles;
  v_retry public.modeles;
  v_second public.modeles;
  v_count int;
begin
  set local role service_role;
  select * into v_first from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t80-modele-1', 'Robe wax');
  select * into v_retry from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t80-modele-1', 'Robe wax');
  select * into v_second from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t80-modele-2', 'Robe wax');
  reset role;

  if v_retry.id <> v_first.id then
    raise exception 'T80 FAIL: retry modèle -> uuid différent, pas idempotent';
  end if;
  if v_second.id = v_first.id then
    raise exception 'T80 FAIL: même nom + legacy_id DIFFÉRENT -> devrait être un modèle distinct, jamais dédupliqué par nom seul';
  end if;

  select count(*) into v_count from public.modeles
  where workshop_id = '60600000-0000-0000-0000-000000000b01' and metadata ->> 'legacy_id' = 'legacy-t80-modele-1';
  if v_count <> 1 then
    raise exception 'T80 FAIL: % ligne(s) en base après retry (attendu exactement 1)', v_count;
  end if;
  raise notice 'T80 OK — modèle : idempotent, jamais dédupliqué par le nom seul (2 legacy_id -> 2 modèles distincts même nom identique)';
end;
$$;

-- ── T81 — carnet + fiches : préservation EXACTE des trous historiques
-- (1, 2, 5 -> jamais 1, 2, 3), next_number correct, mapping de statut D8,
-- formule page/slot canonique (identique à create_fiche_from_draft) ────────
do $$
declare
  v_carnet public.carnets;
  v_fiche1 public.fiches;
  v_fiche2 public.fiches;
  v_fiche5 public.fiches;
  v_fiche1_retry public.fiches;
  v_client public.clients;
  v_numbers int[];
  v_count int;
begin
  set local role service_role;
  select * into v_client from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t81-client', 'Cliente T81');
  select * into v_carnet from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 42, 6);
  select * into v_fiche1 from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t81-fiche-1', 1, 'recu');
  select * into v_fiche2 from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, null, 'legacy-t81-fiche-2', 2, 'couture');
  select * into v_fiche5 from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t81-fiche-5', 5, 'pret');
  select * into v_fiche1_retry from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t81-fiche-1', 1, 'recu');
  reset role;

  if v_carnet.number <> 42 then
    raise exception 'T81 FAIL: numéro de carnet non préservé (obtenu %)', v_carnet.number;
  end if;
  if v_fiche1.status <> 'received' or v_fiche2.status <> 'sewing' or v_fiche5.status <> 'ready' then
    raise exception 'T81 FAIL: mapping de statut D8 incorrect (recu=%, couture=%, pret=%)', v_fiche1.status, v_fiche2.status, v_fiche5.status;
  end if;
  if v_fiche2.client_id is not null then
    raise exception 'T81 FAIL: fiche sans client (D4) -> client_id devrait rester NULL';
  end if;
  if v_fiche5.page_number <> ((5 - 1) / 4) + 1 or v_fiche5.slot_number <> ((5 - 1) % 4) + 1 then
    raise exception 'T81 FAIL: page_number/slot_number incohérents avec la formule canonique (page=%, slot=%)', v_fiche5.page_number, v_fiche5.slot_number;
  end if;
  if v_fiche1_retry.id <> v_fiche1.id then
    raise exception 'T81 FAIL: retry fiche #1 -> uuid différent, pas idempotent';
  end if;

  select array_agg(number order by number) into v_numbers from public.fiches where carnet_id = v_carnet.id;
  if v_numbers <> array[1, 2, 5] then
    raise exception 'T81 FAIL: numéros de fiches = % (attendu EXACTEMENT [1,2,5], jamais [1,2,3])', v_numbers;
  end if;

  select next_number into v_count from public.carnets where id = v_carnet.id;
  if v_count <> 6 then
    raise exception 'T81 FAIL: next_number = % (attendu 6, préservé tel que fourni, jamais recalculé automatiquement)', v_count;
  end if;

  raise notice 'T81 OK — carnet/fiches : trous historiques [1,2,5] préservés EXACTEMENT, next_number=6, statuts D8 mappés, client_id nullable (D4), page/slot canoniques, idempotent';
end;
$$;

-- ── T82 — paiement legacy (D6) : champs exacts, au plus 1 paiement legacy
-- par fiche (idempotence stricte), montant <= 0 rejeté ──────────────────────
do $$
declare
  v_client public.clients;
  v_carnet public.carnets;
  v_fiche public.fiches;
  v_first public.client_payments;
  v_retry public.client_payments;
  v_rejected boolean := false;
  v_count int;
begin
  set local role service_role;
  select * into v_client from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t82-client', 'Cliente T82');
  select * into v_carnet from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 43, 2);
  select * into v_fiche from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t82-fiche', 1, 'livre');
  select * into v_first from app_hidden.import_legacy_payment('60600000-0000-0000-0000-000000000b01', v_fiche.id, 15000, now());
  select * into v_retry from app_hidden.import_legacy_payment('60600000-0000-0000-0000-000000000b01', v_fiche.id, 15000, now());
  begin
    perform app_hidden.import_legacy_payment('60600000-0000-0000-0000-000000000b01', v_fiche.id, 0, now());
  exception when others then v_rejected := true;
  end;
  reset role;

  if v_first.amount <> 15000 then raise exception 'T82 FAIL: amount incorrect'; end if;
  if v_first.paid_at is not null then raise exception 'T82 FAIL: paid_at devrait être NULL (D6)'; end if;
  if v_first.method is not null then raise exception 'T82 FAIL: method devrait être NULL (D6)'; end if;
  if v_first.note <> 'Reprise du carnet — date du versement inconnue' then
    raise exception 'T82 FAIL: note D6 incorrecte (obtenu %)', v_first.note;
  end if;
  if v_first.metadata ->> 'source' <> 'legacy_import' then
    raise exception 'T82 FAIL: metadata.source devrait être legacy_import';
  end if;
  if v_retry.id <> v_first.id then
    raise exception 'T82 FAIL: retry paiement -> uuid différent, pas idempotent';
  end if;
  if not v_rejected then
    raise exception 'T82 FAIL: un montant <= 0 aurait dû être rejeté';
  end if;

  select count(*) into v_count from public.client_payments where fiche_id = v_fiche.id and metadata ->> 'source' = 'legacy_import';
  if v_count <> 1 then
    raise exception 'T82 FAIL: % ligne(s) en base après retry (attendu exactement 1 — au plus 1 paiement legacy par fiche)', v_count;
  end if;
  raise notice 'T82 OK — paiement legacy (D6) : champs exacts, idempotent (retry -> 1 ligne), montant <= 0 rejeté';
end;
$$;

-- ── T83 — média de FICHE : idempotence sur storage_path (retry -> même
-- ligne), type='model_photo' REFUSÉ (réservé à modele_medias) ──────────────
do $$
declare
  v_client public.clients;
  v_carnet public.carnets;
  v_fiche public.fiches;
  v_first public.media_assets;
  v_retry public.media_assets;
  v_rejected boolean := false;
  v_count int;
  v_path constant text := 'workshops/60600000-0000-0000-0000-000000000b01/fiches/t83-synthetic/legacy-fabric_photo-1';
begin
  set local role service_role;
  select * into v_client from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t83-client', 'Cliente T83');
  select * into v_carnet from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 44, 2);
  select * into v_fiche from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t83-fiche', 1, 'recu');
  select * into v_first from app_hidden.import_legacy_media_asset('60600000-0000-0000-0000-000000000b01', v_fiche.id, 'fabric_photo', v_path, 'image/jpeg', 1000);
  select * into v_retry from app_hidden.import_legacy_media_asset('60600000-0000-0000-0000-000000000b01', v_fiche.id, 'fabric_photo', v_path, 'image/jpeg', 1000);
  begin
    perform app_hidden.import_legacy_media_asset('60600000-0000-0000-0000-000000000b01', v_fiche.id, 'model_photo', v_path || '-2', 'image/jpeg', 1000);
  exception when others then v_rejected := true;
  end;
  reset role;

  if v_retry.id <> v_first.id or v_retry.storage_path <> v_first.storage_path then
    raise exception 'T83 FAIL: retry média fiche -> pas idempotent (id/storage_path différents)';
  end if;
  if not v_rejected then
    raise exception 'T83 FAIL: type=model_photo aurait dû être refusé pour un média de FICHE';
  end if;

  select count(*) into v_count from public.media_assets where storage_path = v_path;
  if v_count <> 1 then
    raise exception 'T83 FAIL: % ligne(s) en base après retry (attendu exactement 1)', v_count;
  end if;
  select count(*) into v_count from public.media_assets where type = 'model_photo';
  if v_count <> 0 then
    raise exception 'T83 FAIL: media_assets contient une ligne type=model_photo (valeur enum intentionnellement inutilisée)';
  end if;
  raise notice 'T83 OK — média fiche : idempotent sur storage_path, type=model_photo refusé (table réservée : modele_medias)';
end;
$$;

-- ── T84 — média de MODÈLE : idempotence sur storage_path, table SÉPARÉE de
-- media_assets (jamais confondues) ──────────────────────────────────────────
do $$
declare
  v_modele public.modeles;
  v_first public.modele_medias;
  v_retry public.modele_medias;
  v_count int;
  v_path constant text := 'workshops/60600000-0000-0000-0000-000000000b01/modeles/t84-synthetic/legacy-photo-1';
begin
  set local role service_role;
  select * into v_modele from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t84-modele', 'Ensemble bazin');
  select * into v_first from app_hidden.import_legacy_modele_media('60600000-0000-0000-0000-000000000b01', v_modele.id, 'photo', v_path, 'image/jpeg', 1000);
  select * into v_retry from app_hidden.import_legacy_modele_media('60600000-0000-0000-0000-000000000b01', v_modele.id, 'photo', v_path, 'image/jpeg', 1000);
  reset role;

  if v_retry.id <> v_first.id then
    raise exception 'T84 FAIL: retry média modèle -> pas idempotent';
  end if;

  select count(*) into v_count from public.modele_medias where storage_path = v_path;
  if v_count <> 1 then
    raise exception 'T84 FAIL: % ligne(s) en base après retry (attendu exactement 1)', v_count;
  end if;
  select count(*) into v_count from public.media_assets where storage_path = v_path;
  if v_count <> 0 then
    raise exception 'T84 FAIL: le média modèle a fuité dans media_assets (tables jamais confondues)';
  end if;
  raise notice 'T84 OK — média modèle : idempotent sur storage_path, table modele_medias jamais confondue avec media_assets';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Revue PR #20 — corrections de fidélité (§1/§2/§3 du plan de correction).
-- La validation numérique/date stricte (§4) est un durcissement de l'Edge
-- Function elle-même (aucune signature SQL concernée) — prouvée dans
-- scripts/test-import-legacy-data.mjs, pas ici.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── T85 — carnet : statut historique explicite (mapping canonique Phase 6 :
-- le carnet legacy le plus élevé = active, tous les précédents = archived),
-- valeur arbitraire refusée, idempotence préservant le statut au retry ──────
do $$
declare
  v_carnet1 public.carnets;
  v_carnet3 public.carnets;
  v_carnet1_retry public.carnets;
  v_rejected boolean := false;
begin
  set local role service_role;
  select * into v_carnet1 from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 101, 102, 'archived');
  select * into v_carnet3 from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 103, 50, 'active');
  select * into v_carnet1_retry from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 101, 102, 'archived');
  begin
    perform app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 104, 10, 'full');
  exception when others then v_rejected := true;
  end;
  reset role;

  if v_carnet1.status <> 'archived' then
    raise exception 'T85 FAIL: carnet 101 devrait être archived (obtenu %)', v_carnet1.status;
  end if;
  if v_carnet3.status <> 'active' then
    raise exception 'T85 FAIL: carnet 103 (le plus élevé) devrait être active (obtenu %)', v_carnet3.status;
  end if;
  if v_carnet1_retry.id <> v_carnet1.id or v_carnet1_retry.status <> 'archived' then
    raise exception 'T85 FAIL: retry carnet archived -> id/status altéré (pas idempotent)';
  end if;
  if not v_rejected then
    raise exception 'T85 FAIL: status=''full'' aurait dû être refusé (valeur arbitraire non autorisée pour l''import)';
  end if;
  raise notice 'T85 OK — carnet : statut historique explicite (archived pour les précédents, active pour le plus élevé), ''full'' refusé, idempotent au retry';
end;
$$;

-- ── T86 — fiche : `created_at`/`settled_at` legacy préservés EXACTEMENT
-- (mapping f.createdAt -> created_at, f.soldeLe -> settled_at), `updated_at`
-- toujours `now()` (comportement cible inchangé), retry sans altération,
-- `settled_at` NULL accepté ────────────────────────────────────────────────
do $$
declare
  v_client public.clients;
  v_carnet public.carnets;
  v_fiche public.fiches;
  v_fiche_retry public.fiches;
  v_fiche_open public.fiches;
  v_created_at constant timestamptz := '2024-02-03T10:20:30Z'::timestamptz;
  v_settled_at constant timestamptz := '2024-02-08T15:00:00Z'::timestamptz;
  v_before_insert constant timestamptz := now();
begin
  set local role service_role;
  select * into v_client from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t86-client', 'Cliente T86');
  select * into v_carnet from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 105, 3);
  select * into v_fiche from app_hidden.import_legacy_fiche(
    '60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t86-fiche', 1, 'livre',
    '{}'::jsonb, '', null, null, 1, null, 0, '{}'::jsonb, v_created_at, v_settled_at
  );
  select * into v_fiche_retry from app_hidden.import_legacy_fiche(
    '60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t86-fiche', 1, 'livre',
    '{}'::jsonb, '', null, null, 1, null, 0, '{}'::jsonb, v_created_at, v_settled_at
  );
  -- `settledAt` non fourni (NULL) : accepté, jamais inventé.
  select * into v_fiche_open from app_hidden.import_legacy_fiche(
    '60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t86-fiche-open', 2, 'recu'
  );
  reset role;

  if v_fiche.created_at <> v_created_at then
    raise exception 'T86 FAIL: created_at = % (attendu exactement %)', v_fiche.created_at, v_created_at;
  end if;
  if v_fiche.settled_at <> v_settled_at then
    raise exception 'T86 FAIL: settled_at = % (attendu exactement %)', v_fiche.settled_at, v_settled_at;
  end if;
  if v_fiche.updated_at < v_before_insert then
    raise exception 'T86 FAIL: updated_at devrait rester now() au moment de l''insertion, jamais la valeur legacy';
  end if;
  if v_fiche_retry.id <> v_fiche.id or v_fiche_retry.created_at <> v_created_at or v_fiche_retry.settled_at <> v_settled_at then
    raise exception 'T86 FAIL: retry -> created_at/settled_at altérés (pas idempotent)';
  end if;
  if v_fiche_open.settled_at is not null then
    raise exception 'T86 FAIL: settled_at aurait dû rester NULL (non fourni), jamais inventé';
  end if;
  if v_fiche_open.created_at < v_before_insert then
    raise exception 'T86 FAIL: created_at absent -> devrait retomber sur now() (jamais une heuristique), pas une valeur antérieure au test';
  end if;
  raise notice 'T86 OK — fiche : created_at/settled_at legacy préservés exactement, updated_at reste now(), retry inchangé, settled_at NULL accepté sans invention';
end;
$$;

-- ── T87 — médias : metadata legacy (D7 : duration_seconds, dimensions, …)
-- préservée de bout en bout (jamais remplacée par {}), idempotente au retry,
-- model_photo toujours inutilisé dans media_assets ─────────────────────────
do $$
declare
  v_client public.clients;
  v_carnet public.carnets;
  v_fiche public.fiches;
  v_modele public.modeles;
  v_voice public.media_assets;
  v_voice_retry public.media_assets;
  v_photo public.modele_medias;
  v_photo_retry public.modele_medias;
  v_count int;
  v_voice_path constant text := 'workshops/60600000-0000-0000-0000-000000000b01/fiches/t87-synthetic/legacy-voice_note-1';
  v_photo_path constant text := 'workshops/60600000-0000-0000-0000-000000000b01/modeles/t87-synthetic/legacy-photo-1';
begin
  set local role service_role;
  select * into v_client from app_hidden.import_legacy_client('60600000-0000-0000-0000-000000000b01', 'legacy-t87-client', 'Cliente T87');
  select * into v_carnet from app_hidden.import_legacy_carnet('60600000-0000-0000-0000-000000000b01', 106, 2);
  select * into v_fiche from app_hidden.import_legacy_fiche('60600000-0000-0000-0000-000000000b01', v_carnet.id, v_client.id, 'legacy-t87-fiche', 1, 'recu');
  select * into v_modele from app_hidden.import_legacy_modele('60600000-0000-0000-0000-000000000b01', 'legacy-t87-modele', 'Ensemble T87');

  select * into v_voice from app_hidden.import_legacy_media_asset(
    '60600000-0000-0000-0000-000000000b01', v_fiche.id, 'voice_note', v_voice_path, 'audio/webm', 5000,
    jsonb_build_object('duration_seconds', 14)
  );
  select * into v_voice_retry from app_hidden.import_legacy_media_asset(
    '60600000-0000-0000-0000-000000000b01', v_fiche.id, 'voice_note', v_voice_path, 'audio/webm', 5000,
    jsonb_build_object('duration_seconds', 14)
  );

  select * into v_photo from app_hidden.import_legacy_modele_media(
    '60600000-0000-0000-0000-000000000b01', v_modele.id, 'photo', v_photo_path, 'image/jpeg', 9000, 0,
    jsonb_build_object('width', 1200, 'height', 1600)
  );
  select * into v_photo_retry from app_hidden.import_legacy_modele_media(
    '60600000-0000-0000-0000-000000000b01', v_modele.id, 'photo', v_photo_path, 'image/jpeg', 9000, 0,
    jsonb_build_object('width', 1200, 'height', 1600)
  );
  reset role;

  if (v_voice.metadata ->> 'duration_seconds')::int <> 14 then
    raise exception 'T87 FAIL: media_assets.metadata.duration_seconds = % (attendu 14)', v_voice.metadata ->> 'duration_seconds';
  end if;
  if v_voice_retry.id <> v_voice.id or v_voice_retry.metadata <> v_voice.metadata then
    raise exception 'T87 FAIL: retry média fiche -> metadata/id altérés (pas idempotent)';
  end if;
  select count(*) into v_count from public.media_assets where storage_path = v_voice_path;
  if v_count <> 1 then
    raise exception 'T87 FAIL: % ligne(s) media_assets après retry (attendu exactement 1)', v_count;
  end if;

  if (v_photo.metadata ->> 'width')::int <> 1200 or (v_photo.metadata ->> 'height')::int <> 1600 then
    raise exception 'T87 FAIL: modele_medias.metadata width/height incorrects (obtenu %)', v_photo.metadata;
  end if;
  if v_photo_retry.id <> v_photo.id or v_photo_retry.metadata <> v_photo.metadata then
    raise exception 'T87 FAIL: retry média modèle -> metadata/id altérés (pas idempotent)';
  end if;
  select count(*) into v_count from public.modele_medias where storage_path = v_photo_path;
  if v_count <> 1 then
    raise exception 'T87 FAIL: % ligne(s) modele_medias après retry (attendu exactement 1)', v_count;
  end if;

  select count(*) into v_count from public.media_assets where type = 'model_photo';
  if v_count <> 0 then
    raise exception 'T87 FAIL: media_assets contient une ligne type=model_photo (toujours censé rester inutilisé)';
  end if;

  raise notice 'T87 OK — metadata legacy (D7) préservée de bout en bout pour média fiche ET média modèle, idempotente au retry, model_photo toujours inutilisé';
end;
$$;

-- Concurrence RÉELLE (2 appels HTTP simultanés -> exactement 1 ligne, même
-- uuid) : preuve end-to-end dans scripts/test-import-legacy-data.mjs (§15,
-- même convention que la concurrence pin_auth — T9/T10 de ce fichier
-- restent volontairement séquentielles, la concurrence réseau réelle est
-- prouvée par le script Node, jamais simulée ici).

do $$ begin raise notice '════════  SCHÉMA PHASE 2 + WRAPPER PHASE 3A + CORRECTIFS GRANT + PHASE 4 GRANT/RLS + WRAPPER PHASE 9A + STORAGE PHASE 8A + STORAGE PHASE 8B + PIVOT AUTH PIN + THROTTLE ATOMIQUE + IMPORT LEGACY PHASE 6B0 + CORRECTIFS REVUE PR #20 : 87 groupes de tests OK  ════════'; end; $$;

rollback;
