import { requireAdmin } from "@/lib/api/admin-auth";
import { writeAuditLog } from "@/lib/admin/user-management";
import { adminAdjustCredits, getCreditAccountByUserId } from "@/lib/credits/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("credit_risk_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    const message = /credit_risk_events|schema cache|does not exist|PGRST205/i.test(error.message) ? "风险表尚未迁移" : error.message;
    return Response.json({ error: message }, { status: 500 });
  }
  return Response.json({ riskEvents: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as {
    eventId?: unknown;
    action?: unknown;
    note?: unknown;
    amountCredits?: unknown;
  };
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!eventId) return Response.json({ error: "缺少风险事件 ID" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("credit_risk_events").select("*").eq("id", eventId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "风险事件不存在" }, { status: 404 });
  const risk = row(data);
  const userId = typeof risk.user_id === "string" ? risk.user_id : "";
  try {
    if (action === "deduct_available") {
      if (!userId) throw new Error("风险事件缺少用户 ID");
      const account = await getCreditAccountByUserId(userId);
      const requested = Math.max(0, Math.floor(num(body.amountCredits || risk.credits)));
      const amount = Math.min(requested, account?.availableCredits ?? 0);
      if (amount <= 0) throw new Error("用户没有可扣回的可用积分，请标记坏账或仅备注");
      await adminAdjustCredits({
        actor: auth.actor,
        targetUserId: userId,
        amountCredits: -amount,
        reason: typeof body.note === "string" && body.note.trim() ? body.note.trim() : "退款/争议扣回剩余积分",
        type: "refund",
      });
      await admin
        .from("credit_risk_events")
        .update({
          status: amount < requested ? "bad_debt" : "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: auth.actor.id,
          metadata: {
            ...row(risk.metadata),
            action,
            requestedCredits: requested,
            deductedCredits: amount,
            note: body.note ?? null,
          },
        })
        .eq("id", eventId);
    } else if (action === "mark_bad_debt" || action === "note_only") {
      await admin
        .from("credit_risk_events")
        .update({
          status: action === "mark_bad_debt" ? "bad_debt" : "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: auth.actor.id,
          metadata: {
            ...row(risk.metadata),
            action,
            note: body.note ?? null,
          },
        })
        .eq("id", eventId);
    } else {
      return Response.json({ error: "未知风险处理动作" }, { status: 400 });
    }
    await writeAuditLog(auth.supabase, {
      actor: auth.actor,
      action: "credits.risk_event.resolve",
      targetUserId: userId || null,
      metadata: { eventId, action, note: body.note ?? null },
    });
    return Response.json({ ok: true });
  } catch (resolveError) {
    const message = resolveError instanceof Error ? resolveError.message : "风险事件处理失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
