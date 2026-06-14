import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCanvasBoard, getCanvasBoard, updateCanvasBoard } from "@/lib/canvas/board-store";
import type { CanvasBoardData } from "@/lib/canvas/types";
import { projectIdFromRequest } from "@/lib/db/project-scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const projectId = projectIdFromRequest(req);
  const board = await getCanvasBoard(supabase, id, projectId === undefined ? {} : { projectId });
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
  const body = (await req.json()) as { title?: unknown; data?: unknown; projectId?: unknown };
  const projectId = projectIdFromRequest(req, body.projectId);
  const board = await updateCanvasBoard(supabase, id, {
    title: typeof body.title === "string" ? body.title : undefined,
    data: body.data ? (body.data as CanvasBoardData) : undefined,
  }, projectId === undefined ? {} : { projectId });
  if (!board) return Response.json({ error: "画布不存在" }, { status: 404 });
  return Response.json(board);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const projectId = projectIdFromRequest(req);
  const ok = await deleteCanvasBoard(supabase, id, projectId === undefined ? {} : { projectId });
  if (!ok) return Response.json({ error: "画布不存在" }, { status: 404 });
  return new Response(null, { status: 204 });
}
