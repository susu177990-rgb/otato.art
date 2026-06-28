import { requireAdmin } from "@/lib/api/admin-auth";
import { listCreditPricing, saveCreditPricing } from "@/lib/credits/admin";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json(await listCreditPricing());
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取价格失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as {
    imagePrices?: unknown;
    videoPrices?: unknown;
    allowLowMarginOverride?: unknown;
  };
  try {
    return Response.json(await saveCreditPricing({
      actor: auth.actor,
      imagePrices: Array.isArray(body.imagePrices) ? body.imagePrices as never : [],
      videoPrices: Array.isArray(body.videoPrices) ? body.videoPrices as never : [],
      allowLowMarginOverride: body.allowLowMarginOverride === true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存价格失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
