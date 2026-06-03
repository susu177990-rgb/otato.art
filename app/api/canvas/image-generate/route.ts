import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCanvasBoard } from "@/lib/canvas/board-store";
import { executeCanvasImageGeneration } from "@/lib/canvas/image-gen-runtime";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "请先登录后再生图" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { boardId?: unknown; nodeId?: unknown };
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    if (!boardId || !nodeId) {
      return Response.json({ error: "缺少 boardId 或 nodeId" }, { status: 400 });
    }

    const board = await getCanvasBoard(supabase, boardId);
    if (!board) {
      return Response.json({ error: "画布不存在" }, { status: 404 });
    }

    const workspaceSnapshot = await getWorkspaceSnapshot(supabase);

    const result = await executeCanvasImageGeneration({
      supabase,
      userId: user.id,
      board,
      nodeId,
      workspaceSnapshot,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无线画布生图失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
