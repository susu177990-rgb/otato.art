import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { getWorkspaceSnapshot, upsertWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";

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
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    return NextResponse.json(await getWorkspaceSnapshot(auth.supabase));
  } catch (e) {
    console.error("[admin/workspace-settings GET]", e);
    return NextResponse.json({ error: describeError(e) || "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const body = (await req.json()) as { llm?: unknown; imageWorkspace?: unknown; videoWorkspace?: unknown };
    const snapshot = await upsertWorkspaceSnapshot(auth.supabase, {
      llm: body.llm as Parameters<typeof upsertWorkspaceSnapshot>[1]["llm"],
      imageWorkspace: body.imageWorkspace,
      videoWorkspace: body.videoWorkspace,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[admin/workspace-settings POST]", e);
    return NextResponse.json({ error: describeError(e) || "write_failed" }, { status: 500 });
  }
}
