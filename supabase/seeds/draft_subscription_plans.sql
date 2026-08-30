-- ═══════════════════════════════════════════════════════════════════════════
-- BROUILLON — NON VALIDÉ MÉTIER. NE PAS câbler dans config.toml [db.seed].
-- ═══════════════════════════════════════════════════════════════════════════
-- Les 4 offres et leurs tarifs sont décrits comme « expérimentaux » dans le
-- cahier des charges. `fondateur_annuel = 10000` et la limite de 20 fiches
-- gratuites NE SONT PAS confirmés. Tant que la validation métier explicite
-- n'a pas eu lieu :
--   • `supabase db reset` laisse public.subscription_plans VIDE ;
--   • ce fichier ne sert qu'à des essais manuels en local :
--       psql "$LOCAL_DSN" -f supabase/seeds/draft_subscription_plans.sql
--   • toutes les lignes sont insérées avec is_active = false.
-- Phase 14 (abonnement) réintroduira des offres validées via une migration.

insert into public.subscription_plans (code, label, period, price_fcfa, trial_fiche_limit, is_active, sort_order) values
  ('decouverte',            '[BROUILLON] Découverte',            'trial',     0,     20,   false, 0),
  ('fondateur_mensuel',     '[BROUILLON] Fondateur mensuel',     'monthly',   1000,  null, false, 1),
  ('fondateur_trimestriel', '[BROUILLON] Fondateur trimestriel', 'quarterly', 2500,  null, false, 2),
  ('fondateur_annuel',      '[BROUILLON] Fondateur annuel',      'yearly',    10000, null, false, 3)
on conflict (code) do nothing;
