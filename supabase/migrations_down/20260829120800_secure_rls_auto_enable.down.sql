-- Rollback de 20260829120800_secure_rls_auto_enable
-- NO-OP DÉLIBÉRÉ : on ne re-`GRANT`e PAS `EXECUTE` sur public.rls_auto_enable()
-- à anon / authenticated (cela ré-ouvrirait la faille signalée par l'advisor).
-- L'event trigger ensure_rls n'a jamais été touché → rien à restaurer.
select 'no-op: secure_rls_auto_enable rollback (on ne ré-ouvre pas EXECUTE)' as note;
