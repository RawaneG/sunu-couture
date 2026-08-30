-- Rollback de 20260829120400_create_functions_and_triggers
drop trigger if exists trg_workshop_members_protect_owner on public.workshop_members;
drop trigger if exists trg_workshops_sync_owner           on public.workshops;

drop trigger if exists trg_reminders_updated_at     on public.reminders;
drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
drop trigger if exists trg_modeles_updated_at       on public.modeles;
drop trigger if exists trg_fiches_updated_at        on public.fiches;
drop trigger if exists trg_clients_updated_at       on public.clients;
drop trigger if exists trg_carnets_updated_at       on public.carnets;
drop trigger if exists trg_workshops_updated_at     on public.workshops;

drop function if exists app_hidden.create_fiche_from_draft(uuid, uuid, jsonb);
drop function if exists app_hidden.provision_workshop(uuid, text);
drop function if exists app_hidden.current_workshop_ids();
drop function if exists app_hidden.protect_owner_membership();
drop function if exists app_hidden.sync_owner_membership();
drop function if exists app_hidden.set_updated_at();
