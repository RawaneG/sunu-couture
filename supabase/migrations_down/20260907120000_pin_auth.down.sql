-- Rollback de 20260907120000_pin_auth
drop function if exists public.pin_auth_throttle_reset_api(text);
drop function if exists public.pin_auth_throttle_record_failure_api(text);
drop function if exists public.pin_auth_throttle_status_api(text);
drop function if exists public.pin_auth_touch_login_api(uuid);
drop function if exists public.pin_auth_lookup_account_api(text);
drop function if exists public.pin_auth_register_account_api(uuid, text, text);

drop function if exists app_hidden.pin_auth_throttle_reset(text);
drop function if exists app_hidden.pin_auth_throttle_record_failure(text, timestamptz);
drop function if exists app_hidden.pin_auth_throttle_status(text, timestamptz);
drop function if exists app_hidden.pin_auth_touch_login(uuid);
drop function if exists app_hidden.pin_auth_lookup_account(text);
drop function if exists app_hidden.pin_auth_register_account(uuid, text, text);

drop table if exists app_hidden.pin_auth_throttle;
drop table if exists app_hidden.pin_auth_accounts;
