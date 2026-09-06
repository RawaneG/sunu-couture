-- Rollback de 20260906161045_phase_8b_catalog_storage_policies
--
-- Retire les 2 policies Phase 8B (fiche OU modèle) et recrée EXACTEMENT les
-- policies fiche-only de Phase 8A — jamais un DELETE storage.objects, jamais
-- une suppression du bucket, jamais un changement à public.modeles /
-- public.modele_medias (voir §15).
drop policy if exists media_objects_select_member on storage.objects;
drop policy if exists media_objects_insert_member on storage.objects;

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
