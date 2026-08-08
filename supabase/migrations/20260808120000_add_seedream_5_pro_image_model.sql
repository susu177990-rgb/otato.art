alter table public.image_credit_prices
  drop constraint if exists image_credit_prices_model_check;

alter table public.image_credit_prices
  add constraint image_credit_prices_model_check check (
    model_id in (
      'gpt-image-2',
      'nano-banana-2',
      'nano-banana-pro',
      'grok-imagine-i2i',
      'seedream-5-pro',
      'z-image'
    )
  );

update public.site_settings
set
  image_workspace =
    coalesce(image_workspace, '{}'::jsonb)
    || jsonb_build_object(
      'models',
      coalesce(image_workspace -> 'models', '{}'::jsonb)
      || jsonb_build_object(
        'seedream-5-pro',
        coalesce(image_workspace #> '{models,seedream-5-pro}', '{}'::jsonb)
        || jsonb_build_object(
          'id', 'seedream-5-pro',
          'label', 'Seedream 5.0 Pro',
          'modelName', 'bytedance/seedream-5-pro',
          'endpointUrl', 'https://api.crun.ai/api/v1/client/job/CreateTask',
          'provider', 'seedream'
        )
      )
    ),
  updated_at = now()
where id = 'global';

with price_seed(size_tier, credits, metadata) as (
  values
    ('1K', 48::bigint, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7,"referenceImageCrunCredits":0.5,"sourceUrl":"https://crun.ai/pricing"}'::jsonb),
    ('2K', 96::bigint, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14,"referenceImageCrunCredits":0.5,"sourceUrl":"https://crun.ai/pricing"}'::jsonb)
),
updated as (
  update public.image_credit_prices prices
  set credits = seed.credits,
      enabled = true,
      metadata = seed.metadata
  from price_seed seed
  where prices.model_id = 'seedream-5-pro'
    and prices.size_tier = seed.size_tier
    and prices.gpt_quality is null
  returning prices.id
)
insert into public.image_credit_prices (model_id, size_tier, gpt_quality, credits, enabled, metadata)
select 'seedream-5-pro', seed.size_tier, null, seed.credits, true, seed.metadata
from price_seed seed
where not exists (
  select 1
  from public.image_credit_prices prices
  where prices.model_id = 'seedream-5-pro'
    and prices.size_tier = seed.size_tier
    and prices.gpt_quality is null
);

with cost_seed(size_tier, cost_fen, metadata) as (
  values
    ('1K', 24, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7,"referenceImageCrunCredits":0.5,"sourceUrl":"https://crun.ai/pricing"}'::jsonb),
    ('2K', 48, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14,"referenceImageCrunCredits":0.5,"sourceUrl":"https://crun.ai/pricing"}'::jsonb)
),
updated as (
  update public.provider_cost_prices costs
  set provider = 'crun',
      cost_currency = 'cny',
      cost_per_unit_minor = seed.cost_fen,
      source = 'estimated',
      enabled = true,
      metadata = seed.metadata
  from cost_seed seed
  where costs.feature = 'image'
    and costs.model_id = 'seedream-5-pro'
    and costs.unit = 'image'
    and costs.mode_id is null
    and costs.resolution is null
    and costs.size_tier = seed.size_tier
    and costs.gpt_quality is null
  returning costs.id
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
  'image',
  'crun',
  'seedream-5-pro',
  null,
  null,
  seed.size_tier,
  null,
  'cny',
  seed.cost_fen,
  'image',
  'estimated',
  true,
  seed.metadata
from cost_seed seed
where not exists (
  select 1
  from public.provider_cost_prices costs
  where costs.feature = 'image'
    and costs.model_id = 'seedream-5-pro'
    and costs.unit = 'image'
    and costs.mode_id is null
    and costs.resolution is null
    and costs.size_tier = seed.size_tier
    and costs.gpt_quality is null
);
