-- Rollback de 20260905144612_create_fiche_from_draft_api
drop function if exists public.create_fiche_from_draft_api(uuid, uuid, jsonb);
