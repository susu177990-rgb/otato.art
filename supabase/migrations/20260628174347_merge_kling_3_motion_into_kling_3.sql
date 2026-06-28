with global_settings as (
  select coalesce(video_workspace, '{}'::jsonb) as video_workspace
  from public.site_settings
  where id = 'global'
),
merged as (
  select
    coalesce(video_workspace -> 'models', '{}'::jsonb) as models,
    coalesce(video_workspace #> '{models,kling-3.0}', '{}'::jsonb) as kling_model,
    coalesce(video_workspace #> '{models,kling-3.0,apiModelNameByMode}', '{}'::jsonb) as kling_modes,
    coalesce(video_workspace #>> '{models,kling-3.0-motion,apiKey}', '') as motion_key
  from global_settings
),
patched as (
  select
    (models - 'kling-3.0-motion')
      || jsonb_build_object(
        'kling-3.0',
        kling_model
          || jsonb_build_object(
            'id', 'kling-3.0',
            'label', 'Kling 3.0',
            'baseUrl', 'https://api.crun.ai/api/v1/client/job/CreateTask',
            'apiKey', coalesce(nullif(kling_model ->> 'apiKey', ''), nullif(motion_key, ''), ''),
            'apiModelName', '',
            'apiModelNameByMode', kling_modes || jsonb_build_object('motion_control', 'kling/v3-motion-control'),
            'enabled', true,
            'providerOptions', coalesce(kling_model -> 'providerOptions', '{}'::jsonb)
          )
      ) as models
  from merged
)
update public.site_settings
set video_workspace =
  coalesce(video_workspace, '{}'::jsonb)
    || jsonb_build_object('models', (select models from patched))
where id = 'global';

with price_seed(model_id, mode_id, resolution, credits_per_second, metadata) as (
  values
    ('kling-3.0', 'motion_control', '720p', 76::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","merged_from":"kling-3.0-motion","editable":true}'::jsonb),
    ('kling-3.0', 'motion_control', '1080p', 124::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","merged_from":"kling-3.0-motion","editable":true}'::jsonb)
)
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select model_id, mode_id, resolution, credits_per_second, 0, true, metadata
from price_seed
on conflict (model_id, mode_id, resolution)
do update set
  credits_per_second = excluded.credits_per_second,
  minimum_credits = excluded.minimum_credits,
  enabled = true,
  metadata = coalesce(public.video_credit_prices.metadata, '{}'::jsonb) || excluded.metadata;

update public.video_credit_prices
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"merged_into_kling_3_0_motion_control"}'::jsonb
where model_id = 'kling-3.0-motion';
