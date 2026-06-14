import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCanvasBoard } from "@/lib/canvas/board-store";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import { executeCanvasVideoGeneration } from "@/lib/canvas/video-gen-runtime";
import { projectIdFromRequest } from "@/lib/db/project-scope";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "请先登录后再生视频" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      boardId?: unknown;
      nodeId?: unknown;
      projectId?: string | null;
    };
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    if (!boardId || !nodeId) {
      return Response.json({ error: "缺少 boardId 或 nodeId" }, { status: 400 });
    }

    const projectId = projectIdFromRequest(req, body.projectId);
    const board = await getCanvasBoard(
      supabase,
      boardId,
      projectId === undefined ? {} : { projectId },
    );
    if (!board) {
      return Response.json({ error: "画布不存在" }, { status: 404 });
    }

    const workspaceSnapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
    const result = await executeCanvasVideoGeneration({
      supabase,
      userId: user.id,
      board,
      nodeId,
      workspaceSnapshot,
      projectId,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无线画布生视频失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
