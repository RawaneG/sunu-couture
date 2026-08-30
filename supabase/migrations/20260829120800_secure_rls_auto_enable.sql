-- secure_rls_auto_enable
-- Traite l'avertissement Supabase existant sur le projet distant sunu-couture-dev :
--   public.rls_auto_enable()  — SECURITY DEFINER, EXECUTE ouvert à anon / authenticated,
--   avec un event trigger `ensure_rls` actif.
--
-- Cette migration :
--   • RÉVOQUE `EXECUTE` sur public.rls_auto_enable() pour PUBLIC, anon, authenticated ;
--   • ne SUPPRIME NI NE DÉSACTIVE l'event trigger `ensure_rls` (il continue d'auto-
--     activer la RLS sur les nouvelles tables — comportement souhaité) ;
--   • est compatible avec les environnements où la fonction n'existe pas
--     (`to_regprocedure()` renvoie NULL sans erreur) et où les rôles Supabase
--     n'existent pas (`to_regrole()` renvoie NULL sans erreur).

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise notice 'secure_rls_auto_enable: public.rls_auto_enable() absente — rien à révoquer';
  else
    -- une seule instruction, comme demandé : REVOKE … FROM PUBLIC, anon, authenticated
    -- (les rôles anon / authenticated peuvent être absents hors Supabase → on les
    --  ajoute seulement s'ils existent).
    if to_regrole('anon') is not null and to_regrole('authenticated') is not null then
      revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    elsif to_regrole('anon') is not null then
      revoke execute on function public.rls_auto_enable() from public, anon;
    elsif to_regrole('authenticated') is not null then
      revoke execute on function public.rls_auto_enable() from public, authenticated;
    else
      revoke execute on function public.rls_auto_enable() from public;
    end if;
    raise notice 'secure_rls_auto_enable: EXECUTE révoqué sur public.rls_auto_enable() '
                 'pour PUBLIC + anon/authenticated (si présents) ; event trigger ensure_rls NON modifié';
  end if;

  -- Vérification défensive : si l'event trigger existe, il doit rester actif.
  if exists (select 1 from pg_event_trigger where evtname = 'ensure_rls'
             and evtenabled = 'D') then
    raise exception 'secure_rls_auto_enable: l''event trigger ensure_rls est désactivé — anomalie';
  end if;
end;
$$;
