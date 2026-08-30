-- Rollback de 20260829120600_enable_row_level_security
alter table public.reminders                disable row level security;
alter table public.sync_conflicts           disable row level security;
alter table public.promo_codes              disable row level security;
alter table public.subscription_transactions disable row level security;
alter table public.subscriptions            disable row level security;
alter table public.subscription_plans       disable row level security;
alter table public.modele_medias            disable row level security;
alter table public.modeles                  disable row level security;
alter table public.media_assets             disable row level security;
alter table public.client_payments          disable row level security;
alter table public.fiches                   disable row level security;
alter table public.clients                  disable row level security;
alter table public.carnets                  disable row level security;
alter table public.workshop_members         disable row level security;
alter table public.workshops                disable row level security;
