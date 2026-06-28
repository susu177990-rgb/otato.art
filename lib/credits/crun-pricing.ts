import type { GptImageQuality, ImageModelId, ImageSizeTier } from "@/lib/image-workspace";
import type { VideoModelId, VideoResolution } from "@/lib/video-workspace";

export const CRUN_PRICING_SOURCE = "crun_pricing";
export const CRUN_PLAN_LABEL = "$5";
export const CRUN_CREDITS_PER_USD = 200;
export const CRUN_USD_CNY_RATE = 6.8;
export const CREDIT_CNY_FEN_VALUE = 1;
export const MINIMUM_SALE_COST_MULTIPLIER = 2;

export type CrunPriceMetadata = {
  source: typeof CRUN_PRICING_SOURCE;
  crunPlan: typeof CRUN_PLAN_LABEL;
  crunCreditsPerUsd: typeof CRUN_CREDITS_PER_USD;
  usdCny: typeof CRUN_USD_CNY_RATE;
  crunCredits: number;
};

export type CrunImageCostSeed = {
  modelId: ImageModelId;
  sizeTier: ImageSizeTier;
  gptQuality: GptImageQuality | null;
  crunCredits: number;
  costFen: number;
  saleCredits: number;
};

export type CrunVideoCostSeed = {
  modelId: VideoModelId;
  resolution: VideoResolution;
  crunCredits: number;
  costFenPerSecond: number;
  saleCreditsPerSecond: number;
  sourceUnit: "second" | "video_8s";
};

export function crunCreditsToCnyFen(crunCredits: number): number {
  if (!Number.isFinite(crunCredits) || crunCredits <= 0) return 0;
  return Math.ceil((crunCredits / CRUN_CREDITS_PER_USD) * CRUN_USD_CNY_RATE * 100);
}

export function saleCreditsForCnyCost(costFen: number): number {
  if (!Number.isFinite(costFen) || costFen <= 0) return 0;
  return Math.ceil(costFen * MINIMUM_SALE_COST_MULTIPLIER);
}

export function crunMetadata(crunCredits: number): CrunPriceMetadata {
  return {
    source: CRUN_PRICING_SOURCE,
    crunPlan: CRUN_PLAN_LABEL,
    crunCreditsPerUsd: CRUN_CREDITS_PER_USD,
    usdCny: CRUN_USD_CNY_RATE,
    crunCredits,
  };
}

function imageSeed(
  modelId: ImageModelId,
  sizeTier: ImageSizeTier,
  gptQuality: GptImageQuality | null,
  crunCredits: number,
): CrunImageCostSeed {
  const costFen = crunCreditsToCnyFen(crunCredits);
  return {
    modelId,
    sizeTier,
    gptQuality,
    crunCredits,
    costFen,
    saleCredits: saleCreditsForCnyCost(costFen),
  };
}

function videoSecondSeed(
  modelId: VideoModelId,
  resolution: VideoResolution,
  crunCredits: number,
): CrunVideoCostSeed {
  const costFenPerSecond = crunCreditsToCnyFen(crunCredits);
  return {
    modelId,
    resolution,
    crunCredits,
    costFenPerSecond,
    saleCreditsPerSecond: saleCreditsForCnyCost(costFenPerSecond),
    sourceUnit: "second",
  };
}

function videoEightSecondSeed(
  modelId: VideoModelId,
  resolution: VideoResolution,
  crunCredits: number,
): CrunVideoCostSeed {
  const videoCostFen = crunCreditsToCnyFen(crunCredits);
  const costFenPerSecond = Math.ceil(videoCostFen / 8);
  return {
    modelId,
    resolution,
    crunCredits,
    costFenPerSecond,
    saleCreditsPerSecond: saleCreditsForCnyCost(costFenPerSecond),
    sourceUnit: "video_8s",
  };
}

