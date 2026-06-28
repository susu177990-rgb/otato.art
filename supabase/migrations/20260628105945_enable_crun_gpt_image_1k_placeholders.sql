-- Older placeholder rows for gpt-image-2 1K were disabled with empty metadata.
-- Promote only those placeholders to the Crun CNY seed prices.

with seed(size_tier, gpt_quality, credits, metadata) as (
  values
    ('1K', 'low', 42, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":6}'::jsonb),
    ('1K', 'medium', 82, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":12}'::jsonb),
    ('1K', 'high', 222, '{"seed":true,"source":"crun_pricing","crunPlan":"$5","crunCreditsPerUsd":200,"usdCny":6.8,"crunCredits":32.4}'::jsonb)
)
update public.image_credit_prices prices
set credits = seed.credits,
    enabled = true,
    metadata = seed.metadata
from seed
where prices.model_id = 'gpt-image-2'
  and prices.size_tier = seed.size_tier
  and prices.gpt_quality = seed.gpt_quality
  and prices.enabled = false
  and prices.metadata = '{}'::jsonb;
