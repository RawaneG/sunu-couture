-- Rollback de 20260908194925_harden_legacy_import_idempotency
drop function if exists public.import_legacy_modele_media_api(uuid, uuid, text, text, text, bigint, int, jsonb);
drop function if exists public.import_legacy_media_asset_api(uuid, uuid, text, text, text, bigint, jsonb);
drop function if exists public.import_legacy_modele_api(uuid, text, text, jsonb);
drop function if exists public.import_legacy_payment_api(uuid, uuid, int, timestamptz);
drop function if exists public.import_legacy_fiche_api(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb);
drop function if exists public.import_legacy_carnet_api(uuid, int, int);
drop function if exists public.import_legacy_client_api(uuid, text, text, text, text, text, text, jsonb);

drop function if exists app_hidden.import_legacy_modele_media(uuid, uuid, text, text, text, bigint, int, jsonb);
drop function if exists app_hidden.import_legacy_media_asset(uuid, uuid, text, text, text, bigint, jsonb);
drop function if exists app_hidden.import_legacy_modele(uuid, text, text, jsonb);
drop function if exists app_hidden.import_legacy_payment(uuid, uuid, int, timestamptz);
drop function if exists app_hidden.import_legacy_fiche(uuid, uuid, uuid, text, int, text, jsonb, text, text, text, int, date, int, jsonb);
drop function if exists app_hidden.import_legacy_carnet(uuid, int, int);
drop function if exists app_hidden.import_legacy_client(uuid, text, text, text, text, text, text, jsonb);

drop index if exists public.client_payments_one_legacy_per_fiche_uidx;
drop index if exists public.modeles_workshop_legacy_id_uidx;
drop index if exists public.clients_workshop_legacy_id_uidx;
drop index if exists public.fiches_workshop_legacy_id_uidx;

-- Restaure l'index non-unique d'origine (Phase 2) avant de retirer la colonne.
create index if not exists fiches_legacy_id_idx
  on public.fiches ((metadata ->> 'legacy_id'))
  where metadata ? 'legacy_id';

alter table public.modeles drop column if exists metadata;
