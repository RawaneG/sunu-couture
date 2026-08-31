-- provision_workshop_api (Phase 3A)
--
-- CONSTAT : `app_hidden` n'est PAS dans `[api].schemas` (supabase/config.toml).
-- Un appel `supabase-js.schema('app_hidden').rpc('provision_workshop', …)` ne
-- fonctionnerait donc jamais (PostgREST : PGRST106, schéma non exposé) — et
-- même s'il fonctionnait, ce serait une violation de la frontière `app_hidden`
-- documentée en Phase 2 (corr. Q). Cette migration ajoute donc l'UNIQUE porte
-- PostgREST vers le provisioning d'atelier : un wrapper dans `public` (schéma
-- exposé), SECURITY INVOKER (jamais DEFINER — il ne fait qu'appeler une
-- fonction déjà SECURITY DEFINER, il n'a besoin d'aucun privilège propre),
-- `search_path = ''`, noms entièrement qualifiés, EXECUTE réservé à
-- `service_role`.
--
-- FRONTIÈRE `service_role` (inchangée, corr. Q) : `p_owner` doit provenir
-- EXCLUSIVEMENT de l'identité dérivée d'un JWT vérifié côté Edge Function
-- (`getClaims()` → claim `sub`), jamais d'un champ du corps JSON envoyé par
-- le navigateur. Ce wrapper ne peut pas lui-même vérifier la provenance de
-- `p_owner` : c'est le rôle de l'Edge Function `provision-workshop` (seule
-- détentrice de la clé secrète nécessaire pour atteindre `service_role`).
--
-- IDEMPOTENCE (Phase 3A) : `app_hidden.provision_workshop()` insère SANS
-- condition à chaque appel (aucune contrainte UNIQUE sur `workshops.owner_id`
-- — un même owner *peut* légitimement posséder plusieurs ateliers dans le
-- schéma). Pour que le provisioning d'ONBOARDING reste rejouable sans jamais
-- créer de doublon (ex. retry réseau côté client, double clic, ou simple
-- restauration de session), ce wrapper vérifie D'ABORD si `p_owner` possède
-- déjà un atelier et, si oui, renvoie CET atelier — **quel que soit `p_name`,
-- y compris NULL** — sans appeler `app_hidden.provision_workshop()` une
-- seconde fois. Un verrou advisory (même schéma que `create_fiche_from_draft`)
-- sérialise deux appels concurrents du même owner pour éviter une course qui
-- créerait deux ateliers. Ce choix est scopé à ce nouveau point d'entrée : le
-- contrat de `app_hidden.provision_workshop()` lui-même n'est pas modifié
-- (tests Phase 2 T27/T27b inchangés).
--
-- SÉMANTIQUE DE `p_name` (passe corrective) : l'Edge Function appelle
-- systématiquement ce wrapper avec `p_name = NULL` juste après connexion, pour
-- SONDER si un atelier existe déjà (jamais pour en deviner un nom). Trois cas :
--   1. un atelier existe déjà pour `p_owner`  → il est retourné, `p_name`
--      ignoré (même s'il est fourni) ;
--   2. aucun atelier n'existe ET `p_name` est NULL/vide (après trim) → erreur
--      métier CONTRÔLÉE, code SQLSTATE personnalisé `WSN01`
--      (`workshop_name_required`) — jamais un nom inventé automatiquement ;
--   3. aucun atelier n'existe ET `p_name` est un texte non vide → création via
--      `app_hidden.provision_workshop()`, comme avant.

create or replace function public.provision_workshop_api(p_owner uuid, p_name text)
returns public.workshops
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.workshops;
  v_name text;
begin
  if p_owner is null then
    raise exception 'provision_workshop_api: owner requis' using errcode = 'null_value_not_allowed';
  end if;

  -- Sérialise deux appels concurrents pour le même owner (évite une course
  -- où deux transactions ne verraient toutes deux "pas d'atelier existant" et
  -- créeraient chacune un atelier).
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 73));

  select * into v_existing
  from public.workshops
  where owner_id = p_owner
  order by created_at asc
  limit 1;

  if found then
    return v_existing;
  end if;

  v_name := nullif(btrim(coalesce(p_name, ''), E' \t\n\r\f\v'), '');
  if v_name is null then
    raise exception 'provision_workshop_api: aucun atelier existant pour cet owner — nom requis pour en créer un'
      using errcode = 'WSN01',
            detail = 'workshop_name_required';
  end if;

  return app_hidden.provision_workshop(p_owner, v_name);
end;
$$;

comment on function public.provision_workshop_api(uuid, text) is
  'SEULE porte PostgREST vers app_hidden.provision_workshop() — app_hidden '
  'n''est pas exposé dans [api].schemas. SECURITY INVOKER (jamais DEFINER). '
  'EXECUTE réservé à service_role. p_owner DOIT provenir d''un JWT vérifié '
  'côté Edge Function (getClaims().sub), jamais du JSON envoyé par le '
  'navigateur — voir supabase/functions/provision-workshop/. Idempotent : un '
  'owner déjà provisionné récupère son atelier existant (p_name ignoré), '
  'jamais un doublon. p_name NULL/vide sans atelier existant → erreur '
  'contrôlée SQLSTATE ''WSN01'' (workshop_name_required), jamais un nom '
  'inventé automatiquement.';

revoke all on function public.provision_workshop_api(uuid, text) from public;

do $$
begin
  if to_regrole('anon') is not null then
    revoke all on function public.provision_workshop_api(uuid, text) from anon;
  end if;
  if to_regrole('authenticated') is not null then
    revoke all on function public.provision_workshop_api(uuid, text) from authenticated;
  end if;
  if to_regrole('service_role') is not null then
    grant execute on function public.provision_workshop_api(uuid, text) to service_role;
  end if;
end;
$$;
