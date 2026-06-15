import type { SupabaseClient } from "@supabase/supabase-js";
import { GENERATED_IMAGES_BUCKET } from "@/lib/generated-image-storage";
import { resolveImageBytes } from "@/lib/db/persist-generated-image";

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || crypto.randomUUID();
}

function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() || "image/png";
  if (normalized.includes("jpeg") || normalized === "image/jpg") return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("bmp")) return "bmp";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mp4") || normalized.includes("m4v")) return "mp4";
  if (normalized.includes("ogg")) return "ogv";
  return "png";
}

export function projectAssetStoragePath(input: {
  userId: string;
  projectId: string;
  assetId: string;
  slot: "primary" | `reference-${number}`;
  extension: string;
}): string {
  return [
    safePathPart(input.userId),
    "projects",
    safePathPart(input.projectId),
    "assets",
    safePathPart(input.assetId),
    `${safePathPart(input.slot)}.${safePathPart(input.extension)}`,
  ].join("/");
}

export async function copyProjectAssetImage(
  supabase: SupabaseClient,
  input: {
    userId: string;
    projectId: string;
    assetId: string;
    sourceUrl: string;
    slot: "primary" | `reference-${number}`;
  },
): Promise<string> {
  const { bytes, contentType } = await resolveImageBytes(input.sourceUrl);
  const normalizedType = contentType.toLowerCase();
  if (!normalizedType.startsWith("image/") && !normalizedType.startsWith("video/")) {
    throw new Error("项目素材只支持图片或视频媒体");
  }
  const path = projectAssetStoragePath({
    ...input,
    extension: extensionForMime(contentType),
  });
  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`复制素材媒体失败: ${error.message}`);
  const { data } = supabase.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("无法生成素材媒体地址");
  return data.publicUrl;
}

export async function copyProjectAssetMedia(
  supabase: SupabaseClient,
  input: {
    userId: string;
    projectId: string;
    assetId: string;
    primaryImageUrl: string;
    referenceImageUrls: string[];
  },
): Promise<{ primaryImageUrl: string; referenceImageUrls: string[] }> {
  const primaryImageUrl = await copyProjectAssetImage(supabase, {
    ...input,
    sourceUrl: input.primaryImageUrl,
    slot: "primary",
  });
  const referenceImageUrls = await Promise.all(
    input.referenceImageUrls.map((sourceUrl, index) =>
      copyProjectAssetImage(supabase, {
        ...input,
        sourceUrl,
        slot: `reference-${index + 1}`,
      }),
    ),
  );
  return { primaryImageUrl, referenceImageUrls };
}

export async function removeProjectAssetMedia(
  supabase: SupabaseClient,
  input: { userId: string; projectId: string; assetId: string },
): Promise<void> {
  const prefix = `${safePathPart(input.userId)}/projects/${safePathPart(input.projectId)}/assets/${safePathPart(input.assetId)}`;
  const { data, error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).list(prefix);
  if (error) throw new Error(`读取素材媒体失败: ${error.message}`);
  const paths = (data ?? []).map((item) => `${prefix}/${item.name}`);
  if (paths.length === 0) return;
  const { error: removeError } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).remove(paths);
  if (removeError) throw new Error(`删除素材媒体失败: ${removeError.message}`);
}
