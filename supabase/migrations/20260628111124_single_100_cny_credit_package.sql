-- Keep a single user-facing recharge package:
-- CNY 100.00 pays 10,000 base credits and grants 1,000 bonus credits.

insert into public.credit_packages (id, label, currency, amount_cents, credits, bonus_credits, enabled, sort_order, metadata)
values (
  'studio',
  '100 元充值包',
  'cny',
  10000,
  10000,
  1000,
  true,
  10,
  '{"recommended":true,"creditValue":"1_credit_1_cny_fen"}'::jsonb
)
on conflict (id) do update set
  label = excluded.label,
  currency = excluded.currency,
  amount_cents = excluded.amount_cents,
  credits = excluded.credits,
  bonus_credits = excluded.bonus_credits,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata;

update public.credit_packages
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"retiredBy":"single_100_cny_credit_package"}'::jsonb
where id in ('starter', 'creator', 'pro');
