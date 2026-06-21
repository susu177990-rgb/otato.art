import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { getAdminUserDetail } from "@/lib/admin/user-management";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin("manageUsers");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "用户 id 必填" }, { status: 400 });
    return NextResponse.json({ user: await getAdminUserDetail(auth.actor, id) });
  } catch (error) {
    console.error("[admin/users/[id] GET]", error);
    return adminErrorResponse(error, "读取用户详情失败");
  }
}
