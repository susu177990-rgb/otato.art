import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { deleteAdminRole, updateAdminRole } from "@/lib/admin/user-management";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin("manageRoles");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "角色 id 必填" }, { status: 400 });
    const body = (await req.json()) as { role?: unknown };
    return NextResponse.json({ role: await updateAdminRole(auth.actor, id, body) });
  } catch (error) {
    console.error("[admin/roles/[id] PATCH]", error);
    return adminErrorResponse(error, "修改后台成员失败", 400);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin("manageRoles");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "角色 id 必填" }, { status: 400 });
    await deleteAdminRole(auth.actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/roles/[id] DELETE]", error);
    return adminErrorResponse(error, "移除后台成员失败", 400);
  }
}
