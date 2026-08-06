import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCanvasBoard } from "@/lib/canvas/board-store";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { executeCanvasVideoGeneration } from "@/lib/canvas/video-gen-runtime";
import { projectIdFromRequest } from "@/lib/db/project-scope";
import { classifyGenerationError } from "@/lib/generation-error-classifier";
import { CreditRiskError } from "@/lib/credits/risk";
import { VideoReferenceSecurityError } from "@/lib/video-reference-security";

function generationErrorJson(message: string, code: string, status: number) {
  return {
    error: message,
    code,
    ...classifyGenerationError({ message, status }),
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(generationErrorJson("请先登录后再生视频", "canvas_video_auth_required", 401), { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      boardId?: unknown;
      nodeId?: unknown;
      projectId?: string | null;
      requestId?: unknown;
    };
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    const requestId = typeof body.requestId === "string" && body.requestId.trim()
      ? body.requestId.trim()
      : crypto.randomUUID();
    if (!boardId || !nodeId) {
      return Response.json(generationErrorJson("缺少 boardId 或 nodeId", "canvas_video_missing_node", 400), { status: 400 });
    }

    const projectId = projectIdFromRequest(req, body.projectId);
    const board = await getCanvasBoard(
      supabase,
      boardId,
      projectId === undefined ? {} : { projectId },
    );
    if (!board) {
      return Response.json(generationErrorJson("画布不存在", "canvas_video_board_not_found", 404), { status: 404 });
    }

    const workspaceSnapshot = await getWorkspaceSnapshot(supabase);
    const result = await executeCanvasVideoGeneration({
      supabase,
      userId: user.id,
      board,
      nodeId,
      workspaceSnapshot,
      projectId,
      requestId,
      callbackOrigin: (process.env.APP_ORIGIN?.trim() || req.nextUrl.origin),
    });
    return Response.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof CreditRiskError) {
      return Response.json(generationErrorJson(error.message, error.code, error.status), { status: error.status });
    }
    if (error instanceof VideoReferenceSecurityError) {
      return Response.json(generationErrorJson(error.message, error.code, 400), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "无线画布生视频失败";
    return Response.json(generationErrorJson(message, "canvas_video_generation_failed", 500), { status: 500 });
  }
}
