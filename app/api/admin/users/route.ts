import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdmin } from "@/lib/api/admin-auth";
import { listAdminUsers, normalizePage, normalizePerPage } from "@/lib/admin/user-management";

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin("manageUsers");
    if ("error" in auth) return auth.error;
    const params = new URL(req.url).searchParams;
    const result = await listAdminUsers({
      actor: auth.actor,
      page: normalizePage(params.get("page")),
      perPage: normalizePerPage(params.get("perPage")),
      search: params.get("search") ?? "",
      sort: params.get("sort") ?? "last_sign_in_desc",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/users GET]", error);
    return adminErrorResponse(error, "读取用户列表失败");
  }
}
