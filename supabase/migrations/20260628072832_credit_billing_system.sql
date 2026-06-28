-- Credit billing system: wallet accounts, immutable ledger, reservations,
-- Stripe orders, pricing matrices, and admin/operator surfaces.

create schema if not exists private;

create table if not exists public.credit_accounts (
  account_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  available_credits bigint not null default 0,
  reserved_credits bigint not null default 0,
  lifetime_purchased_credits bigint not null default 0,
  lifetime_bonus_credits bigint not null default 0,
  lifetime_spent_credits bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_accounts_user_unique unique (user_id),
  constraint credit_accounts_available_nonnegative check (available_credits >= 0),
  constraint credit_accounts_reserved_nonnegative check (reserved_credits >= 0),
  constraint credit_accounts_lifetime_purchased_nonnegative check (lifetime_purchased_credits >= 0),
  constraint credit_accounts_lifetime_bonus_nonnegative check (lifetime_bonus_credits >= 0),
  constraint credit_accounts_lifetime_spent_nonnegative check (lifetime_spent_credits >= 0)
);

create table if not exists public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(account_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null,
  amount_credits bigint not null,
  available_delta_credits bigint not null,
  reserved_delta_credits bigint not null,
  available_balance_after bigint not null,
  reserved_balance_after bigint not null,
  total_balance_after bigint not null,
  related_reservation_id uuid null,
  related_order_id uuid null,
  related_generation_id text null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credit_ledger_entries_idempotency_unique unique (idempotency_key),
  constraint credit_ledger_entries_entry_type_check check (
    entry_type in (
      'purchase_granted',
      'admin_adjustment',
      'bonus_granted',
      'welcome_bonus_granted',
      'reservation_created',
      'reservation_released',
      'reservation_captured',
      'refund_marked'
    )
  ),
  constraint credit_ledger_entries_balances_nonnegative check (
    available_balance_after >= 0 and reserved_balance_after >= 0 and total_balance_after >= 0
  )
);

create index if not exists credit_ledger_entries_user_created_idx
  on public.credit_ledger_entries (user_id, created_at desc);

create index if not exists credit_ledger_entries_account_created_idx
  on public.credit_ledger_entries (account_id, created_at desc);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(account_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  reserved_credits bigint not null,
  captured_credits bigint null,
  feature text not null,
  model_id text not null,
  project_id text null references public.projects(id) on delete set null,
  request_id text not null,
  price_snapshot jsonb not null default '{}'::jsonb,
  cost_snapshot jsonb not null default '{}'::jsonb,
  estimated_margin_credits bigint null,
  estimated_margin_percent numeric(8, 2) null,
  metadata jsonb not null default '{}'::jsonb,
  result_ref text null,
  failure_reason text null,
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_reservations_request_unique unique (request_id),
  constraint credit_reservations_status_check check (status in ('pending', 'captured', 'released', 'expired')),
  constraint credit_reservations_reserved_positive check (reserved_credits > 0),
  constraint credit_reservations_captured_valid check (captured_credits is null or captured_credits between 0 and reserved_credits),
  constraint credit_reservations_feature_check check (
    feature in ('image', 'video', 'canvas_image', 'canvas_video', 'chat')
  )
);

create index if not exists credit_reservations_user_created_idx
  on public.credit_reservations (user_id, created_at desc);

create index if not exists credit_reservations_status_expires_idx
  on public.credit_reservations (status, expires_at);

create table if not exists public.credit_packages (
  id text primary key,
  label text not null,
  currency text not null default 'usd',
  amount_cents integer not null,
  credits bigint not null,
  bonus_credits bigint not null default 0,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_packages_id_not_blank check (length(trim(id)) > 0),
  constraint credit_packages_label_not_blank check (length(trim(label)) > 0),
  constraint credit_packages_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint credit_packages_amount_positive check (amount_cents > 0),
  constraint credit_packages_credits_positive check (credits > 0),
  constraint credit_packages_bonus_nonnegative check (bonus_credits >= 0)
);

