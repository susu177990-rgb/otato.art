import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWorkspaceSnapshot, upsertUserApiSettings } from "@/lib/db/user-api-settings-store";

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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "client" });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings GET]", e);
    const message = describeError(e);
    return NextResponse.json({ error: message || "read_failed" }, { status: 500 });
  }
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

    const body = (await req.json()) as {
      llm?: unknown;
      imageWorkspace?: unknown;
      videoWorkspace?: unknown;
      apiUsageMode?: unknown;
      publicApiAccess?: unknown;
    };
    await upsertUserApiSettings(supabase, user.id, {
      llm: body.llm,
      imageWorkspace: body.imageWorkspace,
      videoWorkspace: body.videoWorkspace,
      apiUsageMode: body.apiUsageMode,
      publicApiAccess: body.publicApiAccess,
    });
    return NextResponse.json(await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "client" }));
  } catch (e) {
    console.error("[workspace-settings POST]", e);
    const message = describeError(e);
    return NextResponse.json({ error: message || "write_failed" }, { status: 500 });
  }
}
