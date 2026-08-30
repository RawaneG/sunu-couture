-- Rollback de 20260829120700_security_hardening
-- Les REVOKE de durcissement ne sont pas « annulés » (on ne re-grant pas des
-- droits larges volontairement retirés). Ce fichier est un no-op documenté :
-- pour repartir de zéro, utiliser `supabase db reset`.
select 'no-op: security_hardening rollback' as note;
