-- create_fiche_from_draft_api (Phase 9A)
--
-- CONSTAT : identique à `provision_workshop_api` (migration
-- 20260830160310) — `app_hidden` n'est PAS dans `[api].schemas`
-- (supabase/config.toml). Un appel `supabase-js.schema('app_hidden')
-- .rpc('create_fiche_from_draft', …)` échouerait donc systématiquement
-- (PostgREST : PGRST106, schéma non exposé). Cette migration ajoute donc
-- l'UNIQUE porte PostgREST vers `app_hidden.create_fiche_from_draft()` : un
-- wrapper dans `public` (schéma exposé), SECURITY INVOKER (jamais DEFINER —
-- il ne fait qu'appeler une fonction déjà SECURITY DEFINER, il n'a besoin
-- d'aucun privilège propre), `search_path = ''`, noms entièrement qualifiés,
-- EXECUTE réservé à `service_role`.
--
-- AUCUNE AUTRE OPÉRATION CRUD n'est ajoutée par cette migration : ni GRANT
-- INSERT sur `fiches`/`carnets` à `authenticated`, ni politique RLS
-- supplémentaire — le wrapper reste, comme `app_hidden.create_fiche_from_draft`
-- elle-même, la SEULE porte d'attribution de numéro (voir T33/T46,
-- 10_schema_tests.sql).
--
-- FRONTIÈRE service_role (inchangée) : `p_workshop_id` et `p_client_id`
-- DOIVENT provenir EXCLUSIVEMENT de vérifications faites côté Edge Function
-- (`getClaims()` → claim `sub`, puis contrôle d'appartenance/rôle via un
-- client RLS scopé à l'utilisateur, PUIS validation que le client appartient
-- bien à cet atelier) — jamais d'un champ du corps JSON envoyé tel quel par
-- le navigateur. Ce wrapper ne peut PAS lui-même vérifier cette provenance :
-- c'est le rôle de l'Edge Function `create-fiche-from-draft` (seule
-- détentrice de la clé secrète nécessaire pour atteindre `service_role`) —
-- la contrainte de clé étrangère composite sur `fiches` reste une SECONDE
-- ligne de défense, jamais la seule.
--
-- RÈGLE MÉTIER ANTI-FICHE-VIDE : entièrement déléguée à
-- `app_hidden.create_fiche_from_draft()` (déjà testée T32/T33) — ce wrapper
-- ne duplique ni n'affaiblit cette règle, il se contente de relayer l'appel
-- et son résultat (y compris ses erreurs, via SQLSTATE).

create or replace function public.create_fiche_from_draft_api(
  p_workshop_id uuid,
  p_client_id   uuid,
  p_fiche       jsonb
)
returns public.fiches
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return app_hidden.create_fiche_from_draft(p_workshop_id, p_client_id, p_fiche);
end;
$$;

comment on function public.create_fiche_from_draft_api(uuid, uuid, jsonb) is
  'SEULE porte PostgREST vers app_hidden.create_fiche_from_draft() — app_hidden '
  'n''est pas exposé dans [api].schemas. SECURITY INVOKER (jamais DEFINER). '
  'EXECUTE réservé à service_role. p_workshop_id/p_client_id DOIVENT provenir '
  'de vérifications faites côté Edge Function (JWT vérifié + contrôle '
  'appartenance/rôle + appartenance du client à l''atelier), jamais du JSON '
  'envoyé tel quel par le navigateur — voir '
  'supabase/functions/create-fiche-from-draft/. Aucune règle métier propre : '
  'relaie intégralement app_hidden.create_fiche_from_draft() (anti-fiche-vide, '
  'numérotation, page/slot — déjà testées T32/T33/T46).';

revoke all on function public.create_fiche_from_draft_api(uuid, uuid, jsonb) from public;

do $$
begin
  if to_regrole('anon') is not null then
    revoke all on function public.create_fiche_from_draft_api(uuid, uuid, jsonb) from anon;
  end if;
  if to_regrole('authenticated') is not null then
    revoke all on function public.create_fiche_from_draft_api(uuid, uuid, jsonb) from authenticated;
  end if;
  if to_regrole('service_role') is not null then
    grant execute on function public.create_fiche_from_draft_api(uuid, uuid, jsonb) to service_role;
  end if;
end;
$$;
