import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteProject, getProject, saveProject } from "@/lib/db/project-store";
import {
  ensureProjectCreativeDirection,
  isCreativeDirectionLocked,
  normalizeExistingProjectCreativeDirectionId,
} from "@/lib/creative-directions";
import type { Project } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const project = await getProject(supabase, id);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return Response.json(project);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await getProject(supabase, id);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const updates = (await req.json()) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(updates, "creativeDirectionId")) {
    const currentDirectionId = normalizeExistingProjectCreativeDirectionId(existing.creativeDirectionId);
    const requestedDirectionId = normalizeExistingProjectCreativeDirectionId(
      typeof updates.creativeDirectionId === "string" ? updates.creativeDirectionId : undefined,
    );
    if (requestedDirectionId !== currentDirectionId && isCreativeDirectionLocked(existing)) {
      return Response.json(
        { error: "创作方向已锁定：项目已有确认书、系列圣经、对话或产物，不能直接切换方向。" },
        { status: 409 },
      );
    }
    updates.creativeDirectionId = requestedDirectionId;
  }

  const merged = { ...existing, ...updates, id: existing.id } as Record<string, unknown>;
  delete merged.snapshots;
  const project = merged as unknown as Project;
  ensureProjectCreativeDirection(project);
  await saveProject(supabase, project);
  return Response.json(project);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const ok = await deleteProject(supabase, id);
  if (!ok) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
