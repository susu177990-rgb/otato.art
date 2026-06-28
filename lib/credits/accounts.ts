import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mapCreditAccount,
  mapCreditOrder,
  mapCreditReservation,
  mapLedgerEntry,
} from "./rows";
import type {
  CreditAccount,
  CreditBalanceSnapshot,
  CreditLedgerEntry,
  CreditOrder,
  CreditQuote,
  CreditReservation,
} from "./types";

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function ensureCreditAccount(userId: string): Promise<CreditAccount> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("ensure_credit_account", { p_user_id: userId });
  if (error) throw error;
  return mapCreditAccount(row(data));
}

export async function grantWelcomeCreditsIfEligible(user: User): Promise<void> {
  if (!user.email_confirmed_at) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("grant_welcome_credits", {
    p_target_user_id: user.id,
    p_amount: 300,
    p_reason: "邮箱验证注册送积分",
  });
  if (error && !/grant_welcome_credits|schema cache|does not exist|PGRST202|PGRST205/i.test(error.message)) {
    throw error;
  }
}

export async function getCreditAccountForUser(supabase: SupabaseClient, userId: string): Promise<CreditAccount | null> {
  const { data, error } = await supabase
    .from("credit_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCreditAccount(row(data)) : null;
}

export async function getCreditBalanceSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<CreditBalanceSnapshot> {
  let account = await getCreditAccountForUser(supabase, userId);
  if (!account) account = await ensureCreditAccount(userId);
  const [ledger, orders] = await Promise.all([
    supabase
      .from("credit_ledger_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("credit_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (ledger.error) throw ledger.error;
  if (orders.error) throw orders.error;
  return {
    account,
    recentLedger: (ledger.data ?? []).map((item) => mapLedgerEntry(row(item))),
    recentOrders: (orders.data ?? []).map((item) => mapCreditOrder(row(item))),
  };
}

export async function reserveCreditsForQuote(params: {
  userId: string;
  projectId?: string | null;
  requestId: string;
  quote: CreditQuote;
  metadata?: Record<string, unknown>;
}): Promise<CreditReservation> {
  const admin = createSupabaseAdminClient();
  const account = await ensureCreditAccount(params.userId);
  const { data, error } = await admin.rpc("reserve_credits", {
    p_account_id: account.accountId,
    p_request_id: params.requestId,
    p_amount: params.quote.credits,
    p_feature: params.quote.feature,
    p_model_id: params.quote.modelId,
    p_project_id: params.projectId ?? null,
    p_price_snapshot: params.quote.priceSnapshot,
    p_cost_snapshot: params.quote.costSnapshot,
    p_estimated_margin_credits: params.quote.estimatedMarginCredits,
    p_estimated_margin_percent: params.quote.estimatedMarginPercent,
    p_metadata: params.metadata ?? {},
    p_expires_at: null,
  });
  if (error) throw error;
  return mapCreditReservation(row(data));
}

export async function captureCreditReservation(params: {
  reservationId: string;
  resultRef?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CreditReservation> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("capture_credit_reservation", {
    p_reservation_id: params.reservationId,
    p_result_ref: params.resultRef ?? null,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw error;
  return mapCreditReservation(row(data));
}

export async function releaseCreditReservation(params: {
  reservationId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditReservation> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("release_credit_reservation", {
    p_reservation_id: params.reservationId,
    p_reason: params.reason,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw error;
  return mapCreditReservation(row(data));
}

export async function getLedgerForUser(params: {
  userId: string;
  limit?: number;
}): Promise<CreditLedgerEntry[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_ledger_entries")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, params.limit ?? 50)));
  if (error) throw error;
  return (data ?? []).map((item) => mapLedgerEntry(row(item)));
}

export async function getReservationsForUser(params: {
  userId: string;
  limit?: number;
}): Promise<CreditReservation[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_reservations")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, params.limit ?? 50)));
  if (error) throw error;
  return (data ?? []).map((item) => mapCreditReservation(row(item)));
}

export async function getOrdersForUser(params: {
  userId: string;
  limit?: number;
}): Promise<CreditOrder[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_orders")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, params.limit ?? 50)));
  if (error) throw error;
  return (data ?? []).map((item) => mapCreditOrder(row(item)));
}
