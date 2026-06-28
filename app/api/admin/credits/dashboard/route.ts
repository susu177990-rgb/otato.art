import { requireAdmin } from "@/lib/api/admin-auth";
import { getCreditBusinessDashboard } from "@/lib/credits/dashboard";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json(await getCreditBusinessDashboard());
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取经营看板失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
