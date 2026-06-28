import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapCreditOrder } from "@/lib/credits/rows";

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const { data, error } = await supabase
    .from("credit_orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "订单不存在" }, { status: 404 });
  return Response.json({ order: mapCreditOrder(row(data)) });
}
