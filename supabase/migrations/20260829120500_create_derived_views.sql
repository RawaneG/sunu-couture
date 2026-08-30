-- create_derived_views
-- Vues dérivées. security_invoker = on : la RLS des tables sous-jacentes
-- s'applique à l'utilisateur qui interroge la vue (pas au créateur). Évite le
-- pattern « SECURITY DEFINER view » signalé par le Security Advisor.

-- ─────────────────────────────────────────────────────────────────────────────
-- fiche_balances — reste = total_price − Σ(versements). Peut être négatif si
-- sur-paiement : le front le signale, ne tronque jamais silencieusement.
-- ─────────────────────────────────────────────────────────────────────────────
create view public.fiche_balances
  with (security_invoker = on) as
select
  f.id                                            as fiche_id,
  f.workshop_id,
  f.total_price,
  coalesce(sum(p.amount), 0)::int                 as total_paid,
  f.total_price - coalesce(sum(p.amount), 0)::int as reste,
  (f.total_price - coalesce(sum(p.amount), 0)::int) <= 0 as is_settled
from public.fiches f
left join public.client_payments p on p.fiche_id = f.id
where f.deleted_at is null
group by f.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- fiches_view — expose is_late DÉRIVÉ (décision D8 : plus jamais stocké).
-- « En retard » ⇔ fiche active, non livrée, date de retrait passée.
-- ─────────────────────────────────────────────────────────────────────────────
create view public.fiches_view
  with (security_invoker = on) as
select
  f.*,
  (
    f.due_date is not null
    and f.state = 'active'
    and f.status <> 'delivered'
    and f.due_date < current_date
  ) as is_late
from public.fiches f
where f.deleted_at is null;
