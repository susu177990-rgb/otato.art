import { requireAdmin } from "@/lib/api/admin-auth";
import { listAdminCreditOrders } from "@/lib/credits/admin";
import { syncStripeSessionForOrder } from "@/lib/credits/stripe";
import { writeAuditLog } from "@/lib/admin/user-management";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json({ orders: await listAdminCreditOrders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取订单失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; orderId?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) return Response.json({ error: "缺少订单 ID" }, { status: 400 });
  try {
    if (action === "sync_stripe_session") {
      const order = await syncStripeSessionForOrder(orderId);
      await writeAuditLog(auth.supabase, {
        actor: auth.actor,
        action: "credits.order.sync_stripe_session",
        metadata: { orderId },
      });
      return Response.json({ order });
    }
    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "订单操作失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
