-- Rollback de 20260829120300_create_sync_and_reminders
drop table if exists public.reminders;
drop table if exists public.sync_conflicts;
