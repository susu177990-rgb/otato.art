with grok_video_model as (
  select
    coalesce(video_workspace, '{}'::jsonb) as video_workspace,
    coalesce(video_workspace #> '{models,grok-imagine}', '{}'::jsonb) as model_config
  from public.site_settings
  where id = 'global'
),
patched_model as (
  select jsonb_build_object(
    'grok-imagine',
    model_config
      || jsonb_build_object(
        'apiModelNameByMode',
        coalesce(model_config -> 'apiModelNameByMode', '{}'::jsonb)
          - 'start_frame'
          - 'multi_image_reference'
          || jsonb_build_object(
            'start_frame', 'grok-imagine/i2v',
            'multi_image_reference', 'grok-imagine/i2v'
          )
      )
  ) as models_patch
  from grok_video_model
)
update public.site_settings
set video_workspace =
  jsonb_set(
    coalesce(video_workspace, '{}'::jsonb),
    '{models}',
    coalesce(video_workspace -> 'models', '{}'::jsonb) || (select models_patch from patched_model),
    true
  ),
  updated_at = now()
where id = 'global';

with grok_costs(resolution, cost_fen_per_second, sale_credits_per_second, metadata) as (
  values
    (
      '480p',
      50::bigint,
      100::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14.5,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing","runtimeModel":"grok-imagine/i2v"}'::jsonb
    ),
    (
      '720p',
      96::bigint,
      192::numeric,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing","runtimeModel":"grok-imagine/i2v"}'::jsonb
    )
),
supported_modes(mode_id) as (
  values ('start_frame'), ('multi_image_reference')
)
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select
  'grok-imagine',
  supported_modes.mode_id,
  grok_costs.resolution,
  grok_costs.sale_credits_per_second,
  0,
  true,
  '{"seed":true}'::jsonb || grok_costs.metadata
from grok_costs
cross join supported_modes
on conflict (model_id, mode_id, resolution)
do update set
  credits_per_second = excluded.credits_per_second,
  minimum_credits = excluded.minimum_credits,
  enabled = true,
  metadata = coalesce(public.video_credit_prices.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

update public.provider_cost_prices
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"grok_i2v_replaced_preview_model"}'::jsonb,
    updated_at = now()
where feature = 'video'
  and provider = 'crun'
  and model_id = 'grok-imagine'
  and mode_id = 'start_frame'
  and unit = 'second'
  and enabled = true;

with grok_costs(resolution, cost_fen_per_second, metadata) as (
  values
    (
      '480p',
      50::bigint,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14.5,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing","runtimeModel":"grok-imagine/i2v"}'::jsonb
    ),
    (
      '720p',
      96::bigint,
      '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28,"sourceUnit":"second","sourceUrl":"https://crun.ai/pricing","runtimeModel":"grok-imagine/i2v"}'::jsonb
    )
),
supported_modes(mode_id) as (
  values ('start_frame'), ('multi_image_reference')
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
cross join supported_modes;
