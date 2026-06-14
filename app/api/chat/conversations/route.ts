import { NextResponse } from "next/server";
import { createChatConversation, listChatConversations } from "@/lib/db/chat-store";
import { formatDbError } from "@/lib/db/format-db-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { projectIdFromRequest } from "@/lib/db/project-scope";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const projectId = projectIdFromRequest(req);
    const conversations = await listChatConversations(
      supabase,
      user.id,
      projectId === undefined ? {} : { projectId },
    );
    return NextResponse.json({ conversations });
  } catch (e) {
    console.error("[chat/conversations GET]", e);
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { title?: string; projectId?: string | null };
    const projectId = projectIdFromRequest(req, body.projectId);
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const conv = await createChatConversation(
      supabase,
      user.id,
      id,
      body.title?.trim() || "新对话",
      projectId === undefined ? {} : { projectId },
    );
    return NextResponse.json({ conversation: conv });
  } catch (e) {
    console.error("[chat/conversations POST]", e);
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
