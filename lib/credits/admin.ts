import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminActor } from "@/lib/admin/types";
import { writeAuditLog } from "@/lib/admin/user-management";
import { IMAGE_MODEL_ORDER, type GptImageQuality, type ImageModelId, type ImageSizeTier } from "@/lib/image-workspace";
import {
  DISABLED_VIDEO_MODEL_IDS,
  VIDEO_GENERATION_MODES,
  VIDEO_MODEL_ORDER,
  getVideoModelDefinition,
  getVideoParameterCapabilities,
  isVideoModelModeSupported,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";
import {
  HARD_MARGIN_FLOOR_PERCENT,
  MINIMUM_COST_MULTIPLIER,
  estimateMarginFromCost,
  type MarginStatus,
} from "./margins";
import { mapCreditAccount, mapCreditOrder, mapCreditPackage, mapCreditReservation, mapLedgerEntry } from "./rows";
import type { CreditAccount, CreditLedgerEntry, CreditOrder, CreditPackage, CreditReservation } from "./types";

export type ImageCreditPriceRow = {
  id?: string;
  modelId: ImageModelId;
  sizeTier: ImageSizeTier;
  gptQuality: GptImageQuality | null;
  credits: number;
  enabled: boolean;
  costPerUnitMinor: number;
  costCurrency: string;
  costSource: "manual" | "invoice" | "estimated";
  marginPercent: number | null;
  marginStatus: MarginStatus;
};

export type VideoCreditPriceRow = {
  id?: string;
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
  creditsPerSecond: number;
  minimumCredits: number;
  enabled: boolean;
  costPerUnitMinor: number;
  costCurrency: string;
  costSource: "manual" | "invoice" | "estimated";
  marginPercent: number | null;
  marginStatus: MarginStatus;
};

type ProviderCostPriceRow = {
  id?: string;
  feature: "image" | "video";
  provider: string;
  modelId: string;
  modeId: string | null;
  resolution: string | null;
  sizeTier: string | null;
  gptQuality: string | null;
  costCurrency: string;
  costPerUnitMinor: number;
  unit: "image" | "second";
  source: "manual" | "invoice" | "estimated";
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

type ProviderCostUpsertRow = {
  feature: "image" | "video";
  provider: string;
  model_id: string;
  mode_id: string | null;
  resolution: string | null;
  size_tier: string | null;
  gpt_quality: string | null;
  cost_currency: string;
  cost_per_unit_minor: number;
  unit: "image" | "second";
  source: "manual" | "invoice" | "estimated";
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cleanCurrency(value: unknown): string {
  const raw = String(value ?? "cny").trim().toLowerCase();
  return /^[a-z]{3}$/.test(raw) ? raw : "cny";
}

function cleanCostSource(value: unknown): "manual" | "invoice" | "estimated" {
  return value === "invoice" || value === "estimated" ? value : "manual";
}

function imageProvider(modelId: ImageModelId): string {
  if (modelId === "gpt-image-2") return "openai";
  if (modelId === "grok-imagine-i2i") return "grok";
  if (modelId === "z-image") return "z-image";
  return "nano-banana";
}

export function imagePriceCombos(): Array<Omit<ImageCreditPriceRow, "credits" | "enabled" | "costPerUnitMinor" | "costCurrency" | "costSource" | "marginPercent" | "marginStatus">> {
  const sizes: ImageSizeTier[] = ["1K", "2K", "4K"];
  const qualities: GptImageQuality[] = ["low", "medium", "high"];
  const out: Array<Omit<ImageCreditPriceRow, "credits" | "enabled" | "costPerUnitMinor" | "costCurrency" | "costSource" | "marginPercent" | "marginStatus">> = [];
  for (const modelId of IMAGE_MODEL_ORDER) {
    for (const sizeTier of sizes) {
      if (modelId === "gpt-image-2") {
        for (const gptQuality of qualities) out.push({ modelId, sizeTier, gptQuality });
      } else {
        out.push({ modelId, sizeTier, gptQuality: null });
      }
    }
  }
  return out;
}

export function videoPriceCombos(): Array<Omit<VideoCreditPriceRow, "creditsPerSecond" | "minimumCredits" | "enabled" | "costPerUnitMinor" | "costCurrency" | "costSource" | "marginPercent" | "marginStatus">> {
  const out: Array<Omit<VideoCreditPriceRow, "creditsPerSecond" | "minimumCredits" | "enabled" | "costPerUnitMinor" | "costCurrency" | "costSource" | "marginPercent" | "marginStatus">> = [];
  for (const modelId of VIDEO_MODEL_ORDER) {
    if (DISABLED_VIDEO_MODEL_IDS.has(modelId)) continue;
    for (const mode of VIDEO_GENERATION_MODES) {
      if (!isVideoModelModeSupported(modelId, mode.id)) continue;
      const caps = getVideoParameterCapabilities(modelId, mode.id, []);
      for (const resolution of caps.resolutions) {
        out.push({ modelId, modeId: mode.id, resolution });
      }
    }
  }
  return out;
}

function mapImagePrice(item: Record<string, unknown>): ImageCreditPriceRow {
  const credits = num(item.credits);
  const costPerUnitMinor = num(item.cost_per_unit_minor ?? item.costPerUnitMinor);
  const margin = estimateMarginFromCost({
    credits,
    costPerUnitMinor,
    unit: "image",
    currency: cleanCurrency(item.cost_currency ?? item.costCurrency),
    source: cleanCostSource(item.cost_source ?? item.costSource),
  });
  return {
    id: typeof item.id === "string" ? item.id : undefined,
    modelId: String(item.model_id ?? "gpt-image-2") as ImageModelId,
    sizeTier: String(item.size_tier ?? "1K") as ImageSizeTier,
    gptQuality: item.gpt_quality === "low" || item.gpt_quality === "medium" || item.gpt_quality === "high"
      ? item.gpt_quality
      : null,
    credits,
    enabled: Boolean(item.enabled),
    costPerUnitMinor,
    costCurrency: cleanCurrency(item.cost_currency ?? item.costCurrency),
    costSource: cleanCostSource(item.cost_source ?? item.costSource),
    marginPercent: margin.estimatedMarginPercent,
    marginStatus: margin.marginStatus,
  };
}

function mapVideoPrice(item: Record<string, unknown>): VideoCreditPriceRow {
  const creditsPerSecond = num(item.credits_per_second);
  const costPerUnitMinor = num(item.cost_per_unit_minor ?? item.costPerUnitMinor);
  const margin = estimateMarginFromCost({
    credits: creditsPerSecond,
    costPerUnitMinor,
    unit: "second",
    currency: cleanCurrency(item.cost_currency ?? item.costCurrency),
    source: cleanCostSource(item.cost_source ?? item.costSource),
  });
  return {
    id: typeof item.id === "string" ? item.id : undefined,
    modelId: String(item.model_id ?? "seedance-2.0") as VideoModelId,
    modeId: String(item.mode_id ?? "text_to_video") as VideoGenerationModeId,
    resolution: String(item.resolution ?? "720p") as VideoResolution,
    creditsPerSecond,
    minimumCredits: num(item.minimum_credits),
    enabled: Boolean(item.enabled),
    costPerUnitMinor,
    costCurrency: cleanCurrency(item.cost_currency ?? item.costCurrency),
    costSource: cleanCostSource(item.cost_source ?? item.costSource),
    marginPercent: margin.estimatedMarginPercent,
    marginStatus: margin.marginStatus,
  };
}

function mapProviderCost(item: Record<string, unknown>): ProviderCostPriceRow {
  return {
    id: typeof item.id === "string" ? item.id : undefined,
    feature: item.feature === "video" ? "video" : "image",
    provider: String(item.provider ?? ""),
    modelId: String(item.model_id ?? ""),
    modeId: typeof item.mode_id === "string" ? item.mode_id : null,
    resolution: typeof item.resolution === "string" ? item.resolution : null,
    sizeTier: typeof item.size_tier === "string" ? item.size_tier : null,
    gptQuality: typeof item.gpt_quality === "string" ? item.gpt_quality : null,
    costCurrency: cleanCurrency(item.cost_currency),
    costPerUnitMinor: num(item.cost_per_unit_minor),
    unit: item.unit === "second" ? "second" : "image",
    source: cleanCostSource(item.source),
    enabled: Boolean(item.enabled),
    metadata: row(item.metadata),
  };
}

function imageCostKey(item: Pick<ProviderCostPriceRow, "feature" | "modelId" | "sizeTier" | "gptQuality">): string {
  return `${item.feature}:${item.modelId}:${item.sizeTier ?? ""}:${item.gptQuality ?? "standard"}`;
}

function videoCostKey(item: Pick<ProviderCostPriceRow, "feature" | "modelId" | "modeId" | "resolution">): string {
  return `${item.feature}:${item.modelId}:${item.modeId ?? ""}:${item.resolution ?? ""}`;
}

export async function listCreditPricing(): Promise<{
  imagePrices: ImageCreditPriceRow[];
  videoPrices: VideoCreditPriceRow[];
}> {
  const admin = createSupabaseAdminClient();
  const [image, video] = await Promise.all([
    admin.from("image_credit_prices").select("*").order("model_id").order("size_tier").order("gpt_quality"),
    admin.from("video_credit_prices").select("*").order("model_id").order("mode_id").order("resolution"),
  ]);
  if (image.error) throw image.error;
  if (video.error) throw video.error;
  const costs = await admin
    .from("provider_cost_prices")
    .select("*")
    .eq("enabled", true)
    .order("effective_from", { ascending: false });
  if (costs.error && !/provider_cost_prices|schema cache|does not exist|PGRST205/i.test(costs.error.message)) {
    throw costs.error;
  }
  const costRows = costs.error ? [] : (costs.data ?? []).map((item) => mapProviderCost(row(item)));
  const imageCostByKey = new Map(
    costRows
      .filter((item) => item.feature === "image")
      .map((item) => [imageCostKey(item), item]),
  );
  const videoCostByKey = new Map(
    costRows
      .filter((item) => item.feature === "video")
      .map((item) => [videoCostKey(item), item]),
  );
  return {
    imagePrices: (image.data ?? []).map((item) => {
      const mapped = mapImagePrice(row(item));
      const cost = imageCostByKey.get(imageCostKey({
        feature: "image",
        modelId: mapped.modelId,
        sizeTier: mapped.sizeTier,
        gptQuality: mapped.gptQuality,
      }));
      return cost ? mapImagePrice({ ...row(item), cost_per_unit_minor: cost.costPerUnitMinor, cost_currency: cost.costCurrency, cost_source: cost.source }) : mapped;
    }),
    videoPrices: (video.data ?? []).map((item) => {
      const mapped = mapVideoPrice(row(item));
      const cost = videoCostByKey.get(videoCostKey({
        feature: "video",
        modelId: mapped.modelId,
        modeId: mapped.modeId,
        resolution: mapped.resolution,
      }));
      return cost ? mapVideoPrice({ ...row(item), cost_per_unit_minor: cost.costPerUnitMinor, cost_currency: cost.costCurrency, cost_source: cost.source }) : mapped;
    }),
  };
}

function validateImagePrice(input: ImageCreditPriceRow): ImageCreditPriceRow {
  if (!IMAGE_MODEL_ORDER.includes(input.modelId)) throw new Error("图片模型无效");
  if (!["1K", "2K", "4K"].includes(input.sizeTier)) throw new Error("图片尺寸无效");
  if (input.modelId === "gpt-image-2" && !(input.gptQuality === "low" || input.gptQuality === "medium" || input.gptQuality === "high")) {
    throw new Error("GPT Image 2 必须配置 low / medium / high 质量价格");
  }
  if (input.modelId !== "gpt-image-2" && input.gptQuality !== null) throw new Error("非 GPT 图片模型不能配置质量档");
  const credits = Math.floor(Number(input.credits));
  if (!Number.isFinite(credits) || credits <= 0) throw new Error("图片价格必须大于 0");
  return {
    ...input,
    credits,
    costPerUnitMinor: Math.max(0, Math.floor(Number(input.costPerUnitMinor ?? 0))),
    costCurrency: cleanCurrency(input.costCurrency),
    costSource: cleanCostSource(input.costSource),
    marginPercent: null,
    marginStatus: "cost_missing",
  };
}

function validateVideoPrice(input: VideoCreditPriceRow): VideoCreditPriceRow {
  if (DISABLED_VIDEO_MODEL_IDS.has(input.modelId) || !isVideoModelModeSupported(input.modelId, input.modeId)) {
    throw new Error("视频模型或模式无效");
  }
  const caps = getVideoParameterCapabilities(input.modelId, input.modeId, []);
  if (!caps.resolutions.includes(input.resolution)) throw new Error("视频分辨率无效");
  const creditsPerSecond = Math.floor(Number(input.creditsPerSecond));
  if (!Number.isFinite(creditsPerSecond) || creditsPerSecond <= 0) throw new Error("视频每秒价格必须大于 0");
  return {
    ...input,
    creditsPerSecond,
    minimumCredits: 0,
    costPerUnitMinor: Math.max(0, Math.floor(Number(input.costPerUnitMinor ?? 0))),
    costCurrency: cleanCurrency(input.costCurrency),
    costSource: cleanCostSource(input.costSource),
    marginPercent: null,
    marginStatus: "cost_missing",
  };
}

function assertMarginSaveAllowed(params: {
  actor: AdminActor;
  allowLowMarginOverride?: boolean;
  rows: Array<{ kind: "image" | "video"; key: string; credits: number; costPerUnitMinor: number; costCurrency: string; quantity: number }>;
}) {
  const underMultiplier = params.rows.filter((item) => {
    if (item.costPerUnitMinor <= 0) return false;
    if (cleanCurrency(item.costCurrency) !== "cny") return false;
    return item.credits < item.costPerUnitMinor * MINIMUM_COST_MULTIPLIER;
  });
  if (underMultiplier.length > 0) {
    const sample = underMultiplier.slice(0, 3).map((item) => `${item.key} 售价 ${item.credits} / 成本 ${item.costPerUnitMinor}`).join("；");
    throw new Error(`售价必须至少是成本的 ${MINIMUM_COST_MULTIPLIER} 倍：${sample}`);
  }

  const blocked = params.rows
    .map((item) => ({
      ...item,
      margin: estimateMarginFromCost({
        credits: item.credits,
        costPerUnitMinor: item.costPerUnitMinor,
        currency: item.costCurrency,
        quantity: item.quantity,
        unit: item.kind === "image" ? "image" : "second",
      }),
    }))
    .filter((item) => item.costPerUnitMinor > 0 && item.margin.estimatedMarginPercent != null && item.margin.estimatedMarginPercent < HARD_MARGIN_FLOOR_PERCENT);
  if (blocked.length === 0) return;
  if (params.actor.role === "owner" && params.allowLowMarginOverride) return;
  const sample = blocked.slice(0, 3).map((item) => `${item.key} ${item.margin.estimatedMarginPercent}%`).join("；");
  throw new Error(`毛利低于 ${HARD_MARGIN_FLOOR_PERCENT}% 的价格不能保存：${sample}`);
}

async function upsertProviderCostPrices(admin: SupabaseClient, params: {
  imagePrices: ImageCreditPriceRow[];
  videoPrices: VideoCreditPriceRow[];
}) {
  const rows: ProviderCostUpsertRow[] = [
    ...params.imagePrices.map((item) => ({
      feature: "image" as const,
      provider: imageProvider(item.modelId),
      model_id: item.modelId,
      mode_id: null,
      resolution: null,
      size_tier: item.sizeTier,
      gpt_quality: item.gptQuality,
      cost_currency: cleanCurrency(item.costCurrency),
      cost_per_unit_minor: Math.max(0, Math.floor(Number(item.costPerUnitMinor ?? 0))),
      unit: "image" as const,
      source: cleanCostSource(item.costSource),
      enabled: Math.max(0, Math.floor(Number(item.costPerUnitMinor ?? 0))) > 0,
    })),
    ...params.videoPrices.map((item) => ({
      feature: "video" as const,
      provider: getVideoModelDefinition(item.modelId).provider,
      model_id: item.modelId,
      mode_id: item.modeId,
      resolution: item.resolution,
      size_tier: null,
      gpt_quality: null,
      cost_currency: cleanCurrency(item.costCurrency),
      cost_per_unit_minor: Math.max(0, Math.floor(Number(item.costPerUnitMinor ?? 0))),
      unit: "second" as const,
      source: cleanCostSource(item.costSource),
      enabled: Math.max(0, Math.floor(Number(item.costPerUnitMinor ?? 0))) > 0,
    })),
  ];
  if (rows.length === 0) return;
  for (const item of rows) {
    let update = admin
      .from("provider_cost_prices")
      .update({
        provider: item.provider,
        cost_currency: item.cost_currency,
        cost_per_unit_minor: item.cost_per_unit_minor,
        source: item.source,
        enabled: item.enabled,
      })
      .eq("feature", item.feature)
      .eq("model_id", item.model_id)
      .eq("unit", item.unit);
    update = item.mode_id ? update.eq("mode_id", item.mode_id) : update.is("mode_id", null);
    update = item.resolution ? update.eq("resolution", item.resolution) : update.is("resolution", null);
    update = item.size_tier ? update.eq("size_tier", item.size_tier) : update.is("size_tier", null);
    update = item.gpt_quality ? update.eq("gpt_quality", item.gpt_quality) : update.is("gpt_quality", null);
    const updated = await update.select("id").maybeSingle();
    if (updated.error) {
      if (/provider_cost_prices|schema cache|does not exist|PGRST205/i.test(updated.error.message)) return;
      throw updated.error;
    }
    if (!updated.data) {
      const { error } = await admin.from("provider_cost_prices").insert(item as never);
      if (error) {
        if (/provider_cost_prices|schema cache|does not exist|PGRST205/i.test(error.message)) return;
        throw error;
      }
    }
  }
}

export async function saveCreditPricing(params: {
  actor: AdminActor;
  imagePrices: ImageCreditPriceRow[];
  videoPrices: VideoCreditPriceRow[];
  allowLowMarginOverride?: boolean;
}): Promise<Awaited<ReturnType<typeof listCreditPricing>>> {
  const admin = createSupabaseAdminClient();
  const validImages = params.imagePrices.map(validateImagePrice);
  const validVideos = params.videoPrices.map(validateVideoPrice);
  assertMarginSaveAllowed({
    actor: params.actor,
    allowLowMarginOverride: params.allowLowMarginOverride,
    rows: [
      ...validImages.map((item) => ({
        kind: "image" as const,
        key: `${item.modelId}/${item.sizeTier}/${item.gptQuality ?? "standard"}`,
        credits: item.credits,
        costPerUnitMinor: item.costPerUnitMinor,
        costCurrency: item.costCurrency,
        quantity: 1,
      })),
      ...validVideos.map((item) => ({
        kind: "video" as const,
        key: `${item.modelId}/${item.modeId}/${item.resolution}`,
        credits: item.creditsPerSecond,
        costPerUnitMinor: item.costPerUnitMinor,
        costCurrency: item.costCurrency,
        quantity: 1,
      })),
    ],
  });
  const imageRows = validImages.map((item) => ({
    model_id: item.modelId,
    size_tier: item.sizeTier,
    gpt_quality: item.gptQuality,
    credits: item.credits,
    enabled: item.enabled,
  }));
  const videoRows = validVideos.map((item) => ({
    model_id: item.modelId,
    mode_id: item.modeId,
    resolution: item.resolution,
    credits_per_second: item.creditsPerSecond,
    minimum_credits: 0,
    enabled: item.enabled,
  }));

  for (const item of imageRows) {
    let update = admin
      .from("image_credit_prices")
      .update({
        credits: item.credits,
        enabled: item.enabled,
      })
      .eq("model_id", item.model_id)
      .eq("size_tier", item.size_tier);
    update = item.gpt_quality ? update.eq("gpt_quality", item.gpt_quality) : update.is("gpt_quality", null);
    const updated = await update.select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) {
      const { error } = await admin.from("image_credit_prices").insert(item);
      if (error) throw error;
    }
  }
  if (videoRows.length > 0) {
    const { error } = await admin.from("video_credit_prices").upsert(videoRows, {
      onConflict: "model_id,mode_id,resolution",
    });
    if (error) throw error;
  }
  await upsertProviderCostPrices(admin, { imagePrices: validImages, videoPrices: validVideos });
  await writeAuditLog(admin, {
    actor: params.actor,
    action: "credits.pricing.save",
    metadata: {
      imageRows: imageRows.length,
      videoRows: videoRows.length,
      allowLowMarginOverride: Boolean(params.allowLowMarginOverride),
    },
  });
  return listCreditPricing();
}

export async function listCreditPackages(admin: SupabaseClient = createSupabaseAdminClient()): Promise<CreditPackage[]> {
  const { data, error } = await admin
    .from("credit_packages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((item) => mapCreditPackage(row(item)));
}

export async function saveCreditPackages(params: {
  actor: AdminActor;
  packages: CreditPackage[];
}): Promise<CreditPackage[]> {
  const admin = createSupabaseAdminClient();
  const rows = params.packages.map((item) => ({
    id: String(item.id).trim(),
    label: String(item.label).trim(),
    currency: cleanCurrency(item.currency),
    amount_cents: Math.floor(Number(item.amountCents)),
    credits: Math.floor(Number(item.credits)),
    bonus_credits: Math.max(0, Math.floor(Number(item.bonusCredits ?? 0))),
    enabled: Boolean(item.enabled),
    sort_order: Math.floor(Number(item.sortOrder ?? 0)),
    metadata: item.metadata ?? {},
  })).filter((item) => item.id && item.label && item.amount_cents > 0 && item.credits > 0);
  if (rows.length > 0) {
    const { error } = await admin.from("credit_packages").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  await writeAuditLog(admin, {
    actor: params.actor,
    action: "credits.packages.save",
    metadata: { rows: rows.length },
  });
  return listCreditPackages(admin);
}

export async function listAdminCreditOrders(limit = 100): Promise<CreditOrder[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw error;
  return (data ?? []).map((item) => mapCreditOrder(row(item)));
}

export async function listAdminCreditLedger(limit = 100): Promise<CreditLedgerEntry[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_ledger_entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw error;
  return (data ?? []).map((item) => mapLedgerEntry(row(item)));
}

export async function listAdminCreditReservations(limit = 100): Promise<CreditReservation[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_reservations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw error;
  return (data ?? []).map((item) => mapCreditReservation(row(item)));
}

export async function getCreditAccountByUserId(userId: string): Promise<CreditAccount | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("credit_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapCreditAccount(row(data)) : null;
}

export async function adminAdjustCredits(params: {
  actor: AdminActor;
  targetUserId: string;
  targetEmail?: string | null;
  amountCredits: number;
  reason: string;
  type: "manual_topup" | "bonus" | "compensation" | "deduction" | "refund";
}): Promise<{ account: CreditAccount; entry: CreditLedgerEntry }> {
  const admin = createSupabaseAdminClient();
  const before = await getCreditAccountByUserId(params.targetUserId);
  const amount = Math.trunc(Number(params.amountCredits));
  if (!Number.isFinite(amount) || amount === 0) throw new Error("积分数量必须是非零整数");
  const reason = params.reason.trim();
  if (!reason) throw new Error("原因必填");
  const { data, error } = await admin.rpc("admin_adjust_credits", {
    p_target_user_id: params.targetUserId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: { type: params.type, actorId: params.actor.id, actorEmail: params.actor.email },
  });
  if (error) throw error;
  const account = await getCreditAccountByUserId(params.targetUserId);
  if (!account) throw new Error("积分账户创建失败");
  const entry = mapLedgerEntry(row(data));
  await writeAuditLog(admin, {
    actor: params.actor,
    action: "credits.user.adjust",
    targetUserId: params.targetUserId,
    targetEmail: params.targetEmail ?? null,
    metadata: {
      type: params.type,
      reason,
      amountCredits: amount,
      before,
      after: account,
      ledgerEntryId: entry.id,
    },
  });
  return { account, entry };
}
