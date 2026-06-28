import { requireAdmin } from "@/lib/api/admin-auth";
import { listAdminCreditLedger } from "@/lib/credits/admin";

export async function GET() {
  const auth = await requireAdmin("manageSystem");
  if ("error" in auth) return auth.error;
  try {
    return Response.json({ ledger: await listAdminCreditLedger() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取流水失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
