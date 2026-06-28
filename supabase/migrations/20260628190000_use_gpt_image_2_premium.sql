update public.site_settings
set
  image_workspace =
    coalesce(image_workspace, '{}'::jsonb)
    || jsonb_build_object(
      'models',
      coalesce(image_workspace -> 'models', '{}'::jsonb)
      || jsonb_build_object(
        'gpt-image-2',
        coalesce(image_workspace #> '{models,gpt-image-2}', '{}'::jsonb)
        || jsonb_build_object('modelName', 'openai/gpt-image-2-premium')
      )
    ),
  updated_at = now()
where id = 'global';
