-- Normalize default seeded video prices so modes do not affect billing.
-- Admin-created rows without metadata.seed=true are left untouched.

with base(model_id, resolution, credits_per_second) as (
  values
    ('seedance-2.0-mini', '480p', 45::bigint),
    ('seedance-2.0-mini', '720p', 70::bigint),
    ('seedance-2.0-fast', '480p', 60::bigint),
    ('seedance-2.0-fast', '720p', 90::bigint),
    ('doubao-seedance-1.0-pro-fast', '480p', 40::bigint),
    ('doubao-seedance-1.0-pro-fast', '720p', 70::bigint),
    ('doubao-seedance-1.0-pro-fast', '1080p', 110::bigint),
    ('seedance-1.0-pro', '480p', 55::bigint),
    ('seedance-1.0-pro', '720p', 85::bigint),
    ('seedance-1.0-pro', '1080p', 130::bigint),
    ('seedance-2.0', '480p', 70::bigint),
    ('seedance-2.0', '720p', 110::bigint),
    ('seedance-2.0', '1080p', 170::bigint),
    ('seedance-1.5-pro', '480p', 80::bigint),
    ('seedance-1.5-pro', '720p', 130::bigint),
    ('seedance-1.5-pro', '1080p', 200::bigint),
    ('grok-imagine', '480p', 50::bigint),
    ('grok-imagine', '720p', 80::bigint),
    ('happyhorse-1.0', '720p', 70::bigint),
    ('happyhorse-1.0', '1080p', 110::bigint),
    ('happyhorse-1.1', '720p', 90::bigint),
    ('happyhorse-1.1', '1080p', 140::bigint),
    ('kling-3.0', '720p', 150::bigint),
    ('kling-3.0', '1080p', 230::bigint),
    ('kling-2.6-motion', '720p', 180::bigint),
    ('kling-2.6-motion', '1080p', 280::bigint),
    ('veo-3.1-fast', '720p', 200::bigint),
    ('veo-3.1-fast', '1080p', 320::bigint),
    ('veo-3.1-fast', '4k', 650::bigint),
    ('veo-3.1', '720p', 320::bigint),
    ('veo-3.1', '1080p', 520::bigint),
    ('veo-3.1', '4k', 980::bigint)
)
update public.video_credit_prices prices
set
  credits_per_second = base.credits_per_second,
  minimum_credits = 0,
  updated_at = now()
from base
where prices.model_id = base.model_id
  and prices.resolution = base.resolution
  and prices.metadata ->> 'seed' = 'true';
