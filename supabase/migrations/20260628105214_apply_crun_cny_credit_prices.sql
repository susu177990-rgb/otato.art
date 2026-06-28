-- Crun $5 plan based CNY pricing.
-- Rules:
-- - 200 Crun credits = 1 USD
-- - 1 USD = CNY 6.80
-- - 1 site credit = CNY 0.01
-- - sale credits must be at least 2x CNY cost fen

with package_seed(id, label, currency, amount_cents, credits, bonus_credits, enabled, sort_order, metadata) as (
  values
    ('starter', 'Starter', 'cny', 1000, 1000, 0, true, 10, '{"recommended":false,"creditValue":"1_credit_1_cny_fen"}'::jsonb),
    ('creator', 'Creator', 'cny', 3000, 3000, 0, true, 20, '{"recommended":true,"creditValue":"1_credit_1_cny_fen"}'::jsonb),
    ('studio', 'Studio', 'cny', 10000, 10000, 0, true, 30, '{"recommended":false,"creditValue":"1_credit_1_cny_fen"}'::jsonb),
    ('pro', 'Pro', 'cny', 30000, 30000, 0, true, 40, '{"recommended":false,"creditValue":"1_credit_1_cny_fen"}'::jsonb)
)
insert into public.credit_packages (id, label, currency, amount_cents, credits, bonus_credits, enabled, sort_order, metadata)
select id, label, currency, amount_cents, credits, bonus_credits, enabled, sort_order, metadata
from package_seed
on conflict (id) do update set
  label = excluded.label,
  currency = excluded.currency,
  amount_cents = excluded.amount_cents,
  credits = excluded.credits,
  bonus_credits = excluded.bonus_credits,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata
where public.credit_packages.metadata ->> 'creditValue' is null
  or public.credit_packages.metadata ->> 'creditValue' = '1_credit_1_cny_fen'
  or public.credit_packages.metadata ->> 'recommended' is not null;