create table if not exists public.credit_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.credit_accounts(account_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text null references public.credit_packages(id) on delete set null,
  provider text not null default 'stripe',
  provider_order_id text null,
  status text not null default 'pending',
  currency text not null,
  amount_cents integer not null,
  credits bigint not null,
  bonus_credits bigint not null default 0,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null,
  constraint credit_orders_provider_order_unique unique (provider, provider_order_id),
  constraint credit_orders_idempotency_unique unique (idempotency_key),
  constraint credit_orders_provider_check check (provider in ('stripe', 'manual')),
  constraint credit_orders_status_check check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded', 'refund_review')),
  constraint credit_orders_amount_positive check (amount_cents > 0),
  constraint credit_orders_credits_positive check (credits > 0),
  constraint credit_orders_bonus_nonnegative check (bonus_credits >= 0)
);

create index if not exists credit_orders_user_created_idx
  on public.credit_orders (user_id, created_at desc);

create table if not exists public.image_credit_prices (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  size_tier text not null,
  gpt_quality text null,
  credits bigint not null,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image_credit_prices_model_check check (
    model_id in ('gpt-image-2', 'nano-banana-2', 'nano-banana-pro', 'grok-imagine-i2i', 'z-image')
  ),
  constraint image_credit_prices_size_check check (size_tier in ('1K', '2K', '4K')),
  constraint image_credit_prices_quality_check check (
    (model_id = 'gpt-image-2' and gpt_quality in ('low', 'medium', 'high'))
    or (model_id <> 'gpt-image-2' and gpt_quality is null)
  ),
  constraint image_credit_prices_credits_positive check (credits > 0)
);

create unique index if not exists image_credit_prices_gpt_unique
  on public.image_credit_prices (model_id, size_tier, gpt_quality)
  where gpt_quality is not null;

create unique index if not exists image_credit_prices_non_gpt_unique
  on public.image_credit_prices (model_id, size_tier)
  where gpt_quality is null;

create table if not exists public.video_credit_prices (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  mode_id text not null,
  resolution text not null,
  credits_per_second bigint not null,
  minimum_credits bigint not null default 0,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_credit_prices_unique unique (model_id, mode_id, resolution),
  constraint video_credit_prices_model_check check (
    model_id in (
      'seedance-2.0',
      'seedance-2.0-fast',
      'seedance-2.0-mini',
      'seedance-1.5-pro',
      'doubao-seedance-1.0-pro-fast',
      'seedance-1.0-pro',
      'kling-3.0',
      'kling-2.6-motion',
      'happyhorse-1.1',
      'happyhorse-1.0',
      'grok-imagine',
      'veo-3.1',
      'veo-3.1-fast'
    )
  ),
  constraint video_credit_prices_mode_check check (
    mode_id in ('text_to_video', 'start_frame', 'start_end_frame', 'multi_image_reference', 'video_edit', 'motion_control')
  ),
  constraint video_credit_prices_resolution_check check (resolution in ('480p', '720p', '1080p', '4k')),
  constraint video_credit_prices_credits_positive check (credits_per_second > 0),
  constraint video_credit_prices_minimum_nonnegative check (minimum_credits >= 0)
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  status text not null default 'processed',
  event_payload jsonb not null default '{}'::jsonb,
  error_message text null,
  processed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint payment_webhook_events_status_check check (status in ('received', 'processed', 'failed')),
  constraint payment_webhook_events_unique unique (provider, event_id)
);

create table if not exists public.provider_cost_prices (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  provider text not null,
  model_id text not null,
  mode_id text null,
  resolution text null,
  size_tier text null,
  gpt_quality text null,
  cost_currency text not null default 'usd',
  cost_per_unit_minor integer not null,
  unit text not null,
  source text not null default 'manual',
  enabled boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_cost_prices_feature_check check (feature in ('image', 'video')),
  constraint provider_cost_prices_currency_check check (cost_currency ~ '^[a-z]{3}$'),
  constraint provider_cost_prices_cost_nonnegative check (cost_per_unit_minor >= 0),
  constraint provider_cost_prices_unit_check check (unit in ('image', 'second')),
  constraint provider_cost_prices_source_check check (source in ('manual', 'invoice', 'estimated')),
  constraint provider_cost_prices_quality_check check (gpt_quality is null or gpt_quality in ('low', 'medium', 'high')),
  constraint provider_cost_prices_shape_check check (
    (feature = 'image' and unit = 'image' and size_tier in ('1K', '2K', '4K') and mode_id is null and resolution is null)
    or
    (feature = 'video' and unit = 'second' and mode_id is not null and resolution in ('480p', '720p', '1080p', '4k') and size_tier is null and gpt_quality is null)
  )
);

