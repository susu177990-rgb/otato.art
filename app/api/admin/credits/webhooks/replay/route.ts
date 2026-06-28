import { requireAdmin } from "@/lib/api/admin-auth";
import { writeAuditLog } from "@/lib/admin/user-management";
import { replayStoredStripeWebhookEvent } from "@/lib/credits/stripe";

export async function POST(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as { eventId?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId) return Response.json({ error: "缺少 webhook eventId" }, { status: 400 });
  try {
    const result = await replayStoredStripeWebhookEvent(eventId);
    await writeAuditLog(auth.supabase, {
      actor: auth.actor,
      action: "credits.webhook.replay",
      metadata: { eventId, result },
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "重放 webhook 失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
