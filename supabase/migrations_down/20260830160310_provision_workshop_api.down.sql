-- Rollback de 20260830160310_provision_workshop_api
drop function if exists public.provision_workshop_api(uuid, text);