create index if not exists provider_cost_prices_lookup_idx
  on public.provider_cost_prices (feature, model_id, mode_id, resolution, size_tier, gpt_quality, enabled, effective_from desc);

create unique index if not exists provider_cost_prices_identity_unique
  on public.provider_cost_prices (
    feature,
    model_id,
    coalesce(mode_id, ''),
    coalesce(resolution, ''),
    coalesce(size_tier, ''),
    coalesce(gpt_quality, ''),
    unit,
    effective_from
  );

create table if not exists public.credit_risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  account_id uuid null references public.credit_accounts(account_id) on delete set null,
  order_id uuid null references public.credit_orders(id) on delete set null,
  reservation_id uuid null references public.credit_reservations(id) on delete set null,
  risk_type text not null,
  status text not null default 'open',
  severity text not null default 'medium',
  amount_cents integer null,
  currency text null,
  credits bigint null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  constraint credit_risk_events_status_check check (status in ('open', 'resolved', 'bad_debt', 'ignored')),
  constraint credit_risk_events_severity_check check (severity in ('low', 'medium', 'high', 'critical'))
);

create index if not exists credit_risk_events_status_created_idx
  on public.credit_risk_events (status, created_at desc);

create table if not exists public.credit_account_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.credit_accounts(account_id) on delete cascade,
  flag_type text not null,
  status text not null default 'active',
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  constraint credit_account_flags_type_check check (flag_type in ('generation_hold', 'billing_hold', 'refund_hold')),
  constraint credit_account_flags_status_check check (status in ('active', 'resolved'))
);

create index if not exists credit_account_flags_user_status_idx
  on public.credit_account_flags (user_id, status, flag_type);

create table if not exists public.credit_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.credit_packages (id, label, currency, amount_cents, credits, bonus_credits, enabled, sort_order, metadata)
values
  ('starter', 'Starter', 'usd', 999, 10000, 0, true, 10, '{"recommended":false}'::jsonb),
  ('creator', 'Creator', 'usd', 2999, 30000, 3000, true, 20, '{"recommended":true}'::jsonb),
  ('studio', 'Studio', 'usd', 9999, 100000, 20000, true, 30, '{"recommended":false}'::jsonb),
  ('pro', 'Pro', 'usd', 29999, 300000, 90000, true, 40, '{"recommended":false}'::jsonb)
on conflict (id) do nothing;

insert into public.image_credit_prices (model_id, size_tier, gpt_quality, credits, enabled, metadata)
values
  ('z-image', '1K', null, 40, true, '{"seed":true}'::jsonb),
  ('z-image', '2K', null, 75, true, '{"seed":true}'::jsonb),
  ('z-image', '4K', null, 150, true, '{"seed":true}'::jsonb),
  ('nano-banana-2', '1K', null, 60, true, '{"seed":true}'::jsonb),
  ('nano-banana-2', '2K', null, 110, true, '{"seed":true}'::jsonb),
  ('nano-banana-2', '4K', null, 220, true, '{"seed":true}'::jsonb),
  ('grok-imagine-i2i', '1K', null, 90, true, '{"seed":true}'::jsonb),
  ('grok-imagine-i2i', '2K', null, 170, true, '{"seed":true}'::jsonb),
  ('grok-imagine-i2i', '4K', null, 340, true, '{"seed":true}'::jsonb),
  ('nano-banana-pro', '1K', null, 100, true, '{"seed":true}'::jsonb),
  ('nano-banana-pro', '2K', null, 190, true, '{"seed":true}'::jsonb),
  ('nano-banana-pro', '4K', null, 380, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '1K', 'low', 80, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '2K', 'low', 140, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '4K', 'low', 260, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '1K', 'medium', 120, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '2K', 'medium', 220, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '4K', 'medium', 420, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '1K', 'high', 180, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '2K', 'high', 340, true, '{"seed":true}'::jsonb),
  ('gpt-image-2', '4K', 'high', 680, true, '{"seed":true}'::jsonb)
on conflict do nothing;

