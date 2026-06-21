import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { deleteAdminUserData } from "@/lib/admin/user-management";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin("manageUsers");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "用户 id 必填" }, { status: 400 });
    const body = await req.json().catch(() => ({})) as { confirmationEmail?: unknown };
    const result = await deleteAdminUserData({
      actor: auth.actor,
      userId: id,
      confirmationEmail: body.confirmationEmail,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[admin/users/[id]/data DELETE]", error);
    return adminErrorResponse(error, "删除账号和数据失败", 400);
  }
}
