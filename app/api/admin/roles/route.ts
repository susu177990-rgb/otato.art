import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminRole, listAdminRoles } from "@/lib/admin/user-management";

export async function GET() {
  try {
    const auth = await requireAdmin("manageRoles");
    if ("error" in auth) return auth.error;
    return NextResponse.json({ roles: await listAdminRoles(auth.actor) });
  } catch (error) {
    console.error("[admin/roles GET]", error);
    return adminErrorResponse(error, "读取后台成员失败");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin("manageRoles");
    if ("error" in auth) return auth.error;
    const body = (await req.json()) as { email?: unknown; role?: unknown };
    return NextResponse.json({ role: await createAdminRole(auth.actor, body) });
  } catch (error) {
    console.error("[admin/roles POST]", error);
    return adminErrorResponse(error, "添加后台成员失败", 400);
  }
}
