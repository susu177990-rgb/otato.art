import { requireAdmin } from "@/lib/api/admin-auth";
import { writeAuditLog } from "@/lib/admin/user-management";
import { captureCreditReservation, releaseCreditReservation } from "@/lib/credits/accounts";
import { listAdminCreditReservations } from "@/lib/credits/admin";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json({ reservations: await listAdminCreditReservations() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取冻结单失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    reservationId?: unknown;
    reason?: unknown;
    resultRef?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "";
  const reservationId = typeof body.reservationId === "string" ? body.reservationId.trim() : "";
  if (!reservationId) return Response.json({ error: "缺少冻结单 ID" }, { status: 400 });
  try {
    if (action === "release") {
      const reservation = await releaseCreditReservation({
        reservationId,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "admin_manual_release",
        metadata: { adminAction: true, actorId: auth.actor.id },
      });
      await writeAuditLog(auth.supabase, {
        actor: auth.actor,
        action: "credits.reservation.release",
        metadata: { reservationId, reason: body.reason ?? null },
      });
      return Response.json({ reservation });
    }
    if (action === "capture") {
      if (auth.actor.role !== "owner") return Response.json({ error: "只有 owner 可以手动扣冻结单" }, { status: 403 });
      const reservation = await captureCreditReservation({
        reservationId,
        resultRef: typeof body.resultRef === "string" ? body.resultRef.trim() : null,
        metadata: { adminAction: true, actorId: auth.actor.id },
      });
      await writeAuditLog(auth.supabase, {
        actor: auth.actor,
        action: "credits.reservation.capture",
        metadata: { reservationId, resultRef: body.resultRef ?? null },
      });
      return Response.json({ reservation });
    }
    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "冻结单操作失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
