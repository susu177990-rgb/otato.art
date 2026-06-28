import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCreditCheckoutSession, isStripeCheckoutConfigured } from "@/lib/credits/stripe";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { packageId?: unknown; returnTo?: unknown };
  const packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
  const returnTo = typeof body.returnTo === "string" ? body.returnTo.trim() : null;
  if (!packageId) return Response.json({ error: "缺少套餐 ID" }, { status: 400 });
  if (!isStripeCheckoutConfigured()) {
    return Response.json({ error: "在线支付暂未开放，请联系管理员充值。" }, { status: 503 });
  }
  try {
    const result = await createCreditCheckoutSession({
      userId: user.id,
      userEmail: user.email ?? null,
      packageId,
      returnTo,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建支付订单失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