with
  base(model_id, resolution, base_credits) as (
    values
      ('seedance-2.0-mini', '480p', 45::numeric),
      ('seedance-2.0-mini', '720p', 70::numeric),
      ('seedance-2.0-fast', '480p', 60::numeric),
      ('seedance-2.0-fast', '720p', 90::numeric),
      ('doubao-seedance-1.0-pro-fast', '480p', 40::numeric),
      ('doubao-seedance-1.0-pro-fast', '720p', 70::numeric),
      ('doubao-seedance-1.0-pro-fast', '1080p', 110::numeric),
      ('seedance-1.0-pro', '480p', 55::numeric),
      ('seedance-1.0-pro', '720p', 85::numeric),
      ('seedance-1.0-pro', '1080p', 130::numeric),
      ('seedance-2.0', '480p', 70::numeric),
      ('seedance-2.0', '720p', 110::numeric),
      ('seedance-2.0', '1080p', 170::numeric),
      ('seedance-1.5-pro', '480p', 80::numeric),
      ('seedance-1.5-pro', '720p', 130::numeric),
      ('seedance-1.5-pro', '1080p', 200::numeric),
      ('grok-imagine', '480p', 50::numeric),
      ('grok-imagine', '720p', 80::numeric),
      ('happyhorse-1.0', '720p', 70::numeric),
      ('happyhorse-1.0', '1080p', 110::numeric),
      ('happyhorse-1.1', '720p', 90::numeric),
      ('happyhorse-1.1', '1080p', 140::numeric),
      ('kling-3.0', '720p', 150::numeric),
      ('kling-3.0', '1080p', 230::numeric),
      ('kling-2.6-motion', '720p', 180::numeric),
      ('kling-2.6-motion', '1080p', 280::numeric),
      ('veo-3.1-fast', '720p', 200::numeric),
      ('veo-3.1-fast', '1080p', 320::numeric),
      ('veo-3.1-fast', '4k', 650::numeric),
      ('veo-3.1', '720p', 320::numeric),
      ('veo-3.1', '1080p', 520::numeric),
      ('veo-3.1', '4k', 980::numeric)
  ),
  capabilities(model_id, modes, resolutions) as (
    values
      ('seedance-2.0', array['text_to_video','start_frame','start_end_frame','multi_image_reference']::text[], array['480p','720p','1080p']::text[]),
      ('seedance-2.0-fast', array['text_to_video','start_frame','start_end_frame','multi_image_reference']::text[], array['480p','720p']::text[]),
      ('seedance-2.0-mini', array['text_to_video','start_frame','start_end_frame','multi_image_reference']::text[], array['480p','720p']::text[]),
      ('seedance-1.5-pro', array['text_to_video','start_frame','start_end_frame']::text[], array['480p','720p','1080p']::text[]),
      ('doubao-seedance-1.0-pro-fast', array['text_to_video','start_frame']::text[], array['480p','720p','1080p']::text[]),
      ('seedance-1.0-pro', array['text_to_video','start_frame']::text[], array['480p','720p','1080p']::text[]),
      ('kling-3.0', array['text_to_video','start_frame','start_end_frame','multi_image_reference','video_edit']::text[], array['720p','1080p']::text[]),
      ('kling-2.6-motion', array['motion_control']::text[], array['720p','1080p']::text[]),
      ('happyhorse-1.1', array['text_to_video','start_frame','multi_image_reference']::text[], array['720p','1080p']::text[]),
      ('happyhorse-1.0', array['text_to_video','start_frame','multi_image_reference','video_edit']::text[], array['720p','1080p']::text[]),
      ('grok-imagine', array['text_to_video','start_frame']::text[], array['480p','720p']::text[]),
      ('veo-3.1', array['text_to_video','start_frame','start_end_frame','multi_image_reference']::text[], array['720p','1080p','4k']::text[]),
      ('veo-3.1-fast', array['text_to_video','start_frame','start_end_frame','multi_image_reference']::text[], array['720p','1080p','4k']::text[])
  ),
  supported as (
    select c.model_id, mode_id, resolution
    from capabilities c
    cross join unnest(c.modes) as mode_id
    cross join unnest(c.resolutions) as resolution
  )
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select
  supported.model_id,
  supported.mode_id,
  supported.resolution,
  (ceil(base.base_credits / 5)::bigint * 5) as credits_per_second,
  0,
  true,
  '{"seed":true}'::jsonb
from supported
join base on base.model_id = supported.model_id and base.resolution = supported.resolution
on conflict (model_id, mode_id, resolution) do nothing;

