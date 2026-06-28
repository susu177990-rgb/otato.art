with model_defaults(model_id, label, modes) as (
  values
    ('happyhorse-1.1', 'HappyHorse 1.1', '{"text_to_video":"happyhorse-1-1-t2v","start_frame":"happyhorse-1-1-i2v","multi_image_reference":"happyhorse-1-1-r2v"}'::jsonb),
    ('happyhorse-1.0', 'HappyHorse 1.0', '{"text_to_video":"happyhorse-1-0-t2v","start_frame":"happyhorse-1-0-i2v","multi_image_reference":"happyhorse-1-0-r2v","video_edit":"happyhorse-1-0-video-edit"}'::jsonb),
    ('grok-imagine', 'Grok Imagine', '{"text_to_video":"grok-imagine/t2v","start_frame":"grok-imagine-video-1.5-preview"}'::jsonb)
),
global_settings as (
  select
    coalesce(video_workspace, '{}'::jsonb) as video_workspace,
    coalesce(
      nullif(video_workspace #>> '{models,seedance-2.0,apiKey}', ''),
      nullif(video_workspace #>> '{models,kling-3.0,apiKey}', ''),
      nullif(video_workspace #>> '{models,happyhorse-1.1,apiKey}', ''),
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
        'apiKey', coalesce(nullif(settings.video_workspace #>> array['models', defaults.model_id, 'apiKey'], ''), settings.crun_api_key),
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
