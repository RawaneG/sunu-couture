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

do $$ begin raise notice '════════  SCHÉMA PHASE 2 + WRAPPER PHASE 3A : 39 groupes de tests OK  ════════'; end; $$;

rollback;