alter table public.credit_accounts enable row level security;
alter table public.credit_ledger_entries enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_orders enable row level security;
alter table public.credit_packages enable row level security;
alter table public.image_credit_prices enable row level security;
alter table public.video_credit_prices enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.provider_cost_prices enable row level security;
alter table public.credit_risk_events enable row level security;
alter table public.credit_account_flags enable row level security;
alter table public.credit_maintenance_runs enable row level security;

drop policy if exists credit_accounts_read_own on public.credit_accounts;
create policy credit_accounts_read_own on public.credit_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists credit_ledger_entries_read_own on public.credit_ledger_entries;
create policy credit_ledger_entries_read_own on public.credit_ledger_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists credit_reservations_read_own on public.credit_reservations;
create policy credit_reservations_read_own on public.credit_reservations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists credit_orders_read_own on public.credit_orders;
create policy credit_orders_read_own on public.credit_orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists credit_packages_read_enabled on public.credit_packages;
create policy credit_packages_read_enabled on public.credit_packages
  for select
  to authenticated
  using (enabled);

drop policy if exists image_credit_prices_read_admin on public.image_credit_prices;
create policy image_credit_prices_read_admin on public.image_credit_prices
  for select
  to authenticated
  using (private.is_site_admin());

drop policy if exists video_credit_prices_read_admin on public.video_credit_prices;
create policy video_credit_prices_read_admin on public.video_credit_prices
  for select
  to authenticated
  using (private.is_site_admin());

drop policy if exists payment_webhook_events_no_access on public.payment_webhook_events;
create policy payment_webhook_events_no_access on public.payment_webhook_events
  for select
  to authenticated
  using (false);

drop policy if exists provider_cost_prices_read_admin on public.provider_cost_prices;
create policy provider_cost_prices_read_admin on public.provider_cost_prices
  for select
  to authenticated
  using (private.is_site_admin());

drop policy if exists credit_risk_events_read_admin on public.credit_risk_events;
create policy credit_risk_events_read_admin on public.credit_risk_events
  for select
  to authenticated
  using (private.is_site_admin());

drop policy if exists credit_account_flags_read_admin on public.credit_account_flags;
create policy credit_account_flags_read_admin on public.credit_account_flags
  for select
  to authenticated
  using (private.is_site_admin());

drop policy if exists credit_maintenance_runs_read_admin on public.credit_maintenance_runs;
create policy credit_maintenance_runs_read_admin on public.credit_maintenance_runs
  for select
  to authenticated
  using (private.is_site_admin());

grant select on public.credit_accounts to authenticated;
grant select on public.credit_ledger_entries to authenticated;
grant select on public.credit_reservations to authenticated;
grant select on public.credit_orders to authenticated;
grant select on public.credit_packages to authenticated;
grant select on public.image_credit_prices to authenticated;
grant select on public.video_credit_prices to authenticated;
grant select on public.payment_webhook_events to authenticated;
grant select on public.provider_cost_prices to authenticated;
grant select on public.credit_risk_events to authenticated;
grant select on public.credit_account_flags to authenticated;
grant select on public.credit_maintenance_runs to authenticated;

grant all on public.credit_accounts to service_role;
grant all on public.credit_ledger_entries to service_role;
grant all on public.credit_reservations to service_role;
grant all on public.credit_orders to service_role;
grant all on public.credit_packages to service_role;
grant all on public.image_credit_prices to service_role;
grant all on public.video_credit_prices to service_role;
grant all on public.payment_webhook_events to service_role;
grant all on public.provider_cost_prices to service_role;
grant all on public.credit_risk_events to service_role;
grant all on public.credit_account_flags to service_role;
grant all on public.credit_maintenance_runs to service_role;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists credit_accounts_touch_updated_at on public.credit_accounts;
create trigger credit_accounts_touch_updated_at
  before update on public.credit_accounts
  for each row execute function private.touch_updated_at();

drop trigger if exists credit_reservations_touch_updated_at on public.credit_reservations;
create trigger credit_reservations_touch_updated_at
  before update on public.credit_reservations
  for each row execute function private.touch_updated_at();

drop trigger if exists credit_orders_touch_updated_at on public.credit_orders;
create trigger credit_orders_touch_updated_at
  before update on public.credit_orders
  for each row execute function private.touch_updated_at();

