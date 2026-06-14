import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ProjectAssetValidationError,
  parseProjectAssetPatch,
} from "@/lib/project-assets/validation";
import {
  deleteProjectAsset,
  getProjectAsset,
  projectExists,
  updateProjectAsset,
} from "@/lib/project-assets/store";
import {
  copyProjectAssetMedia,
  removeProjectAssetMedia,
} from "@/lib/project-assets/storage";

type RouteContext = { params: Promise<{ id: string; assetId: string }> };

function errorResponse(error: unknown, operation: string): Response {
  if (error instanceof ProjectAssetValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error(`[project asset ${operation}]`, error);
  return Response.json({ error: `${operation}_failed` }, { status: 500 });
}

async function authenticatedAsset(ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: Response.json({ error: "请先登录" }, { status: 401 }) };
  const { id: projectId, assetId } = await ctx.params;
  if (!(await projectExists(supabase, projectId))) {
    return { response: Response.json({ error: "项目不存在" }, { status: 404 }) };
  }
  const asset = await getProjectAsset(supabase, projectId, assetId);
  if (!asset) return { response: Response.json({ error: "素材不存在" }, { status: 404 }) };
  return { supabase, user, projectId, assetId, asset };
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await authenticatedAsset(ctx);
    if ("response" in auth) return auth.response;
    return Response.json({ asset: auth.asset });
  } catch (error) {
    return errorResponse(error, "read");
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await authenticatedAsset(ctx);
    if ("response" in auth) return auth.response;
    let patch = parseProjectAssetPatch(await request.json());

    if (patch.primaryImageUrl !== undefined || patch.referenceImageUrls !== undefined) {
      const media = await copyProjectAssetMedia(auth.supabase, {
        userId: auth.user.id,
        projectId: auth.projectId,
        assetId: auth.assetId,
        primaryImageUrl: patch.primaryImageUrl ?? auth.asset.primaryImageUrl,
        referenceImageUrls: patch.referenceImageUrls ?? auth.asset.referenceImageUrls,
      });
      patch = { ...patch, ...media };
    }

    const asset = await updateProjectAsset(
      auth.supabase,
      auth.projectId,
      auth.assetId,
      patch,
    );
    if (!asset) return Response.json({ error: "素材不存在" }, { status: 404 });
    return Response.json({ asset });
  } catch (error) {
    return errorResponse(error, "update");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await authenticatedAsset(ctx);
    if ("response" in auth) return auth.response;
    const deleted = await deleteProjectAsset(auth.supabase, auth.projectId, auth.assetId);
    if (!deleted) return Response.json({ error: "素材不存在" }, { status: 404 });
    await removeProjectAssetMedia(auth.supabase, {
      userId: auth.user.id,
      projectId: auth.projectId,
      assetId: auth.assetId,
    }).catch((error) => console.warn("[project asset delete media]", error));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, "delete");
  }
}
