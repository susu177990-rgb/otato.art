import type {
  CreditAccount,
  CreditLedgerEntry,
  CreditOrder,
  CreditPackage,
  CreditReservation,
} from "./types";

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function mapCreditAccount(row: Record<string, unknown>): CreditAccount {
  return {
    accountId: String(row.account_id ?? ""),
    userId: String(row.user_id ?? ""),
    availableCredits: num(row.available_credits),
    reservedCredits: num(row.reserved_credits),
    lifetimePurchasedCredits: num(row.lifetime_purchased_credits),
    lifetimeBonusCredits: num(row.lifetime_bonus_credits),
    lifetimeSpentCredits: num(row.lifetime_spent_credits),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapLedgerEntry(row: Record<string, unknown>): CreditLedgerEntry {
  return {
    id: String(row.id ?? ""),
    accountId: String(row.account_id ?? ""),
    userId: String(row.user_id ?? ""),
    entryType: String(row.entry_type ?? ""),
    amountCredits: num(row.amount_credits),
    availableDeltaCredits: num(row.available_delta_credits),
    reservedDeltaCredits: num(row.reserved_delta_credits),
    availableBalanceAfter: num(row.available_balance_after),
    reservedBalanceAfter: num(row.reserved_balance_after),
    totalBalanceAfter: num(row.total_balance_after),
    relatedReservationId: typeof row.related_reservation_id === "string" ? row.related_reservation_id : null,
    relatedOrderId: typeof row.related_order_id === "string" ? row.related_order_id : null,
    relatedGenerationId: typeof row.related_generation_id === "string" ? row.related_generation_id : null,
    metadata: jsonObject(row.metadata),
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapCreditPackage(row: Record<string, unknown>): CreditPackage {
  return {
    id: String(row.id ?? ""),
    label: String(row.label ?? ""),
    currency: String(row.currency ?? "usd"),
    amountCents: num(row.amount_cents),
    credits: num(row.credits),
    bonusCredits: num(row.bonus_credits),
    enabled: Boolean(row.enabled),
    sortOrder: num(row.sort_order),
    metadata: jsonObject(row.metadata),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapCreditOrder(row: Record<string, unknown>): CreditOrder {
  return {
    id: String(row.id ?? ""),
    accountId: String(row.account_id ?? ""),
    userId: String(row.user_id ?? ""),
    packageId: typeof row.package_id === "string" ? row.package_id : null,
    provider: row.provider === "manual" ? "manual" : "stripe",
    providerOrderId: typeof row.provider_order_id === "string" ? row.provider_order_id : null,
    status: String(row.status ?? "pending") as CreditOrder["status"],
    currency: String(row.currency ?? "usd"),
    amountCents: num(row.amount_cents),
    credits: num(row.credits),
    bonusCredits: num(row.bonus_credits),
    metadata: jsonObject(row.metadata),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    paidAt: typeof row.paid_at === "string" ? row.paid_at : null,
  };
}

export function mapCreditReservation(row: Record<string, unknown>): CreditReservation {
  return {
    id: String(row.id ?? ""),
    accountId: String(row.account_id ?? ""),
    userId: String(row.user_id ?? ""),
    status: String(row.status ?? "pending") as CreditReservation["status"],
    reservedCredits: num(row.reserved_credits),
    capturedCredits: row.captured_credits == null ? null : num(row.captured_credits),
    feature: String(row.feature ?? "image") as CreditReservation["feature"],
    modelId: String(row.model_id ?? ""),
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    requestId: String(row.request_id ?? ""),
    priceSnapshot: jsonObject(row.price_snapshot),
    costSnapshot: jsonObject(row.cost_snapshot),
    estimatedMarginCredits: row.estimated_margin_credits == null ? null : num(row.estimated_margin_credits),
    estimatedMarginPercent: row.estimated_margin_percent == null ? null : num(row.estimated_margin_percent),
    metadata: jsonObject(row.metadata),
    resultRef: typeof row.result_ref === "string" ? row.result_ref : null,
    failureReason: typeof row.failure_reason === "string" ? row.failure_reason : null,
    expiresAt: String(row.expires_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