drop trigger if exists credit_packages_touch_updated_at on public.credit_packages;
create trigger credit_packages_touch_updated_at
  before update on public.credit_packages
  for each row execute function private.touch_updated_at();

drop trigger if exists image_credit_prices_touch_updated_at on public.image_credit_prices;
create trigger image_credit_prices_touch_updated_at
  before update on public.image_credit_prices
  for each row execute function private.touch_updated_at();

drop trigger if exists video_credit_prices_touch_updated_at on public.video_credit_prices;
create trigger video_credit_prices_touch_updated_at
  before update on public.video_credit_prices
  for each row execute function private.touch_updated_at();

drop trigger if exists provider_cost_prices_touch_updated_at on public.provider_cost_prices;
create trigger provider_cost_prices_touch_updated_at
  before update on public.provider_cost_prices
  for each row execute function private.touch_updated_at();

create or replace function private.prevent_credit_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit ledger entries are immutable';
end;
$$;

drop trigger if exists credit_ledger_entries_no_update on public.credit_ledger_entries;
create trigger credit_ledger_entries_no_update
  before update on public.credit_ledger_entries
  for each row execute function private.prevent_credit_ledger_mutation();

drop trigger if exists credit_ledger_entries_no_delete on public.credit_ledger_entries;
create trigger credit_ledger_entries_no_delete
  before delete on public.credit_ledger_entries
  for each row execute function private.prevent_credit_ledger_mutation();

create or replace function public.ensure_credit_account(p_user_id uuid)
returns public.credit_accounts
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  insert into public.credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do update
    set updated_at = public.credit_accounts.updated_at
  returning * into v_account;

  return v_account;
end;
$$;

create or replace function public.reserve_credits(
  p_account_id uuid,
  p_request_id text,
  p_amount bigint,
  p_feature text,
  p_model_id text,
  p_project_id text,
  p_price_snapshot jsonb default '{}'::jsonb,
  p_cost_snapshot jsonb default '{}'::jsonb,
  p_estimated_margin_credits bigint default null,
  p_estimated_margin_percent numeric default null,
  p_metadata jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns public.credit_reservations
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_reservation public.credit_reservations;
begin
  if p_account_id is null or length(trim(coalesce(p_request_id, ''))) = 0 then
    raise exception 'account_id and request_id are required';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_reservation
  from public.credit_reservations
  where request_id = p_request_id;
  if found then
    return v_reservation;
  end if;

  select * into v_account
  from public.credit_accounts
  where account_id = p_account_id
  for update;
  if not found then
    raise exception 'credit account not found';
  end if;
  if v_account.available_credits < p_amount then
    raise exception 'insufficient credits';
  end if;

  update public.credit_accounts
  set
    available_credits = available_credits - p_amount,
    reserved_credits = reserved_credits + p_amount
  where account_id = p_account_id
  returning * into v_account;

  insert into public.credit_reservations (
    account_id,
    user_id,
    reserved_credits,
    feature,
    model_id,
    project_id,
    request_id,
    price_snapshot,
    cost_snapshot,
    estimated_margin_credits,
    estimated_margin_percent,
    metadata,
    expires_at
  )
  values (
    p_account_id,
    v_account.user_id,
    p_amount,
    p_feature,
    p_model_id,
    p_project_id,
    p_request_id,
    coalesce(p_price_snapshot, '{}'::jsonb),
    coalesce(p_cost_snapshot, '{}'::jsonb),
    p_estimated_margin_credits,
    p_estimated_margin_percent,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_expires_at, now() + interval '45 minutes')
  )
  returning * into v_reservation;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    related_reservation_id,
    related_generation_id,
    idempotency_key,
    metadata
  )
  values (
    p_account_id,
    v_account.user_id,
    'reservation_created',
    0,
    -p_amount,
    p_amount,
    v_account.available_credits,
    v_account.reserved_credits,
    v_account.available_credits + v_account.reserved_credits,
    v_reservation.id,
    p_request_id,
    'reserve:' || p_request_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'priceSnapshot', coalesce(p_price_snapshot, '{}'::jsonb),
      'costSnapshot', coalesce(p_cost_snapshot, '{}'::jsonb),
      'estimatedMarginCredits', p_estimated_margin_credits,
      'estimatedMarginPercent', p_estimated_margin_percent
    )
  );

  return v_reservation;
end;
$$;

