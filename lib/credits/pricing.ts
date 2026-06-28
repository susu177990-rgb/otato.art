import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_MODEL_ORDER, type GptImageQuality, type ImageModelId, type ImageSizeTier } from "@/lib/image-workspace";
import {
  getVideoModelDefinition,
  getVideoParameterCapabilities,
  isVideoModelModeSupported,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";
import { estimateMarginFromCost } from "./margins";
import type { ImageCreditQuote, ImageCreditQuoteInput, VideoCreditQuote, VideoCreditQuoteInput } from "./types";

export class CreditPricingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CreditPricingError";
    this.code = code;
    this.status = status;
  }
}

function normalizeImageSize(value: unknown): ImageSizeTier {
  return value === "2K" || value === "4K" ? value : "1K";
}

export function normalizeGptImageBillingQuality(value: GptImageQuality | undefined): GptImageQuality {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "low";
}

type ProviderCostRow = {
  id: string;
  provider: string | null;
  cost_currency: string | null;
  cost_per_unit_minor: number | null;
  unit: "image" | "second";
  source: "manual" | "invoice" | "estimated" | null;
  effective_from: string | null;
  effective_to: string | null;
  metadata: Record<string, unknown> | null;
};

function imageProvider(modelId: ImageModelId): string {
  if (modelId === "gpt-image-2") return "openai";
  if (modelId === "grok-imagine-i2i") return "grok";
  if (modelId === "z-image") return "z-image";
  return "nano-banana";
}

function activeCost(rows: ProviderCostRow[]): ProviderCostRow | null {
  const now = Date.now();
  return rows.find((item) => {
    const from = item.effective_from ? Date.parse(item.effective_from) : 0;
    const to = item.effective_to ? Date.parse(item.effective_to) : Number.POSITIVE_INFINITY;
    return (Number.isNaN(from) || from <= now) && (Number.isNaN(to) || to > now);
  }) ?? null;
}

async function findImageProviderCost(
  supabase: SupabaseClient,
  params: { modelId: ImageModelId; sizeTier: ImageSizeTier; gptQuality?: GptImageQuality },
): Promise<ProviderCostRow | null> {
  let query = supabase
    .from("provider_cost_prices")
    .select("id, provider, cost_currency, cost_per_unit_minor, unit, source, effective_from, effective_to, metadata")
    .eq("feature", "image")
    .eq("model_id", params.modelId)
    .eq("size_tier", params.sizeTier)
    .eq("unit", "image")
    .eq("enabled", true)
    .order("effective_from", { ascending: false })
    .limit(10);
  query = params.gptQuality ? query.eq("gpt_quality", params.gptQuality) : query.is("gpt_quality", null);
  const { data, error } = await query;
  if (error) {
    if (/provider_cost_prices|schema cache|does not exist|PGRST205/i.test(error.message)) return null;
    throw error;
  }
  return activeCost((data ?? []) as ProviderCostRow[]);
}

async function findVideoProviderCost(
  supabase: SupabaseClient,
  params: { modelId: VideoModelId; modeId: VideoGenerationModeId; resolution: VideoResolution },
): Promise<ProviderCostRow | null> {
  const { data, error } = await supabase
    .from("provider_cost_prices")
    .select("id, provider, cost_currency, cost_per_unit_minor, unit, source, effective_from, effective_to, metadata")
    .eq("feature", "video")
    .eq("model_id", params.modelId)
    .eq("mode_id", params.modeId)
    .eq("resolution", params.resolution)
    .eq("unit", "second")
    .eq("enabled", true)
    .order("effective_from", { ascending: false })
    .limit(10);
  if (error) {
    if (/provider_cost_prices|schema cache|does not exist|PGRST205/i.test(error.message)) return null;
    throw error;
  }
  return activeCost((data ?? []) as ProviderCostRow[]);
}

