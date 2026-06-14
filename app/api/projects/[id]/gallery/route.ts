import type { NextRequest } from "next/server";
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
