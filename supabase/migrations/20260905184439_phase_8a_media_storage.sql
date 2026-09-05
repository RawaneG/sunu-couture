-- Phase 8A — bucket Storage privé `media` + policies SELECT/INSERT
--
-- CONSTAT (corrige la documentation antérieure « Phase 8A : aucune migration
-- SQL ») : `storage.buckets` = 0 bucket, `storage.objects` = 0 policy avant
-- cette migration. Le schéma métier `public.media_assets` existe déjà
-- (Phase 2, `create_core_schema.sql`) et n'est PAS modifié ici — cette
-- migration ne touche QUE Storage.
--
-- Path canonique, sans PII (jamais nom client/téléphone/vêtement) :
--   workshops/{workshopId}/fiches/{ficheId}/{fileId}
--
-- Isolation (§37, corr. R) : la policy ne se contente PAS de comparer le
-- segment `workshopId` fourni tel quel par le navigateur — elle vérifie
-- qu'une fiche RÉELLE (`public.fiches`, sous RLS `fiches_select_member`,
-- Phase 4) porte EXACTEMENT ce couple `(id, workshop_id)`, non supprimée.
-- Comparaisons TEXTE uniquement (jamais un cast `::uuid` non protégé qui
-- ferait échouer toute la policy sur un path malformé — un index de tableau
-- hors bornes renvoie NULL en Postgres, jamais une erreur, donc un path
-- mal formé est simplement refusé).
--
-- Bucket PRIVÉ (`public = false`) — aucune `getPublicUrl()` possible côté
-- client, seule `createSignedUrl()` fonctionne (§28). `allowed_mime_types`
-- restreint au strict nécessaire Phase 8A (§27) — aucune limite de taille
-- arbitraire non issue d'une décision produit n'est fixée ici.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', false, array['image/jpeg', 'image/png', 'audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do nothing;

-- ── Policies storage.objects — SELECT + INSERT `authenticated` uniquement ──
-- Aucun UPDATE ni DELETE (§36) : la suppression physique d'un objet n'est
-- pas un droit navigateur en Phase 8A — seule `public.media_assets.
-- deleted_at` (déjà accordée à `authenticated`, Phase 4) exprime une
-- suppression logique ; l'objet Storage reste présent. Aucune policy
-- `anon`/`public` (§38) : RLS active par défaut sur `storage.objects`
-- (plateforme Supabase) ferme tout accès en l'absence de policy.
do $$
begin
  if to_regrole('authenticated') is not null then
    create policy media_objects_select_member on storage.objects
      for select to authenticated
      using (
        bucket_id = 'media'
        and array_length(storage.foldername(name), 1) = 4
        and (storage.foldername(name))[1] = 'workshops'
        and (storage.foldername(name))[3] = 'fiches'
        and exists (
          select 1
          from public.fiches f
          where f.id::text = (storage.foldername(name))[4]
            and f.workshop_id::text = (storage.foldername(name))[2]
            and f.deleted_at is null
        )
      );

    create policy media_objects_insert_member on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'media'
        and array_length(storage.foldername(name), 1) = 4
        and (storage.foldername(name))[1] = 'workshops'
        and (storage.foldername(name))[3] = 'fiches'
        and exists (
          select 1
          from public.fiches f
          where f.id::text = (storage.foldername(name))[4]
            and f.workshop_id::text = (storage.foldername(name))[2]
            and f.deleted_at is null
        )
      );
  end if;
end;
$$;
