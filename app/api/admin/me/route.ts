import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
  });
}
