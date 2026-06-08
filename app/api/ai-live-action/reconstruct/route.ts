import { NextRequest, NextResponse } from "next/server";
import { parseLiveActionMultipart } from "@/lib/ai-live-action/request";
import { reconstructLiveActionFirstFrame } from "@/lib/ai-live-action/workflow";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录后再使用 AI+实拍工作台" }, { status: 401 });

    const parsed = await parseLiveActionMultipart(req);
    if (!parsed.ok) return parsed.response;

    const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
    const result = await reconstructLiveActionFirstFrame({
      settings: snapshot.llm,
      bundle: parsed.value.bundle,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[ai-live-action/reconstruct]", e);
    const message = e instanceof Error ? e.message : "AI+实拍首帧分析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
