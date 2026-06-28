alter table public.video_credit_prices
  drop constraint if exists video_credit_prices_model_check;

alter table public.video_credit_prices
  add constraint video_credit_prices_model_check check (
    model_id in (
      'seedance-2.0',
      'seedance-2.0-fast',
      'seedance-2.0-mini',
      'seedance-1.5-pro',
      'doubao-seedance-1.0-pro-fast',
      'seedance-1.0-pro',
      'kling-3.0',
      'kling-3.0-motion',
      'kling-2.6-motion',
      'happyhorse-1.1',
      'happyhorse-1.0',
      'grok-imagine',
      'veo-3.1',
      'veo-3.1-fast',
      'veo-3.1-lite',
      'gemini-omni'
    )
  );

with model_defaults(model_id, label, modes) as (
  values
    ('kling-3.0', 'Kling 3.0', '{"text_to_video":"kling/v3","start_frame":"kling/v3","start_end_frame":"kling/v3","multi_image_reference":"kling/v3"}'::jsonb),
    ('kling-3.0-motion', 'Kling 3.0 Motion Control', '{"motion_control":"kling/v3-motion-control"}'::jsonb),
    ('kling-2.6-motion', 'Kling 2.6 Motion Control', '{"motion_control":"kling/v2-6-motion-control"}'::jsonb)
),
global_settings as (
  select
    coalesce(video_workspace, '{}'::jsonb) as video_workspace,
    coalesce(
      nullif(video_workspace #>> '{models,seedance-2.0,apiKey}', ''),
      nullif(video_workspace #>> '{models,kling-3.0,apiKey}', ''),
      ''
    ) as crun_api_key
  from public.site_settings
  where id = 'global'
),
merged_models as (
  select jsonb_object_agg(
    defaults.model_id,
    coalesce(settings.video_workspace #> array['models', defaults.model_id], '{}'::jsonb)
      || jsonb_build_object(
        'id', defaults.model_id,
        'label', defaults.label,
        'baseUrl', 'https://api.crun.ai/api/v1/client/job/CreateTask',
        'apiKey', settings.crun_api_key,
        'apiModelName', '',
        'apiModelNameByMode', defaults.modes,
        'enabled', true,
        'providerOptions', coalesce(settings.video_workspace #> array['models', defaults.model_id, 'providerOptions'], '{}'::jsonb)
      )
  ) as models_patch
  from model_defaults defaults
  cross join global_settings settings
)
update public.site_settings
set video_workspace =
  coalesce(video_workspace, '{}'::jsonb)
    || jsonb_build_object(
      'models',
      coalesce(video_workspace -> 'models', '{}'::jsonb) || coalesce((select models_patch from merged_models), '{}'::jsonb)
    )
where id = 'global';

update public.video_credit_prices
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"kling_v3_crun_video_edit_not_documented"}'::jsonb
where model_id = 'kling-3.0'
  and mode_id = 'video_edit';

with price_seed(model_id, mode_id, resolution, credits_per_second, metadata) as (
  values
    ('kling-3.0', 'text_to_video', '4k', 300::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb),
    ('kling-3.0', 'start_frame', '4k', 300::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb),
    ('kling-3.0', 'start_end_frame', '4k', 300::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb),
    ('kling-3.0', 'multi_image_reference', '4k', 300::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb),
    ('kling-3.0-motion', 'motion_control', '720p', 76::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb),
    ('kling-3.0-motion', 'motion_control', '1080p', 124::numeric, '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb)
)
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select model_id, mode_id, resolution, credits_per_second, 0, true, metadata
from price_seed
on conflict (model_id, mode_id, resolution)
do update set
  credits_per_second = excluded.credits_per_second,
  minimum_credits = excluded.minimum_credits,
  enabled = true,
  metadata = excluded.metadata;
