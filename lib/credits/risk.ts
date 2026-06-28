import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class CreditRiskError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 429) {
    super(message);
    this.name = "CreditRiskError";
    this.code = code;
    this.status = status;
  }
}

function missingTable(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /schema cache|does not exist|PGRST205|credit_account_flags|credit_risk_events/i.test(error.message));
}

export async function assertCreditGenerationAllowed(userId: string) {
  const admin = createSupabaseAdminClient();
  const flags = await admin
    .from("credit_account_flags")
    .select("id,flag_type")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("flag_type", ["generation_hold", "billing_hold"])
    .limit(1);
  if (flags.error && !missingTable(flags.error)) throw flags.error;
  if (!flags.error && (flags.data?.length ?? 0) > 0) {
    throw new CreditRiskError("account_restricted", "当前账号存在风控限制，请联系管理员。", 403);
  }

  const pending = await admin
    .from("credit_reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");
  if (pending.error) throw pending.error;
  if ((pending.count ?? 0) >= 3) {
    throw new CreditRiskError("too_many_pending_generations", "当前账号同时生成任务过多，请等待已有任务完成。", 429);
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await admin
    .from("credit_reservations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", tenMinutesAgo);
  if (recent.error) throw recent.error;
  if ((recent.count ?? 0) >= 20) {
    throw new CreditRiskError("too_many_generation_requests", "生成请求过于频繁，请稍后再试。", 429);
  }
}

export async function hasOpenRefundRisk(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const risk = await admin
    .from("credit_risk_events")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "open")
    .in("risk_type", ["refund_review", "dispute_review", "bad_debt"])
    .limit(1);
  if (risk.error && missingTable(risk.error)) return false;
  if (risk.error) throw risk.error;
  return (risk.data?.length ?? 0) > 0;
}