export async function quoteImageCredits(
  supabase: SupabaseClient,
  input: ImageCreditQuoteInput,
): Promise<ImageCreditQuote> {
  if (!IMAGE_MODEL_ORDER.includes(input.modelId)) {
    throw new CreditPricingError("image_model_not_supported", "图片模型无效。", 422);
  }
  const imageSize = normalizeImageSize(input.imageSize);
  const gptQuality = input.modelId === "gpt-image-2"
    ? normalizeGptImageBillingQuality(input.gptImageQuality)
    : undefined;

  let query = supabase
    .from("image_credit_prices")
    .select("model_id, size_tier, gpt_quality, credits")
    .eq("model_id", input.modelId)
    .eq("size_tier", imageSize)
    .eq("enabled", true);
  query = gptQuality ? query.eq("gpt_quality", gptQuality) : query.is("gpt_quality", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new CreditPricingError(
      "image_price_not_configured",
      `当前图片模型价格未配置（${input.modelId} / ${imageSize}${gptQuality ? ` / ${gptQuality}` : ""}）。`,
      400,
    );
  }
  const credits = Number((data as { credits: unknown }).credits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new CreditPricingError("image_price_invalid", "当前图片模型价格无效，请联系管理员。", 400);
  }
  const cost = await findImageProviderCost(supabase, { modelId: input.modelId, sizeTier: imageSize, gptQuality });
  const margin = estimateMarginFromCost({
    credits,
    currency: cost?.cost_currency,
    unit: "image",
    costPerUnitMinor: cost?.cost_per_unit_minor,
    quantity: 1,
    source: cost?.source ?? "manual",
    provider: cost?.provider ?? imageProvider(input.modelId),
    costPriceId: cost?.id,
    metadata: cost?.metadata,
  });
  return {
    feature: input.feature,
    modelId: input.modelId,
    imageSize,
    gptImageQuality: gptQuality,
    credits,
    priceSnapshot: {
      kind: "image",
      feature: input.feature,
      modelId: input.modelId,
      imageSize,
      gptImageQuality: input.modelId === "gpt-image-2" ? input.gptImageQuality ?? "low" : undefined,
      normalizedQuality: gptQuality,
      credits,
    },
    costSnapshot: margin.costSnapshot,
    estimatedMarginCredits: margin.estimatedMarginCredits,
    estimatedMarginPercent: margin.estimatedMarginPercent,
    marginStatus: margin.marginStatus,
  };
}

function ceilBillableSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

export function assertSupportedVideoPriceShape(params: {
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
}) {
  if (!isVideoModelModeSupported(params.modelId, params.modeId)) {
    throw new CreditPricingError("video_mode_not_supported", "当前视频模型不支持该生成模式。", 422);
  }
  const caps = getVideoParameterCapabilities(params.modelId, params.modeId, []);
  if (!caps.resolutions.includes(params.resolution)) {
    throw new CreditPricingError("video_resolution_not_supported", "当前视频模型不支持该分辨率。", 422);
  }
}

export async function quoteVideoCredits(
  supabase: SupabaseClient,
  input: VideoCreditQuoteInput,
): Promise<VideoCreditQuote> {
  assertSupportedVideoPriceShape(input);
  const billableSeconds = ceilBillableSeconds(input.durationSeconds);
  if (billableSeconds <= 0) {
    throw new CreditPricingError("video_duration_missing", "无法读取视频时长，无法计算本次积分消耗。", 422);
  }
  const { data, error } = await supabase
    .from("video_credit_prices")
    .select("model_id, mode_id, resolution, credits_per_second")
    .eq("model_id", input.modelId)
    .eq("mode_id", input.modeId)
    .eq("resolution", input.resolution)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new CreditPricingError(
      "video_price_not_configured",
      `当前视频模型价格未配置（${input.modelId} / ${input.modeId} / ${input.resolution}）。`,
      400,
    );
  }
  const row = data as { credits_per_second: unknown };
  const creditsPerSecond = Number(row.credits_per_second);
  if (!Number.isFinite(creditsPerSecond) || creditsPerSecond <= 0) {
    throw new CreditPricingError("video_price_invalid", "当前视频模型价格无效，请联系管理员。", 400);
  }
  const credits = billableSeconds * creditsPerSecond;
  const provider = getVideoModelDefinition(input.modelId).provider;
  const cost = await findVideoProviderCost(supabase, {
    modelId: input.modelId,
    modeId: input.modeId,
    resolution: input.resolution,
  });
  const margin = estimateMarginFromCost({
    credits,
    currency: cost?.cost_currency,
    unit: "second",
    costPerUnitMinor: cost?.cost_per_unit_minor,
    quantity: billableSeconds,
    source: cost?.source ?? "manual",
    provider: cost?.provider ?? provider,
    costPriceId: cost?.id,
    metadata: cost?.metadata,
  });
  return {
    feature: input.feature,
    modelId: input.modelId,
    modeId: input.modeId,
    resolution: input.resolution,
    billableSeconds,
    creditsPerSecond,
    minimumCredits: 0,
    credits,
    priceSnapshot: {
      kind: "video",
      feature: input.feature,
      modelId: input.modelId,
      modeId: input.modeId,
      resolution: input.resolution,
      billableSeconds,
      requestedDurationSeconds: input.durationSeconds,
      creditsPerSecond,
      credits,
    },
    costSnapshot: margin.costSnapshot,
    estimatedMarginCredits: margin.estimatedMarginCredits,
    estimatedMarginPercent: margin.estimatedMarginPercent,
    marginStatus: margin.marginStatus,
  };
}
