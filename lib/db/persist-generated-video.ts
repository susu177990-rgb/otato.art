import type { SupabaseClient } from "@supabase/supabase-js";
import { putMediaObject, safeMediaPathPart } from "@/lib/media-storage";

const FETCH_TIMEOUT_MS = 5 * 60_000;

export function isStoredGeneratedVideoUrl(url: string): boolean {
  const trimmed = url.trim();
  return /\/storage\/v1\/object\/public\/generated-images\//i.test(trimmed) || /^https:\/\/media\.otato\.art\//i.test(trimmed);
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() || "video/mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("webm")) return "webm";
  return "mp4";
}

export async function resolveVideoBytes(sourceUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("视频地址为空");

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`拉取视频失败 (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("远程视频为空");
    const contentType = (res.headers.get("content-type") || "video/mp4").split(";")[0]?.trim() || "video/mp4";
    return { bytes: new Uint8Array(buf), contentType };
  }

  throw new Error("不支持的视频地址格式");
}

/**
 * 将远程视频 URL 落到 R2，返回稳定公开 URL。
 * 已是持久化媒体且路径属于当前用户的地址则原样返回。
 */
export async function persistGeneratedVideoToStorage(
  supabase: SupabaseClient,
  userId: string,
  sourceUrl: string,
  objectId: string,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("视频地址为空");

  if (isStoredGeneratedVideoUrl(trimmed) && trimmed.includes(`/${userId}/`)) {
    return trimmed;
  }

  const { bytes, contentType } = await resolveVideoBytes(trimmed);
  const ext = extFromMime(contentType);
  const safeId = safeMediaPathPart(objectId);
  const path = `${userId}/${safeId}.${ext}`;
  return putMediaObject({ key: path, bytes, contentType });
}
