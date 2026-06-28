import { requireAdmin } from "@/lib/api/admin-auth";
import { adminAdjustCredits } from "@/lib/credits/admin";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("manageUsers");
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    type?: unknown;
    amountCredits?: unknown;
    reason?: unknown;
    targetEmail?: unknown;
  };
  const type = body.type === "manual_topup" || body.type === "bonus" || body.type === "compensation" || body.type === "deduction" || body.type === "refund"
    ? body.type
    : "manual_topup";
  const amount = Number(body.amountCredits);
  try {
    return Response.json(await adminAdjustCredits({
      actor: auth.actor,
      targetUserId: id,
      targetEmail: typeof body.targetEmail === "string" ? body.targetEmail : null,
      type,
      amountCredits: type === "deduction" && amount > 0 ? -amount : amount,
      reason: typeof body.reason === "string" ? body.reason : "",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "调整积分失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
