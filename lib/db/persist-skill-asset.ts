import type { SupabaseClient } from "@supabase/supabase-js";
import { GENERATED_IMAGES_BUCKET } from "@/lib/generated-image-storage";

function extFromMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() || "image/png";
  if (m.includes("jpeg") || m === "image/jpg") return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  return "png";
}

export async function persistSkillAssetToStorage(
  supabase: SupabaseClient,
  userId: string,
  bytes: Uint8Array,
  contentType: string,
  objectId: string,
): Promise<string> {
  const ext = extFromMime(contentType);
  const safeId = objectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || crypto.randomUUID();
  const path = `${userId}/skill-assets/${safeId}.${ext}`;

  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`上传 Skill 资产失败: ${error.message}`);
  }

  const { data } = supabase.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("无法生成资产公开地址");
  return data.publicUrl;
}
