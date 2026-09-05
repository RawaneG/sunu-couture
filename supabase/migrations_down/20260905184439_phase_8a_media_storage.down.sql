-- Rollback de 20260905184439_phase_8a_media_storage
--
-- Ne supprime JAMAIS physiquement un objet Storage (§39) : ce rollback
-- retire uniquement les policies, puis le bucket lui-même SEULEMENT s'il est
-- vide (jamais un DELETE storage.objects).
drop policy if exists media_objects_select_member on storage.objects;
drop policy if exists media_objects_insert_member on storage.objects;

do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'media') then
    delete from storage.buckets where id = 'media';
  end if;
end;
$$;