export const CRUN_IMAGE_COST_SEEDS: CrunImageCostSeed[] = [
  imageSeed("nano-banana-2", "1K", null, 5),
  imageSeed("nano-banana-2", "2K", null, 8),
  imageSeed("nano-banana-2", "4K", null, 12),
  imageSeed("nano-banana-pro", "1K", null, 8),
  imageSeed("nano-banana-pro", "2K", null, 8),
  imageSeed("nano-banana-pro", "4K", null, 14),
  imageSeed("grok-imagine-i2i", "1K", null, 4),
  imageSeed("grok-imagine-i2i", "2K", null, 4),
  imageSeed("grok-imagine-i2i", "4K", null, 4),
  imageSeed("gpt-image-2", "1K", "low", 6),
  imageSeed("gpt-image-2", "2K", "low", 6.6),
  imageSeed("gpt-image-2", "4K", "low", 7.8),
  imageSeed("gpt-image-2", "1K", "medium", 12),
  imageSeed("gpt-image-2", "2K", "medium", 19.2),
  imageSeed("gpt-image-2", "4K", "medium", 28.2),
  imageSeed("gpt-image-2", "1K", "high", 32.4),
  imageSeed("gpt-image-2", "2K", "high", 61.2),
  imageSeed("gpt-image-2", "4K", "high", 98.4),
];

export const CRUN_VIDEO_COST_SEEDS: CrunVideoCostSeed[] = [
  videoSecondSeed("seedance-2.0-mini", "480p", 9.5),
  videoSecondSeed("seedance-2.0-mini", "720p", 20.5),
  videoSecondSeed("seedance-2.0-fast", "480p", 15.5),
  videoSecondSeed("seedance-2.0-fast", "720p", 33),
  videoSecondSeed("doubao-seedance-1.0-pro-fast", "480p", 1),
  videoSecondSeed("doubao-seedance-1.0-pro-fast", "720p", 2),
  videoSecondSeed("doubao-seedance-1.0-pro-fast", "1080p", 5),
  videoSecondSeed("seedance-1.0-pro", "480p", 3.25),
  videoSecondSeed("seedance-1.0-pro", "720p", 7.5),
  videoSecondSeed("seedance-1.0-pro", "1080p", 16.5),
  videoSecondSeed("seedance-2.0", "480p", 19),
  videoSecondSeed("seedance-2.0", "720p", 41),
  videoSecondSeed("seedance-2.0", "1080p", 102),
  videoSecondSeed("seedance-1.5-pro", "480p", 4),
  videoSecondSeed("seedance-1.5-pro", "720p", 8),
  videoSecondSeed("seedance-1.5-pro", "1080p", 17.5),
  videoSecondSeed("grok-imagine", "480p", 1.6),
  videoSecondSeed("grok-imagine", "720p", 3),
  videoSecondSeed("happyhorse-1.0", "720p", 20),
  videoSecondSeed("happyhorse-1.0", "1080p", 35),
  videoSecondSeed("happyhorse-1.1", "720p", 20),
  videoSecondSeed("happyhorse-1.1", "1080p", 25.5),
  videoSecondSeed("kling-3.0", "720p", 20),
  videoSecondSeed("kling-3.0", "1080p", 27),
  videoSecondSeed("kling-2.6-motion", "720p", 11),
  videoSecondSeed("kling-2.6-motion", "1080p", 18),
  videoEightSecondSeed("veo-3.1-fast", "720p", 30),
  videoEightSecondSeed("veo-3.1-fast", "1080p", 37.5),
  videoEightSecondSeed("veo-3.1-fast", "4k", 90),
  videoEightSecondSeed("veo-3.1", "720p", 225),
  videoEightSecondSeed("veo-3.1", "1080p", 232.5),
  videoEightSecondSeed("veo-3.1", "4k", 285),
];

export function crunImageSeedKey(item: Pick<CrunImageCostSeed, "modelId" | "sizeTier" | "gptQuality">): string {
  return `${item.modelId}:${item.sizeTier}:${item.gptQuality ?? "standard"}`;
}

export function crunVideoSeedKey(item: Pick<CrunVideoCostSeed, "modelId" | "resolution">): string {
  return `${item.modelId}:${item.resolution}`;
}
