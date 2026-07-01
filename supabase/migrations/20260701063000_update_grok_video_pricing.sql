with grok_costs(resolution, crun_credits, cost_fen_per_second, sale_credits_per_second, metadata) as (
  values
    (
      '480p',
      14.5::numeric,
      50::bigint,
      100::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14.5,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing"}'::jsonb
    ),
    (
      '720p',
      28::numeric,
      96::bigint,
      192::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing"}'::jsonb
    )
),
supported_modes(mode_id) as (
  values ('text_to_video'), ('start_frame')
)
update public.video_credit_prices prices
set credits_per_second = grok_costs.sale_credits_per_second,
    metadata = coalesce(prices.metadata, '{}'::jsonb) || grok_costs.metadata,
    updated_at = now()
from grok_costs
where prices.model_id = 'grok-imagine'
  and prices.resolution = grok_costs.resolution
  and prices.mode_id in (select mode_id from supported_modes);

with grok_costs(resolution, crun_credits, cost_fen_per_second, sale_credits_per_second, metadata) as (
  values
    (
      '480p',
      14.5::numeric,
      50::bigint,
      100::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14.5,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing"}'::jsonb
    ),
    (
      '720p',
      28::numeric,
      96::bigint,
      192::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing"}'::jsonb
    )
),
supported_modes(mode_id) as (
  values ('text_to_video'), ('start_frame')
)
insert into public.provider_cost_prices (
  feature,
  provider,
  model_id,
  mode_id,
  resolution,
  size_tier,
  gpt_quality,
  cost_currency,
  cost_per_unit_minor,
  unit,
  source,
  enabled,
  metadata
)
select
  'video',
  'crun',
  'grok-imagine',
  supported_modes.mode_id,
  grok_costs.resolution,
  null,
  null,
  'cny',
  grok_costs.cost_fen_per_second,
  'second',
  'estimated',
  true,
  grok_costs.metadata
from grok_costs
cross join supported_modes
on conflict (feature, model_id, coalesce(mode_id, ''), coalesce(resolution, ''), coalesce(size_tier, ''), coalesce(gpt_quality, ''), unit, effective_from)
do update set
  cost_per_unit_minor = excluded.cost_per_unit_minor,
  metadata = excluded.metadata,
  updated_at = now();

update public.site_settings
set video_workspace =
  jsonb_set(
    coalesce(video_workspace, '{}'::jsonb),
    '{uiDefaults,defaultResolution}',
    '"480p"'::jsonb,
    true
  ),
  updated_at = now()
where id = 'global'
  and coalesce(video_workspace #>> '{uiDefaults,defaultResolution}', '') <> '480p';