create or replace function public.capture_credit_reservation(
  p_reservation_id uuid,
  p_result_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_reservations
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_reservation public.credit_reservations;
  v_amount bigint;
begin
  select * into v_reservation
  from public.credit_reservations
  where id = p_reservation_id
  for update;
  if not found then
    raise exception 'credit reservation not found';
  end if;
  if v_reservation.status <> 'pending' then
    return v_reservation;
  end if;

  v_amount := v_reservation.reserved_credits;

  select * into v_account
  from public.credit_accounts
  where account_id = v_reservation.account_id
  for update;

  update public.credit_accounts
  set
    reserved_credits = reserved_credits - v_amount,
    lifetime_spent_credits = lifetime_spent_credits + v_amount
  where account_id = v_reservation.account_id
  returning * into v_account;

  update public.credit_reservations
  set
    status = 'captured',
    captured_credits = v_amount,
    result_ref = p_result_ref,
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
  where id = v_reservation.id
  returning * into v_reservation;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    related_reservation_id,
    related_generation_id,
    idempotency_key,
    metadata
  )
  values (
    v_reservation.account_id,
    v_reservation.user_id,
    'reservation_captured',
    -v_amount,
    0,
    -v_amount,
    v_account.available_credits,
    v_account.reserved_credits,
    v_account.available_credits + v_account.reserved_credits,
    v_reservation.id,
    v_reservation.request_id,
    'capture:' || v_reservation.id::text,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('resultRef', p_result_ref)
  )
  on conflict (idempotency_key) do nothing;

  return v_reservation;
end;
$$;

create or replace function public.release_credit_reservation(
  p_reservation_id uuid,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_reservations
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_reservation public.credit_reservations;
  v_amount bigint;
begin
  select * into v_reservation
  from public.credit_reservations
  where id = p_reservation_id
  for update;
  if not found then
    raise exception 'credit reservation not found';
  end if;
  if v_reservation.status <> 'pending' then
    return v_reservation;
  end if;

  v_amount := v_reservation.reserved_credits;

  select * into v_account
  from public.credit_accounts
  where account_id = v_reservation.account_id
  for update;

  update public.credit_accounts
  set
    available_credits = available_credits + v_amount,
    reserved_credits = reserved_credits - v_amount
  where account_id = v_reservation.account_id
  returning * into v_account;

  update public.credit_reservations
  set
    status = case when expires_at <= now() then 'expired' else 'released' end,
    failure_reason = p_reason,
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
  where id = v_reservation.id
  returning * into v_reservation;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    related_reservation_id,
    related_generation_id,
    idempotency_key,
    metadata
  )
  values (
    v_reservation.account_id,
    v_reservation.user_id,
    'reservation_released',
    0,
    v_amount,
    -v_amount,
    v_account.available_credits,
    v_account.reserved_credits,
    v_account.available_credits + v_account.reserved_credits,
    v_reservation.id,
    v_reservation.request_id,
    'release:' || v_reservation.id::text,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  )
  on conflict (idempotency_key) do nothing;

  return v_reservation;
end;
$$;

create or replace function public.grant_order_credits(
  p_order_id uuid,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_orders
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_order public.credit_orders;
  v_total bigint;
begin
  if length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    raise exception 'idempotency key is required';
  end if;

  select * into v_order
  from public.credit_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'credit order not found';
  end if;
  if v_order.status = 'paid' then
    return v_order;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'credit order is not payable';
  end if;

  v_total := v_order.credits + v_order.bonus_credits;

  select * into v_account
  from public.credit_accounts
  where account_id = v_order.account_id
  for update;

  update public.credit_accounts
  set
    available_credits = available_credits + v_total,
    lifetime_purchased_credits = lifetime_purchased_credits + v_order.credits,
    lifetime_bonus_credits = lifetime_bonus_credits + v_order.bonus_credits
  where account_id = v_order.account_id
  returning * into v_account;

  update public.credit_orders
  set
    status = 'paid',
    paid_at = now(),
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
  where id = v_order.id
  returning * into v_order;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    related_order_id,
    idempotency_key,
    metadata
  )
  values (
    v_order.account_id,
    v_order.user_id,
    'purchase_granted',
    v_total,
    v_total,
    0,
    v_account.available_credits,
    v_account.reserved_credits,
    v_account.available_credits + v_account.reserved_credits,
    v_order.id,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'credits', v_order.credits,
      'bonusCredits', v_order.bonus_credits
    )
  )
  on conflict (idempotency_key) do nothing;

  return v_order;
