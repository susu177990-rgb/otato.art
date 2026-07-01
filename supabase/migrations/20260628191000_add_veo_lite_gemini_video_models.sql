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
    ('veo-3.1', 'Veo 3.1', '{"text_to_video":"google/veo3-1-t2v","start_frame":"google/veo3-1-i2v","start_end_frame":"google/veo3-1-i2v"}'::jsonb),
    ('veo-3.1-fast', 'Veo 3.1 Fast', '{"text_to_video":"google/veo3-1-fast-t2v","start_frame":"google/veo3-1-fast-i2v","start_end_frame":"google/veo3-1-fast-i2v","multi_image_reference":"google/veo3-1-fast-r2v"}'::jsonb),
    ('veo-3.1-lite', 'Veo 3.1 Lite', '{"text_to_video":"google/veo3-1-lite-t2v","start_frame":"google/veo3-1-lite-i2v","start_end_frame":"google/veo3-1-lite-i2v","multi_image_reference":"google/veo3-1-lite-r2v"}'::jsonb),
    ('gemini-omni', 'Gemini Omni', '{"text_to_video":"google/gemini-omni","start_frame":"google/gemini-omni","start_end_frame":"google/gemini-omni","multi_image_reference":"google/gemini-omni"}'::jsonb)
),
global_settings as (
  select
    coalesce(video_workspace, '{}'::jsonb) as video_workspace,
    coalesce(
      nullif(video_workspace #>> '{models,seedance-2.0,apiKey}', ''),
      nullif(video_workspace #>> '{models,veo-3.1,apiKey}', ''),
      nullif(video_workspace #>> '{models,gemini-omni,apiKey}', ''),
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

with price_seed(model_id, resolution, credits_per_second) as (
  values
    ('veo-3.1-lite', '720p', 26::numeric),
    ('veo-3.1-lite', '1080p', 32::numeric),
    ('veo-3.1-lite', '4k', 78::numeric),
    ('gemini-omni', '720p', 26::numeric),
    ('gemini-omni', '1080p', 32::numeric),
    ('gemini-omni', '4k', 78::numeric)
),
supported(model_id, mode_id, resolution, credits_per_second) as (
  select seed.model_id, mode.mode_id, seed.resolution, seed.credits_per_second
  from price_seed seed
  cross join lateral (
    values
      ('text_to_video'),
      ('start_frame'),
      ('start_end_frame'),
      ('multi_image_reference')
  ) as mode(mode_id)
)
insert into public.video_credit_prices (model_id, mode_id, resolution, credits_per_second, minimum_credits, enabled, metadata)
select
  supported.model_id,
  supported.mode_id,
  supported.resolution,
  supported.credits_per_second,
  0,
  true,
  '{"source":"manual_estimate_until_crun_pricing_doc","editable":true}'::jsonb
from supported
on conflict (model_id, mode_id, resolution)
do update set
  credits_per_second = excluded.credits_per_second,
  minimum_credits = excluded.minimum_credits,
  enabled = true,
  metadata = excluded.metadata;
