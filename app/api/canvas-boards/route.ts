import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCanvasBoard, listCanvasBoards } from "@/lib/canvas/board-store";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const boards = await listCanvasBoards(supabase);
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
  const board = await createCanvasBoard(supabase, user.id, nanoid(12), title);
  return Response.json(board, { status: 201 });
}
