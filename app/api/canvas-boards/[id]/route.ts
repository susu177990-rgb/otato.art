import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCanvasBoard, getCanvasBoard, updateCanvasBoard } from "@/lib/canvas/board-store";
import type { CanvasBoardData } from "@/lib/canvas/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const board = await getCanvasBoard(supabase, id);
  if (!board) return Response.json({ error: "画布不存在" }, { status: 404 });
  return Response.json(board);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as { title?: unknown; data?: unknown };
  const board = await updateCanvasBoard(supabase, id, {
    title: typeof body.title === "string" ? body.title : undefined,
    data: body.data ? (body.data as CanvasBoardData) : undefined,
  });
  if (!board) return Response.json({ error: "画布不存在" }, { status: 404 });
  return Response.json(board);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const ok = await deleteCanvasBoard(supabase, id);
  if (!ok) return Response.json({ error: "画布不存在" }, { status: 404 });
  return new Response(null, { status: 204 });
}
