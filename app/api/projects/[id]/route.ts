import { NextRequest } from "next/server";
import { getProject, saveProject, deleteProject } from "@/lib/project-store";
import type { Project } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return Response.json(project);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getProject(id);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const updates = (await req.json()) as Record<string, unknown>;
  const merged = { ...existing, ...updates, id: existing.id } as Record<string, unknown>;
  delete merged.snapshots;
  const project = merged as unknown as Project;
  saveProject(project);
  return Response.json(project);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const ok = deleteProject(id);
  if (!ok) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
