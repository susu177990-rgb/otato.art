import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCreditPackages } from "@/lib/credits/admin";
import { isStripeCheckoutConfigured } from "@/lib/credits/stripe";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const packages = await listCreditPackages(supabase);
    return Response.json({
      packages: packages.filter((item) => item.enabled),
      paymentsEnabled: isStripeCheckoutConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取充值套餐失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
