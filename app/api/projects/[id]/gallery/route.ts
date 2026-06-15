import type { NextRequest } from "next/server";
import { deleteGalleryRecord } from "@/lib/db/gallery-store";
import { deleteVideoGalleryRecord } from "@/lib/db/video-gallery-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildProjectGalleryItems,
} from "@/lib/project-assets/gallery";
import {
  listProjectAssets,
  listProjectImageGalleryRecords,
  listProjectVideoGalleryRecords,
  projectExists,
} from "@/lib/project-assets/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
    const { id: projectId } = await ctx.params;
    if (!(await projectExists(supabase, projectId))) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    const [assets, images, videos] = await Promise.all([
      listProjectAssets(supabase, projectId),
      listProjectImageGalleryRecords(supabase, projectId),
      listProjectVideoGalleryRecords(supabase, projectId),
    ]);
    return Response.json({
      items: buildProjectGalleryItems({ assets, images, videos }),
    });
  } catch (error) {
    console.error("[project gallery read]", error);
    return Response.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
    const { id: projectId } = await ctx.params;
    if (!(await projectExists(supabase, projectId))) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      sourceRecordId?: string;
    };
    if (body.kind !== "image" && body.kind !== "video") {
      return Response.json({ error: "invalid_kind" }, { status: 400 });
    }
    const sourceRecordId = body.sourceRecordId?.trim();
    if (!sourceRecordId) return Response.json({ error: "missing_record_id" }, { status: 400 });

    const deleted = body.kind === "image"
      ? await deleteGalleryRecord(supabase, sourceRecordId, { projectId })
      : await deleteVideoGalleryRecord(supabase, sourceRecordId, { projectId });
    if (!deleted) return Response.json({ error: "记录不存在" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[project gallery delete]", error);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