end;
$$;

create or replace function public.admin_adjust_credits(
  p_target_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_ledger_entries
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_entry public.credit_ledger_entries;
  v_reason text;
  v_idempotency text;
begin
  v_reason := trim(coalesce(p_reason, ''));
  if p_target_user_id is null or p_amount = 0 or length(v_reason) = 0 then
    raise exception 'target user, non-zero amount, and reason are required';
  end if;

  select * into v_account
  from public.ensure_credit_account(p_target_user_id);

  select * into v_account
  from public.credit_accounts
  where account_id = v_account.account_id
  for update;

  if p_amount < 0 and v_account.available_credits < abs(p_amount) then
    raise exception 'insufficient credits for adjustment';
  end if;

  update public.credit_accounts
  set
    available_credits = available_credits + p_amount,
    lifetime_bonus_credits = case when p_amount > 0 then lifetime_bonus_credits + p_amount else lifetime_bonus_credits end
  where account_id = v_account.account_id
  returning * into v_account;

  v_idempotency := 'admin_adjust:' || gen_random_uuid()::text;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    idempotency_key,
    metadata
  )
  values (
    v_account.account_id,
    v_account.user_id,
    'admin_adjustment',
    p_amount,
    p_amount,
    0,
    v_account.available_credits,
    v_account.reserved_credits,
    v_account.available_credits + v_account.reserved_credits,
    v_idempotency,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', v_reason)
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.grant_welcome_credits(
  p_target_user_id uuid,
  p_amount bigint default 300,
  p_reason text default 'welcome credits'
)
returns public.credit_ledger_entries
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account public.credit_accounts;
  v_entry public.credit_ledger_entries;
  v_idempotency text;
begin
  if p_target_user_id is null or p_amount <= 0 then
    raise exception 'target user and positive amount are required';
  end if;

  select * into v_account
  from public.ensure_credit_account(p_target_user_id);

  select * into v_account
  from public.credit_accounts
  where account_id = v_account.account_id
  for update;

  v_idempotency := 'welcome:' || p_target_user_id::text;

  insert into public.credit_ledger_entries (
    account_id,
    user_id,
    entry_type,
    amount_credits,
    available_delta_credits,
    reserved_delta_credits,
    available_balance_after,
    reserved_balance_after,
    total_balance_after,
    idempotency_key,
    metadata
  )
  values (
    v_account.account_id,
    v_account.user_id,
    'welcome_bonus_granted',
    p_amount,
    p_amount,
    0,
    v_account.available_credits + p_amount,
    v_account.reserved_credits,
    v_account.available_credits + p_amount + v_account.reserved_credits,
    v_idempotency,
    jsonb_build_object('reason', p_reason)
  )
  on conflict (idempotency_key) do nothing
  returning * into v_entry;

  if v_entry.id is null then
    select * into v_entry
    from public.credit_ledger_entries
    where idempotency_key = v_idempotency;
    return v_entry;
  end if;

  update public.credit_accounts
  set
    available_credits = available_credits + p_amount,
    lifetime_bonus_credits = lifetime_bonus_credits + p_amount
  where account_id = v_account.account_id;

  return v_entry;
end;
$$;

revoke all on function public.ensure_credit_account(uuid) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, text, bigint, text, text, text, jsonb, jsonb, bigint, numeric, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.capture_credit_reservation(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_credit_reservation(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.grant_order_credits(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_adjust_credits(uuid, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.grant_welcome_credits(uuid, bigint, text) from public, anon, authenticated;

grant execute on function public.ensure_credit_account(uuid) to service_role;
grant execute on function public.reserve_credits(uuid, text, bigint, text, text, text, jsonb, jsonb, bigint, numeric, jsonb, timestamptz) to service_role;
grant execute on function public.capture_credit_reservation(uuid, text, jsonb) to service_role;
grant execute on function public.release_credit_reservation(uuid, text, jsonb) to service_role;
grant execute on function public.grant_order_credits(uuid, text, jsonb) to service_role;
grant execute on function public.admin_adjust_credits(uuid, bigint, text, jsonb) to service_role;
grant execute on function public.grant_welcome_credits(uuid, bigint, text) to service_role;