with image_seed(model_id, size_tier, gpt_quality, credits, crun_credits, cost_fen, metadata) as (
  values
    ('z-image', '1K', null, 40, null::numeric, null::integer, '{"seed":true}'::jsonb),
    ('z-image', '2K', null, 75, null::numeric, null::integer, '{"seed":true}'::jsonb),
    ('z-image', '4K', null, 150, null::numeric, null::integer, '{"seed":true}'::jsonb),
    ('nano-banana-2', '1K', null, 34, 5::numeric, 17, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":5}'::jsonb),
    ('nano-banana-2', '2K', null, 56, 8::numeric, 28, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-2', '4K', null, 82, 12::numeric, 41, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":12}'::jsonb),
    ('grok-imagine-i2i', '1K', null, 28, 4::numeric, 14, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('grok-imagine-i2i', '2K', null, 28, 4::numeric, 14, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('grok-imagine-i2i', '4K', null, 28, 4::numeric, 14, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('nano-banana-pro', '1K', null, 56, 8::numeric, 28, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-pro', '2K', null, 56, 8::numeric, 28, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-pro', '4K', null, 96, 14::numeric, 48, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14}'::jsonb),
    ('gpt-image-2', '1K', 'low', 42, 6::numeric, 21, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":6}'::jsonb),
    ('gpt-image-2', '2K', 'low', 46, 6.6::numeric, 23, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":6.6}'::jsonb),
    ('gpt-image-2', '4K', 'low', 54, 7.8::numeric, 27, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7.8}'::jsonb),
    ('gpt-image-2', '1K', 'medium', 82, 12::numeric, 41, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":12}'::jsonb),
    ('gpt-image-2', '2K', 'medium', 132, 19.2::numeric, 66, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":19.2}'::jsonb),
    ('gpt-image-2', '4K', 'medium', 192, 28.2::numeric, 96, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28.2}'::jsonb),
    ('gpt-image-2', '1K', 'high', 222, 32.4::numeric, 111, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":32.4}'::jsonb),
    ('gpt-image-2', '2K', 'high', 418, 61.2::numeric, 209, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":61.2}'::jsonb),
    ('gpt-image-2', '4K', 'high', 670, 98.4::numeric, 335, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":98.4}'::jsonb)
),
updated as (
  update public.image_credit_prices prices
  set credits = seed.credits,
      enabled = true,
      metadata = seed.metadata
  from image_seed seed
  where prices.model_id = seed.model_id
    and prices.size_tier = seed.size_tier
    and coalesce(prices.gpt_quality, '') = coalesce(seed.gpt_quality, '')
    and (prices.metadata ->> 'seed' = 'true' or prices.metadata ->> 'source' = 'crun_pricing')
  returning prices.id
)
insert into public.image_credit_prices (model_id, size_tier, gpt_quality, credits, enabled, metadata)
select seed.model_id, seed.size_tier, seed.gpt_quality, seed.credits, true, seed.metadata
from image_seed seed
where not exists (
  select 1
  from public.image_credit_prices prices
  where prices.model_id = seed.model_id
    and prices.size_tier = seed.size_tier
    and coalesce(prices.gpt_quality, '') = coalesce(seed.gpt_quality, '')
);

with
  video_seed(model_id, resolution, credits_per_second, crun_credits, cost_fen_per_second, source_unit, metadata) as (
    values
      ('seedance-2.0-mini', '480p', 66, 9.5::numeric, 33, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":9.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-mini', '720p', 140, 20.5::numeric, 70, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-fast', '480p', 106, 15.5::numeric, 53, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":15.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-fast', '720p', 226, 33::numeric, 113, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":33,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '480p', 8, 1::numeric, 4, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":1,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '720p', 14, 2::numeric, 7, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":2,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '1080p', 34, 5::numeric, 17, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":5,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '480p', 24, 3.25::numeric, 12, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":3.25,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '720p', 52, 7.5::numeric, 26, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '1080p', 114, 16.5::numeric, 57, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":16.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '480p', 130, 19::numeric, 65, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":19,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '720p', 280, 41::numeric, 140, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":41,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '1080p', 694, 102::numeric, 347, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":102,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '480p', 28, 4::numeric, 14, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '720p', 56, 8::numeric, 28, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '1080p', 120, 17.5::numeric, 60, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":17.5,"sourceUnit":"second"}'::jsonb),
      ('grok-imagine', '480p', 12, 1.6::numeric, 6, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":1.6,"sourceUnit":"second"}'::jsonb),
      ('grok-imagine', '720p', 22, 3::numeric, 11, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":3,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.0', '720p', 136, 20::numeric, 68, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.0', '1080p', 238, 35::numeric, 119, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":35,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.1', '720p', 136, 20::numeric, 68, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.1', '1080p', 174, 25.5::numeric, 87, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":25.5,"sourceUnit":"second"}'::jsonb),
      ('kling-3.0', '720p', 136, 20::numeric, 68, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('kling-3.0', '1080p', 184, 27::numeric, 92, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":27,"sourceUnit":"second"}'::jsonb),
      ('kling-2.6-motion', '720p', 76, 11::numeric, 38, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":11,"sourceUnit":"second"}'::jsonb),
      ('kling-2.6-motion', '1080p', 124, 18::numeric, 62, 'second', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":18,"sourceUnit":"second"}'::jsonb),
      ('veo-3.1-fast', '720p', 26, 30::numeric, 13, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":30,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1-fast', '1080p', 32, 37.5::numeric, 16, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":37.5,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1-fast', '4k', 78, 90::numeric, 39, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":90,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '720p', 192, 225::numeric, 96, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":225,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '1080p', 198, 232.5::numeric, 99, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":232.5,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '4k', 244, 285::numeric, 122, 'video_8s', '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":285,"sourceUnit":"video_8s"}'::jsonb)
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
  ),
  video_price_rows as (
    select supported.model_id, supported.mode_id, supported.resolution, seed.credits_per_second, seed.cost_fen_per_second, seed.metadata
    from supported
    join video_seed seed on seed.model_id = supported.model_id and seed.resolution = supported.resolution
  ),
  updated as (
    update public.video_credit_prices prices
    set credits_per_second = rows.credits_per_second,
        minimum_credits = 0,
        enabled = true,
        metadata = rows.metadata
    from video_price_rows rows
    where prices.model_id = rows.model_id
      and prices.mode_id = rows.mode_id
      and prices.resolution = rows.resolution
      and (prices.metadata ->> 'seed' = 'true' or prices.metadata ->> 'source' = 'crun_pricing')
    returning prices.id
  )
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select rows.model_id, rows.mode_id, rows.resolution, rows.credits_per_second, 0, true, rows.metadata
from video_price_rows rows
where not exists (
  select 1
  from public.video_credit_prices prices
  where prices.model_id = rows.model_id
    and prices.mode_id = rows.mode_id
    and prices.resolution = rows.resolution
);

with image_cost_seed(model_id, size_tier, gpt_quality, cost_fen, metadata) as (
  values
    ('nano-banana-2', '1K', null, 17, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":5}'::jsonb),
    ('nano-banana-2', '2K', null, 28, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-2', '4K', null, 41, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":12}'::jsonb),
    ('grok-imagine-i2i', '1K', null, 14, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('grok-imagine-i2i', '2K', null, 14, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('grok-imagine-i2i', '4K', null, 14, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4}'::jsonb),
    ('nano-banana-pro', '1K', null, 28, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-pro', '2K', null, 28, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8}'::jsonb),
    ('nano-banana-pro', '4K', null, 48, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":14}'::jsonb),
    ('gpt-image-2', '1K', 'low', 21, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":6}'::jsonb),
    ('gpt-image-2', '2K', 'low', 23, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":6.6}'::jsonb),
    ('gpt-image-2', '4K', 'low', 27, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7.8}'::jsonb),
    ('gpt-image-2', '1K', 'medium', 41, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":12}'::jsonb),
    ('gpt-image-2', '2K', 'medium', 66, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":19.2}'::jsonb),
    ('gpt-image-2', '4K', 'medium', 96, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":28.2}'::jsonb),
    ('gpt-image-2', '1K', 'high', 111, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":32.4}'::jsonb),
    ('gpt-image-2', '2K', 'high', 209, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":61.2}'::jsonb),
    ('gpt-image-2', '4K', 'high', 335, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":98.4}'::jsonb)
),
updated as (
  update public.provider_cost_prices costs
  set provider = 'crun',
      cost_currency = 'cny',
      cost_per_unit_minor = seed.cost_fen,
      source = 'estimated',
      enabled = true,
      metadata = seed.metadata
  from image_cost_seed seed
  where costs.feature = 'image'
    and costs.model_id = seed.model_id
    and costs.unit = 'image'
    and costs.mode_id is null
    and costs.resolution is null
    and costs.size_tier = seed.size_tier
    and coalesce(costs.gpt_quality, '') = coalesce(seed.gpt_quality, '')
    and (costs.metadata ->> 'source' = 'crun_pricing' or costs.metadata ->> 'seed' = 'true')
  returning costs.id
)
insert into public.provider_cost_prices (feature, provider, model_id, mode_id, resolution, size_tier, gpt_quality, cost_currency, cost_per_unit_minor, unit, source, enabled, metadata)
select 'image', 'crun', seed.model_id, null, null, seed.size_tier, seed.gpt_quality, 'cny', seed.cost_fen, 'image', 'estimated', true, seed.metadata
from image_cost_seed seed
where not exists (
  select 1
  from public.provider_cost_prices costs
  where costs.feature = 'image'
    and costs.model_id = seed.model_id
    and costs.unit = 'image'
    and costs.mode_id is null
    and costs.resolution is null
    and costs.size_tier = seed.size_tier
    and coalesce(costs.gpt_quality, '') = coalesce(seed.gpt_quality, '')
);

with
  video_seed(model_id, resolution, cost_fen_per_second, metadata) as (
    values
      ('seedance-2.0-mini', '480p', 33, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":9.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-mini', '720p', 70, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-fast', '480p', 53, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":15.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0-fast', '720p', 113, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":33,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '480p', 4, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":1,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '720p', 7, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":2,"sourceUnit":"second"}'::jsonb),
      ('doubao-seedance-1.0-pro-fast', '1080p', 17, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":5,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '480p', 12, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":3.25,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '720p', 26, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":7.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.0-pro', '1080p', 57, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":16.5,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '480p', 65, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":19,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '720p', 140, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":41,"sourceUnit":"second"}'::jsonb),
      ('seedance-2.0', '1080p', 347, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":102,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '480p', 14, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":4,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '720p', 28, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":8,"sourceUnit":"second"}'::jsonb),
      ('seedance-1.5-pro', '1080p', 60, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":17.5,"sourceUnit":"second"}'::jsonb),
      ('grok-imagine', '480p', 6, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":1.6,"sourceUnit":"second"}'::jsonb),
      ('grok-imagine', '720p', 11, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":3,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.0', '720p', 68, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.0', '1080p', 119, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":35,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.1', '720p', 68, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('happyhorse-1.1', '1080p', 87, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":25.5,"sourceUnit":"second"}'::jsonb),
      ('kling-3.0', '720p', 68, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":20,"sourceUnit":"second"}'::jsonb),
      ('kling-3.0', '1080p', 92, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":27,"sourceUnit":"second"}'::jsonb),
      ('kling-2.6-motion', '720p', 38, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":11,"sourceUnit":"second"}'::jsonb),
      ('kling-2.6-motion', '1080p', 62, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":18,"sourceUnit":"second"}'::jsonb),
      ('veo-3.1-fast', '720p', 13, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":30,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1-fast', '1080p', 16, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":37.5,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1-fast', '4k', 39, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":90,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '720p', 96, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":225,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '1080p', 99, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":232.5,"sourceUnit":"video_8s"}'::jsonb),
      ('veo-3.1', '4k', 122, '{"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":285,"sourceUnit":"video_8s"}'::jsonb)
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
  ),
  cost_rows as (
    select supported.model_id, supported.mode_id, supported.resolution, seed.cost_fen_per_second, seed.metadata
    from supported
    join video_seed seed on seed.model_id = supported.model_id and seed.resolution = supported.resolution
  ),
  updated as (
    update public.provider_cost_prices costs
    set provider = 'crun',
        cost_currency = 'cny',
        cost_per_unit_minor = rows.cost_fen_per_second,
        source = 'estimated',
        enabled = true,
        metadata = rows.metadata
    from cost_rows rows
    where costs.feature = 'video'
      and costs.model_id = rows.model_id
      and costs.mode_id = rows.mode_id
      and costs.resolution = rows.resolution
      and costs.unit = 'second'
      and costs.size_tier is null
      and costs.gpt_quality is null
      and (costs.metadata ->> 'source' = 'crun_pricing' or costs.metadata ->> 'seed' = 'true')
    returning costs.id
  )
insert into public.provider_cost_prices (feature, provider, model_id, mode_id, resolution, size_tier, gpt_quality, cost_currency, cost_per_unit_minor, unit, source, enabled, metadata)
select 'video', 'crun', rows.model_id, rows.mode_id, rows.resolution, null, null, 'cny', rows.cost_fen_per_second, 'second', 'estimated', true, rows.metadata
from cost_rows rows
where not exists (
  select 1
  from public.provider_cost_prices costs
  where costs.feature = 'video'
    and costs.model_id = rows.model_id
    and costs.mode_id = rows.mode_id
    and costs.resolution = rows.resolution
    and costs.unit = 'second'
    and costs.size_tier is null
    and costs.gpt_quality is null
);
