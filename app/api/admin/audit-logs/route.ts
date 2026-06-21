import { NextResponse } from "next/server";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { listAuditLogs } from "@/lib/admin/user-management";

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin("manageUsers");
    if ("error" in auth) return auth.error;
    const admin = maybeCreateSupabaseAdminClient();
    if (!admin) return NextResponse.json({ logs: [], warning: "缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取审计日志" });
    const params = new URL(req.url).searchParams;
    return NextResponse.json({
      logs: await listAuditLogs(admin, {
        targetUserId: params.get("targetUserId") ?? undefined,
        limit: Number(params.get("limit") ?? 50),
      }),
    });
  } catch (error) {
    console.error("[admin/audit-logs GET]", error);
    return adminErrorResponse(error, "读取审计日志失败");
  }
}
