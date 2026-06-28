import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revenueCentsForCredits } from "./margins";

type JsonObject = Record<string, unknown>;

function row(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function todayStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function money(value: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value / 100);
}

function credits(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

function costCentsFromSnapshot(value: unknown): number {
  const snapshot = row(value);
  if (snapshot.costMissing) return 0;
  if (snapshot.currency && !["cny", "usd"].includes(String(snapshot.currency).toLowerCase())) return 0;
  return num(snapshot.totalCostMinor);
}

function billableSecondsFromSnapshot(value: unknown): number | null {
  const snapshot = row(value);
  const seconds = num(snapshot.billableSeconds);
  return seconds > 0 ? seconds : null;
}

export async function getCreditBusinessDashboard() {
  const admin = createSupabaseAdminClient();
  const today = todayStartIso();
  const [orders, ledger, accounts, reservations, riskEvents] = await Promise.all([
    admin
      .from("credit_orders")
      .select("id,user_id,status,amount_cents,currency,credits,bonus_credits,created_at,paid_at")
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("credit_ledger_entries")
      .select("entry_type,amount_credits,created_at")
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("credit_accounts")
      .select("available_credits,reserved_credits"),
    admin
      .from("credit_reservations")
      .select("id,status,feature,model_id,reserved_credits,captured_credits,price_snapshot,cost_snapshot,estimated_margin_percent,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("credit_risk_events")
      .select("id,risk_type,status,severity,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  for (const result of [orders, ledger, accounts, reservations]) {
    if (result.error) throw result.error;
  }
  if (riskEvents.error && !/credit_risk_events|schema cache|does not exist|PGRST205/i.test(riskEvents.error.message)) {
    throw riskEvents.error;
  }

  const orderRows = orders.data ?? [];
  const paidOrders = orderRows.filter((item) => item.status === "paid");
  const todayRevenueCents = paidOrders.reduce((sum, item) => sum + num(item.amount_cents), 0);
  const todayGrantedCredits = paidOrders.reduce((sum, item) => sum + num(item.credits) + num(item.bonus_credits), 0);
  const todayConsumedCredits = (ledger.data ?? [])
    .filter((item) => item.entry_type === "reservation_captured")
    .reduce((sum, item) => sum + Math.abs(num(item.amount_credits)), 0);
  const outstandingCredits = (accounts.data ?? [])
    .reduce((sum, item) => sum + num(item.available_credits) + num(item.reserved_credits), 0);
  const reservationRows = (reservations.data ?? []).map(row);
  const todayReservations = reservationRows.filter((item) => Date.parse(String(item.updated_at ?? item.created_at ?? "")) >= Date.parse(today));
  const todayCostCents = todayReservations
    .filter((item) => item.status === "captured")
    .reduce((sum, item) => sum + costCentsFromSnapshot(item.cost_snapshot), 0);
  const todayGrossProfitCents = revenueCentsForCredits(todayConsumedCredits) - todayCostCents;
  const paidUserCount = new Set(paidOrders.map((item) => String(item.user_id))).size;
  const conversionBase = orderRows.length;
  const paymentConversion = conversionBase > 0 ? (paidOrders.length / conversionBase) * 100 : 0;
  const refundReviewCents = orderRows
    .filter((item) => item.status === "refund_review" || item.status === "refunded")
    .reduce((sum, item) => sum + num(item.amount_cents), 0);

  const modelMap = new Map<string, {
    modelId: string;
    revenueCredits: number;
    estimatedCostCents: number;
    marginWeighted: number;
    marginCount: number;
    capturedCount: number;
    failedCount: number;
    billableSeconds: number;
    billableCount: number;
  }>();
  for (const item of reservationRows) {
    const modelId = String(item.model_id ?? "unknown");
    const bucket = modelMap.get(modelId) ?? {
      modelId,
      revenueCredits: 0,
      estimatedCostCents: 0,
      marginWeighted: 0,
      marginCount: 0,
      capturedCount: 0,
      failedCount: 0,
      billableSeconds: 0,
      billableCount: 0,
    };
    if (item.status === "captured") {
      bucket.capturedCount += 1;
      bucket.revenueCredits += num(item.captured_credits ?? item.reserved_credits);
      bucket.estimatedCostCents += costCentsFromSnapshot(item.cost_snapshot);
      const margin = item.estimated_margin_percent == null ? null : num(item.estimated_margin_percent);
      if (margin != null && Number.isFinite(margin)) {
        bucket.marginWeighted += margin;
        bucket.marginCount += 1;
      }
      const seconds = billableSecondsFromSnapshot(item.price_snapshot);
      if (seconds != null) {
        bucket.billableSeconds += seconds;
        bucket.billableCount += 1;
      }
    } else if (item.status === "released" || item.status === "expired") {
      bucket.failedCount += 1;
    }
    modelMap.set(modelId, bucket);
  }

  return {
    metrics: [
      { label: "今日充值金额", value: money(todayRevenueCents) },
      { label: "今日到账积分", value: credits(todayGrantedCredits) },
      { label: "今日消耗积分", value: credits(todayConsumedCredits) },
      { label: "未消耗积分负债", value: credits(outstandingCredits) },
      { label: "预计供应商成本", value: money(todayCostCents) },
      { label: "预计毛利", value: money(todayGrossProfitCents), tone: todayGrossProfitCents < 0 ? "danger" : "normal" },
      { label: "付费用户数", value: credits(paidUserCount) },
      { label: "ARPPU", value: money(paidUserCount > 0 ? todayRevenueCents / paidUserCount : 0) },
      { label: "支付转化率", value: `${paymentConversion.toFixed(1)}%` },
      { label: "退款/争议金额", value: money(refundReviewCents), tone: refundReviewCents > 0 ? "warn" : "normal" },
    ],
    modelRows: Array.from(modelMap.values())
      .map((item) => ({
        modelId: item.modelId,
        revenueCredits: item.revenueCredits,
        estimatedCostCents: item.estimatedCostCents,
        estimatedMarginPercent: item.marginCount > 0 ? item.marginWeighted / item.marginCount : null,
        capturedCount: item.capturedCount,
        failedCount: item.failedCount,
        averageBillableSeconds: item.billableCount > 0 ? item.billableSeconds / item.billableCount : null,
      }))
      .sort((a, b) => a.estimatedMarginPercent == null ? 1 : b.estimatedMarginPercent == null ? -1 : a.estimatedMarginPercent - b.estimatedMarginPercent),
    riskEvents: (riskEvents.error ? [] : (riskEvents.data ?? [])).map((item) => ({
      id: String(item.id ?? ""),
      riskType: String(item.risk_type ?? ""),
      status: String(item.status ?? ""),
      severity: String(item.severity ?? ""),
      createdAt: String(item.created_at ?? ""),
    })),
  };
}
