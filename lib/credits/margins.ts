export const CREDIT_VALUE_CNY_FEN = 1;
export const TARGET_MARGIN_PERCENT = 55;
export const HARD_MARGIN_FLOOR_PERCENT = 35;
export const MINIMUM_COST_MULTIPLIER = 2;
export const MINIMUM_COST_MULTIPLIER_MARGIN_PERCENT = 50;

export type MarginStatus = "cost_missing" | "healthy" | "warning" | "blocked";

export type ProviderCostSnapshot = {
  costMissing: boolean;
  currency: string;
  unit: "image" | "second";
  costPerUnitMinor: number;
  quantity: number;
  totalCostMinor: number;
  source: "manual" | "invoice" | "estimated";
  provider?: string;
  costPriceId?: string;
  metadata?: Record<string, unknown>;
};

export type MarginEstimate = {
  costSnapshot: ProviderCostSnapshot;
  estimatedMarginCredits: number | null;
  estimatedMarginPercent: number | null;
  marginStatus: MarginStatus;
};

export function revenueCentsForCredits(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return credits * CREDIT_VALUE_CNY_FEN;
}

export function costCreditsEquivalent(costMinor: number): number {
  if (!Number.isFinite(costMinor) || costMinor <= 0) return 0;
  return Math.ceil(costMinor / CREDIT_VALUE_CNY_FEN);
}

export function marginStatus(percent: number | null): MarginStatus {
  if (percent == null || !Number.isFinite(percent)) return "cost_missing";
  if (percent < HARD_MARGIN_FLOOR_PERCENT) return "blocked";
  if (percent < TARGET_MARGIN_PERCENT) return "warning";
  return "healthy";
}

export function estimateMarginFromCost(params: {
  credits: number;
  currency?: string | null;
  unit: "image" | "second";
  costPerUnitMinor?: number | null;
  quantity?: number;
  source?: "manual" | "invoice" | "estimated" | null;
  provider?: string | null;
  costPriceId?: string | null;
  metadata?: Record<string, unknown> | null;
}): MarginEstimate {
  const costPerUnitMinor = Math.max(0, Math.floor(Number(params.costPerUnitMinor ?? 0)));
  const quantity = Math.max(1, Math.ceil(Number(params.quantity ?? 1)));
  const currency = String(params.currency || "cny").toLowerCase();
  const source = params.source ?? "manual";
  const totalCostMinor = costPerUnitMinor * quantity;
  const costMissing = costPerUnitMinor <= 0;
  const costSnapshot: ProviderCostSnapshot = {
    costMissing,
    currency,
    unit: params.unit,
    costPerUnitMinor,
    quantity,
    totalCostMinor,
    source,
    provider: params.provider ?? undefined,
    costPriceId: params.costPriceId ?? undefined,
    metadata: params.metadata ?? undefined,
  };
  if (costMissing) {
    return {
      costSnapshot,
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      marginStatus: "cost_missing",
    };
  }
  if (currency !== "cny" && currency !== "usd") {
    return {
      costSnapshot,
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      marginStatus: "cost_missing",
    };
  }

  const revenueMinor = revenueCentsForCredits(params.credits);
  const marginPercentValue = revenueMinor > 0 ? ((revenueMinor - totalCostMinor) / revenueMinor) * 100 : null;
  const marginCredits = params.credits - costCreditsEquivalent(totalCostMinor);
  return {
    costSnapshot,
    estimatedMarginCredits: marginCredits,
    estimatedMarginPercent: marginPercentValue == null ? null : Number(marginPercentValue.toFixed(2)),
    marginStatus: marginStatus(marginPercentValue),
  };
}

export function marginPercentFromCreditsAndCost(credits: number, costPerUnitMinor: number, quantity = 1): number | null {
  return estimateMarginFromCost({
    credits,
    costPerUnitMinor,
    quantity,
    unit: quantity === 1 ? "image" : "second",
  }).estimatedMarginPercent;
}
