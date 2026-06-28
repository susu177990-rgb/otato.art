import { requireAdmin } from "@/lib/api/admin-auth";
import { listCreditPackages, saveCreditPackages } from "@/lib/credits/admin";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json({ packages: await listCreditPackages() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取套餐失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as { packages?: unknown };
  try {
    return Response.json({ packages: await saveCreditPackages({
      actor: auth.actor,
      packages: Array.isArray(body.packages) ? body.packages as never : [],
    }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存套餐失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
