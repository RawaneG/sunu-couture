-- enable_row_level_security
-- RLS activée EXPLICITEMENT ici, dans la migration, sur CHAQUE table exposée —
-- on ne dépend pas du déclencheur automatique du Dashboard (schéma reproductible).
--
-- AUCUNE politique n'est créée à ce stade : les politiques sont livrées en
-- Phase 4 (correction E : workshop_members non récursive, UPDATE avec USING +
-- WITH CHECK). Conséquence voulue : jusqu'à la Phase 4, `anon` et `authenticated`
-- n'ont accès à AUCUNE ligne (RLS active + 0 politique = refus par défaut).
-- Seuls le propriétaire des tables et `service_role` (BYPASSRLS) accèdent aux
-- données — suffisant pour la Phase 2 (aucune donnée réelle, aucun front branché).

alter table public.workshops                enable row level security;
alter table public.workshop_members         enable row level security;
alter table public.carnets                  enable row level security;
alter table public.clients                  enable row level security;
alter table public.fiches                   enable row level security;
alter table public.client_payments          enable row level security;
alter table public.media_assets             enable row level security;
alter table public.modeles                  enable row level security;
alter table public.modele_medias            enable row level security;
alter table public.subscription_plans       enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.subscription_transactions enable row level security;
alter table public.promo_codes              enable row level security;
alter table public.sync_conflicts           enable row level security;
alter table public.reminders                enable row level security;
