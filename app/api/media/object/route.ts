import { NextResponse } from "next/server";
import { getMediaObject, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function canReadUserMediaKey(key: string, userId: string): boolean {
  return key.startsWith(`ephemeral/${userId}/`) || key.startsWith(`${userId}/projects/`);
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const url = new URL(req.url).searchParams.get("url")?.trim() || "";
    const key = mediaObjectKeyFromPublicUrl(url);
    if (!key || !canReadUserMediaKey(key, user.id)) {
      return NextResponse.json({ error: "媒体地址无效" }, { status: 400 });
    }

    const object = await getMediaObject(key);
    if (!object) return NextResponse.json({ error: "媒体不存在" }, { status: 404 });

    return new Response(Buffer.from(object.bytes), {
      headers: {
        "content-type": object.contentType,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[media/object]", error);
    return NextResponse.json({ error: "读取媒体失败" }, { status: 500 });
  }
}
