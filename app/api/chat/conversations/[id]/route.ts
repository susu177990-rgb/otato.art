import { NextResponse } from "next/server";
import { deleteChatConversation, getChatConversation, saveChatConversation } from "@/lib/db/chat-store";
import type { ChatConversation } from "@/lib/chat/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { projectIdFromRequest } from "@/lib/db/project-scope";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const projectId = projectIdFromRequest(req);
    const scope = projectId === undefined ? {} : { projectId };
    const conversation = await getChatConversation(supabase, user.id, id, scope);
    if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch (e) {
    console.error("[chat/conversations/id GET]", e);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json()) as Partial<ChatConversation> & { projectId?: string | null };
    const projectId = projectIdFromRequest(req, body.projectId);
    const scope = projectId === undefined ? {} : { projectId };
    const existing = await getChatConversation(supabase, user.id, id, scope);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const merged: ChatConversation = {
      ...existing,
      ...body,
      id,
      updatedAt: body.updatedAt ?? Date.now(),
    };
    await saveChatConversation(supabase, user.id, merged, scope);
    return NextResponse.json({ conversation: merged });
  } catch (e) {
    console.error("[chat/conversations/id PUT]", e);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const projectId = projectIdFromRequest(req);
    await deleteChatConversation(
      supabase,
      user.id,
      id,
      projectId === undefined ? {} : { projectId },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[chat/conversations/id DELETE]", e);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
