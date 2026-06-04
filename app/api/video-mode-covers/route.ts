import { NextResponse } from "next/server";
import { canManageSiteSettings } from "@/lib/auth/site-admin";
import {
  assertModeCoverInput,
  MODE_COVER_INPUT_MAX_BYTES,
  prepareModeCoverThumbnail,
} from "@/lib/image/process-mode-cover";
import {
  deleteModeCoverObject,
  uploadModeCoverObject,
} from "@/lib/db/persist-mode-cover-image";
import { getWorkspaceSnapshot, upsertWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isKnownVideoModeId } from "@/lib/video-workspace";

async function requireSiteAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }
  if (!(await canManageSiteSettings(supabase))) {
    return { error: NextResponse.json({ error: "只有管理员可以修改全站配置" }, { status: 403 }) };
  }
  return { supabase };
}

export async function POST(req: Request) {
  try {
    const auth = await requireSiteAdmin();
    if ("error" in auth) return auth.error;

    const form = await req.formData();
    const modeId = String(form.get("modeId") ?? "").trim();
    const file = form.get("file");
    if (!modeId) return NextResponse.json({ error: "modeId 必填" }, { status: 400 });
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "请上传图片文件" }, { status: 400 });
    }
    if (file.size > MODE_COVER_INPUT_MAX_BYTES) {
      return NextResponse.json(
        { error: `封面图不能超过 ${Math.round(MODE_COVER_INPUT_MAX_BYTES / (1024 * 1024))}MB` },
        { status: 400 },
      );
    }

    const snapshot = await getWorkspaceSnapshot(auth.supabase);
    if (!isKnownVideoModeId(modeId, snapshot.videoWorkspace.customModes ?? [])) {
      return NextResponse.json({ error: "无效的模式 id" }, { status: 400 });
    }

    const contentType = (file.type || "image/png").split(";")[0]?.trim() || "image/png";
    const rawBytes = new Uint8Array(await file.arrayBuffer());
    assertModeCoverInput(contentType, rawBytes.byteLength);
    const webpBytes = await prepareModeCoverThumbnail(rawBytes);
    const previousUrl = snapshot.videoWorkspace.coverImageUrlByMode?.[modeId];
    const coverImageUrl = await uploadModeCoverObject(auth.supabase, `video-${modeId}`, webpBytes, previousUrl);

    const coverImageUrlByMode = { ...snapshot.videoWorkspace.coverImageUrlByMode, [modeId]: coverImageUrl };
    const nextSnapshot = await upsertWorkspaceSnapshot(auth.supabase, {
      videoWorkspace: { ...snapshot.videoWorkspace, coverImageUrlByMode },
    });

    return NextResponse.json({
      modeId,
      coverImageUrl,
      videoWorkspace: nextSnapshot.videoWorkspace,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload_failed";
    console.error("[video-mode-covers POST]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireSiteAdmin();
    if ("error" in auth) return auth.error;

    const body = (await req.json()) as { modeId?: string };
    const modeId = body.modeId?.trim();
    if (!modeId) return NextResponse.json({ error: "modeId 必填" }, { status: 400 });

    const snapshot = await getWorkspaceSnapshot(auth.supabase);
    if (!isKnownVideoModeId(modeId, snapshot.videoWorkspace.customModes ?? [])) {
      return NextResponse.json({ error: "无效的模式 id" }, { status: 400 });
    }

    const previousUrl = snapshot.videoWorkspace.coverImageUrlByMode?.[modeId];
    if (previousUrl) {
      await deleteModeCoverObject(auth.supabase, previousUrl);
    }

    const coverImageUrlByMode = { ...snapshot.videoWorkspace.coverImageUrlByMode };
    delete coverImageUrlByMode[modeId];

    const nextSnapshot = await upsertWorkspaceSnapshot(auth.supabase, {
      videoWorkspace: { ...snapshot.videoWorkspace, coverImageUrlByMode },
    });

    return NextResponse.json({ modeId, videoWorkspace: nextSnapshot.videoWorkspace });
  } catch (e) {
    const message = e instanceof Error ? e.message : "delete_failed";
    console.error("[video-mode-covers DELETE]", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
