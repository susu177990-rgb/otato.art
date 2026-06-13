import { NextResponse } from "next/server";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import { testPersonalApiConnection, type PersonalApiTestRequest } from "@/lib/personal-api-test";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.trim();
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as PersonalApiTestRequest;
    const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
    const result = await testPersonalApiConnection(snapshot, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[workspace-settings/test-connection POST]", error);
    return NextResponse.json(
      {
        ok: false,
        code: "TEST_CONNECTION_FAILED",
        module: "llm",
        stage: "upstream_submit",
        message: describeError(error) || "测试连接失败",
      },
      { status: 500 },
    );
  }
}
