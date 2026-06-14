import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCanvasBoard, listCanvasBoards } from "@/lib/canvas/board-store";
import { projectIdFromRequest } from "@/lib/db/project-scope";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const projectId = projectIdFromRequest(req);
  const boards = await listCanvasBoards(supabase, projectId === undefined ? {} : { projectId });
  return Response.json({ boards });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "未命名画布";
  const projectId = projectIdFromRequest(req, body.projectId);
  const board = await createCanvasBoard(
    supabase,
    user.id,
    nanoid(12),
    title,
    projectId === undefined ? {} : { projectId },
  );
  return Response.json(board, { status: 201 });
}
