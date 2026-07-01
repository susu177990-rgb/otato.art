update public.provider_cost_prices
set enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"stale_grok_video_pricing"}'::jsonb,
    updated_at = now()
where feature = 'video'
  and model_id = 'grok-imagine'
  and mode_id in ('text_to_video', 'start_frame')
  and resolution in ('480p', '720p')
  and unit = 'second'
  and enabled = true
  and not (
    (resolution = '480p' and cost_per_unit_minor = 50 and metadata @> '{"crunCredits":14.5}'::jsonb)
    or (resolution = '720p' and cost_per_unit_minor = 96 and metadata @> '{"crunCredits":28}'::jsonb)
  );
