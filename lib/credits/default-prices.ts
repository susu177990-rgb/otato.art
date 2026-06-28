import {
  IMAGE_MODEL_ORDER,
  type GptImageQuality,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import {
  DISABLED_VIDEO_MODEL_IDS,
  VIDEO_GENERATION_MODES,
  VIDEO_MODEL_ORDER,
  getVideoParameterCapabilities,
  isVideoModelModeSupported,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";
import {
  CRUN_IMAGE_COST_SEEDS,
  CRUN_VIDEO_COST_SEEDS,
  crunImageSeedKey,
  crunVideoSeedKey,
} from "./crun-pricing";

export const DEFAULT_CREDIT_PACKAGES = [
  {
    id: "studio",
    label: "100 元充值包",
    currency: "cny",
    amountCents: 10000,
    credits: 10000,
    bonusCredits: 1000,
    enabled: true,
    sortOrder: 10,
  },
] as const;

export type DefaultImageCreditPrice = {
  modelId: ImageModelId;
  sizeTier: ImageSizeTier;
  gptQuality: GptImageQuality | null;
  credits: number;
  enabled: boolean;
};

export type DefaultVideoCreditPrice = {
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
  creditsPerSecond: number;
  minimumCredits: number;
  enabled: boolean;
};

export const DEFAULT_IMAGE_CREDIT_PRICES: DefaultImageCreditPrice[] = [
  { modelId: "z-image", sizeTier: "1K", gptQuality: null, credits: 40, enabled: true },
  { modelId: "z-image", sizeTier: "2K", gptQuality: null, credits: 75, enabled: true },
  { modelId: "z-image", sizeTier: "4K", gptQuality: null, credits: 150, enabled: true },
  ...CRUN_IMAGE_COST_SEEDS.map((item) => ({
    modelId: item.modelId,
    sizeTier: item.sizeTier,
    gptQuality: item.gptQuality,
    credits: item.saleCredits,
    enabled: true,
  })),
];

const DEFAULT_VIDEO_BASE_CREDITS_PER_SECOND: Record<VideoModelId, Partial<Record<VideoResolution, number>>> = {
  "seedance-2.0-mini": {},
  "seedance-2.0-fast": {},
  "doubao-seedance-1.0-pro-fast": {},
  "seedance-1.0-pro": {},
  "seedance-2.0": {},
  "seedance-1.5-pro": {},
  "grok-imagine": {},
  "happyhorse-1.0": {},
  "happyhorse-1.1": {},
  "kling-3.0": { "4k": 300 },
  "kling-3.0-motion": { "720p": 76, "1080p": 124 },
  "kling-2.6-motion": {},
  "veo-3.1-fast": {},
  "veo-3.1-lite": { "720p": 26, "1080p": 32, "4k": 78 },
  "veo-3.1": {},
  "gemini-omni": { "720p": 26, "1080p": 32, "4k": 78 },
};

for (const item of CRUN_VIDEO_COST_SEEDS) {
  DEFAULT_VIDEO_BASE_CREDITS_PER_SECOND[item.modelId][item.resolution] = item.saleCreditsPerSecond;
}

export function roundCreditsToFive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 5) * 5;
}

export function imageDefaultPriceKey(item: Pick<DefaultImageCreditPrice, "modelId" | "sizeTier" | "gptQuality">): string {
  return `${item.modelId}:${item.sizeTier}:${item.gptQuality ?? "standard"}`;
}

export function videoDefaultPriceKey(item: Pick<DefaultVideoCreditPrice, "modelId" | "modeId" | "resolution">): string {
  return `${item.modelId}:${item.modeId}:${item.resolution}`;
}

export function defaultImageCreditPrices(): DefaultImageCreditPrice[] {
  const knownModels = new Set(IMAGE_MODEL_ORDER);
  return DEFAULT_IMAGE_CREDIT_PRICES.filter((item) => knownModels.has(item.modelId));
}

export function defaultVideoCreditPrices(): DefaultVideoCreditPrice[] {
  const out: DefaultVideoCreditPrice[] = [];
  for (const modelId of VIDEO_MODEL_ORDER) {
    if (DISABLED_VIDEO_MODEL_IDS.has(modelId)) continue;
    const baseByResolution = DEFAULT_VIDEO_BASE_CREDITS_PER_SECOND[modelId] ?? {};
    for (const mode of VIDEO_GENERATION_MODES) {
      if (!isVideoModelModeSupported(modelId, mode.id)) continue;
      const caps = getVideoParameterCapabilities(modelId, mode.id, []);
      for (const resolution of caps.resolutions) {
        const base = baseByResolution[resolution];
        if (!base) continue;
        out.push({
          modelId,
          modeId: mode.id,
          resolution,
          creditsPerSecond: base,
          minimumCredits: 0,
          enabled: true,
        });
      }
    }
  }
  return out;
}

export function defaultCreditPackages() {
  return DEFAULT_CREDIT_PACKAGES.map((item) => ({
    ...item,
    metadata: { recommended: true, creditValue: "1_credit_1_cny_fen" },
  }));
}

export function crunDefaultImageCostByKey() {
  return new Map(CRUN_IMAGE_COST_SEEDS.map((item) => [crunImageSeedKey(item), item]));
}

export function crunDefaultVideoCostByKey() {
  return new Map(CRUN_VIDEO_COST_SEEDS.map((item) => [crunVideoSeedKey(item), item]));
}
