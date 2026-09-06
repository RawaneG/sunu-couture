-- Phase 8B — étend les policies Storage `media` pour accepter le catalogue
-- de modèles, en plus des médias fiche (Phase 8A).
--
-- CONSTAT (corrige le gel qui prévoyait "aucune migration SQL 8B sauf
-- éventuel GRANT") : le bucket `media` et ses 2 policies `storage.objects`
-- (Phase 8A, `20260905184439_phase_8a_media_storage.sql`) n'acceptent
-- aujourd'hui QUE le path fiche `workshops/{workshopId}/fiches/{ficheId}/
-- {fileId}`. Phase 8B a besoin d'un second path, dans le MÊME bucket :
-- `workshops/{workshopId}/modeles/{modeleId}/{fileId}`. Ni `public.modeles`
-- ni `public.modele_medias` ne changent ici (schéma + GRANT déjà en place
-- depuis Phase 4) — cette migration ne touche QUE Storage.
--
-- Décision (§9, non négociable) : ne PAS ajouter 2 policies supplémentaires
-- pour la branche modèle (4 policies au total serait une duplication —
-- plusieurs policies permissives pour le même rôle + la même opération sur
-- `storage.objects` déclenchent l'advisor `multiple_permissive_policies`,
-- en plus d'être inutile). À la place : DROP les 2 policies Phase 8A
-- existantes, RECREATE avec les MÊMES 2 noms, chacune acceptant la branche
-- fiche OU la branche modèle. Toujours `authenticated` uniquement, SELECT +
-- INSERT uniquement (aucun UPDATE/DELETE/anon — inchangé depuis Phase 8A).
--
-- Path modèle : mêmes garanties de sécurité que la branche fiche (§37/§13
-- Phase 8A) — comparaisons `::text` UNIQUEMENT (jamais `::uuid` non protégé,
-- un path malformé est simplement refusé, jamais une exception de cast), et
-- la visibilité dépend d'une fiche/un modèle RÉEL sous la RLS de
-- l'utilisateur (`fiches_select_member`/`modeles_select_member`, Phase 4),
-- jamais d'une simple comparaison de segment de path pris pour argent
-- comptant.
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
        and (
          (
            (storage.foldername(name))[3] = 'fiches'
            and exists (
              select 1
              from public.fiches f
              where f.id::text = (storage.foldername(name))[4]
                and f.workshop_id::text = (storage.foldername(name))[2]
                and f.deleted_at is null
            )
          )
          or (
            (storage.foldername(name))[3] = 'modeles'
            and exists (
              select 1
              from public.modeles m
              where m.id::text = (storage.foldername(name))[4]
                and m.workshop_id::text = (storage.foldername(name))[2]
                and m.deleted_at is null
            )
          )
        )
      );

    create policy media_objects_insert_member on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'media'
        and array_length(storage.foldername(name), 1) = 4
        and (storage.foldername(name))[1] = 'workshops'
        and (
          (
            (storage.foldername(name))[3] = 'fiches'
            and exists (
              select 1
              from public.fiches f
              where f.id::text = (storage.foldername(name))[4]
                and f.workshop_id::text = (storage.foldername(name))[2]
                and f.deleted_at is null
            )
          )
          or (
            (storage.foldername(name))[3] = 'modeles'
            and exists (
              select 1
              from public.modeles m
              where m.id::text = (storage.foldername(name))[4]
                and m.workshop_id::text = (storage.foldername(name))[2]
                and m.deleted_at is null
            )
          )
        )
      );
  end if;
end;
$$;
