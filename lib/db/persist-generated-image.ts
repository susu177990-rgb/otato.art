import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { isStoredGeneratedImageUrl } from "@/lib/generated-image-storage";
import { ephemeralMediaKey, putMediaObject, safeMediaPathPart } from "@/lib/media-storage";

const FETCH_TIMEOUT_MS = 90_000;

const STORED_IMAGE_MIME = "image/webp";
const STORED_IMAGE_EXT = "webp";
const THUMB_IMAGE_QUALITY = 76;
const THUMB_IMAGE_MAX_EDGE = 640;

function extFromMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() || "image/png";
  if (m.includes("jpeg") || m === "image/jpg") return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  return "png";
}

export async function resolveImageBytes(sourceUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("图片地址为空");

  if (trimmed.startsWith("data:")) {
    const match = trimmed.match(/^data:([^;,]+)?;base64,(.+)$/i);
    if (!match) throw new Error("无法解析 data URL");
    const contentType = (match[1] || "image/png").trim();
    const b64 = match[2].replace(/\s/g, "");
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.byteLength) throw new Error("data URL 内容为空");
    return { bytes: new Uint8Array(bytes), contentType };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`拉取图片失败 (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("远程图片为空");
    const contentType = (res.headers.get("content-type") || "image/png").split(";")[0]?.trim() || "image/png";
    return { bytes: new Uint8Array(buf), contentType };
  }

  throw new Error("不支持的图片地址格式");
}

async function buildGeneratedImageThumbnail(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const compressed = await sharp(Buffer.from(bytes))
    .rotate()
    .resize({
      width: THUMB_IMAGE_MAX_EDGE,
      height: THUMB_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_IMAGE_QUALITY, effort: 4 })
    .toBuffer();
  return { bytes: new Uint8Array(compressed), contentType: STORED_IMAGE_MIME, ext: STORED_IMAGE_EXT };
}

/**
 * 将 data: / 临时 http(s) 上传到 R2，返回可长期使用的公开 URL。
 * 已是持久化媒体且路径属于当前用户的地址则原样返回。
 */
export async function persistGeneratedImageToStorage(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  objectId: string,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("图片地址为空");

  if (isStoredGeneratedImageUrl(trimmed) && trimmed.includes(`/${userId}/`)) {
    return trimmed;
  }

  const { bytes, contentType } = await resolveImageBytes(trimmed);
  const ext = extFromMime(contentType);
  const safeId = safeMediaPathPart(objectId);
  const path = ephemeralMediaKey(userId, `generated-images/${safeId}/original.${ext}`);
  return putMediaObject({ key: path, bytes, contentType });
}

export async function persistGeneratedImageWithThumbnailToStorage(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  objectId: string,
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const imageUrl = await persistGeneratedImageToStorage(supabase, userId, sourceUrl, objectId);
  const { bytes } = await resolveImageBytes(imageUrl);
  const thumb = await buildGeneratedImageThumbnail(bytes);
  const safeId = safeMediaPathPart(objectId);
  const path = ephemeralMediaKey(userId, `generated-images/${safeId}/thumb.${thumb.ext}`);
  const thumbnailUrl = await putMediaObject({ key: path, bytes: thumb.bytes, contentType: thumb.contentType });
  return { imageUrl, thumbnailUrl };
}
