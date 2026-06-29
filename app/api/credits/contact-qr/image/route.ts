import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { GENERATED_IMAGES_BUCKET } from "@/lib/generated-image-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CONTACT_QR_STORAGE_PATH = "site/contact/recharge-wechat-qr.jpg";
const FALLBACK_QR_PATH = path.join(process.cwd(), "public", "contact", "recharge-wechat-qr.jpg");

function imageResponse(bytes: ArrayBuffer, contentType = "image/jpeg") {
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).download(CONTACT_QR_STORAGE_PATH);
  if (data) {
    return imageResponse(await data.arrayBuffer(), data.type || "image/jpeg");
  }

  try {
    const fallback = await fs.readFile(FALLBACK_QR_PATH);
    const bytes = fallback.buffer.slice(fallback.byteOffset, fallback.byteOffset + fallback.byteLength) as ArrayBuffer;
    return imageResponse(bytes);
  } catch {
    return NextResponse.json({ error: "二维码图片不存在" }, { status: 404 });
  }
}
