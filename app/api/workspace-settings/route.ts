import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getWorkspaceSnapshot,
  upsertWorkspaceSnapshot,
} from "@/lib/db/workspace-settings-store";

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
    const snapshot = await getWorkspaceSnapshot(supabase);
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings GET]", e);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
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

    const body = (await req.json()) as { llm?: unknown; imageWorkspace?: unknown; videoWorkspace?: unknown };
    const writeClient = maybeCreateSupabaseAdminClient() ?? supabase;
    const snapshot = await upsertWorkspaceSnapshot(writeClient, {
      llm: body.llm as Parameters<typeof upsertWorkspaceSnapshot>[1]["llm"],
      imageWorkspace: body.imageWorkspace,
      videoWorkspace: body.videoWorkspace,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings POST]", e);
    const message = describeError(e);
    return NextResponse.json({ error: message || "write_failed" }, { status: 500 });
  }
}
