import { NextResponse } from "next/server";
import { putMediaObject } from "@/lib/media-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024;

function validUserMediaKey(key: string, userId: string): boolean {
  if (!key || key.length > 700) return false;
  if (!key.startsWith(`${userId}/`) && !key.startsWith(`ephemeral/${userId}/`)) return false;
  if (key.includes("..") || key.includes("//") || key.startsWith("/") || key.endsWith("/")) return false;
  return /^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(key);
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const key = typeof form.get("key") === "string" ? String(form.get("key")).trim() : "";
    const contentType = typeof form.get("contentType") === "string"
      ? String(form.get("contentType")).trim()
      : "";

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "缺少媒体文件" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "媒体文件为空" }, { status: 400 });
    }
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      return NextResponse.json({ error: "媒体文件不能超过 100MB" }, { status: 400 });
    }
    if (!validUserMediaKey(key, user.id)) {
      return NextResponse.json({ error: "媒体存储路径无效" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const publicUrl = await putMediaObject({
      key,
      bytes,
      contentType: contentType || file.type || "application/octet-stream",
    });

    return NextResponse.json({ publicUrl, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传媒体失败";
    console.error("[media/upload]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
