update public.site_settings
set video_workspace =
  jsonb_set(
    coalesce(video_workspace, '{}'::jsonb),
    '{uiDefaults,defaultResolution}',
    '"720p"'::jsonb,
    true
  ),
  updated_at = now()
where id = 'global'
  and coalesce(video_workspace #>> '{uiDefaults,defaultResolution}', '') <> '720p';
