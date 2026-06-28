import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCreditBalanceSnapshot, grantWelcomeCreditsIfEligible } from "@/lib/credits/accounts";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    await grantWelcomeCreditsIfEligible(user);
    return Response.json(await getCreditBalanceSnapshot(supabase, user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取积分失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
