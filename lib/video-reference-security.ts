import "server-only";

import { parseBuffer } from "music-metadata";
import { getMediaObject, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";
import type { UnifiedVideoReference, VideoGenerationModeId } from "@/lib/video-workspace";

export type VideoReferenceSecurityCode = "REFERENCE_NOT_OWNED" | "VIDEO_DURATION_UNVERIFIED";

export class VideoReferenceSecurityError extends Error {
  constructor(
    public readonly code: VideoReferenceSecurityCode,
    message: string,
  ) {
    super(message);
  }
}

function ownedMediaKey(key: string, userId: string): boolean {
  return key.startsWith(`ephemeral/${userId}/`) || key.startsWith(`${userId}/projects/`);
}

function billedVideoRole(modeId: VideoGenerationModeId): UnifiedVideoReference["role"] | null {
  if (modeId === "video_edit") return "video_reference";
  if (modeId === "motion_control") return "motion_source_video";
  return null;
}

export async function verifyBillableVideoReference(params: {
  userId: string;
  modeId: VideoGenerationModeId;
  references: UnifiedVideoReference[];
}): Promise<{ references: UnifiedVideoReference[]; durationSeconds: number | null }> {
  const role = billedVideoRole(params.modeId);
  if (role && !params.references.some((reference) => reference.role === role)) {
    throw new VideoReferenceSecurityError("VIDEO_DURATION_UNVERIFIED", "缺少用于计费的素材视频。");
  }

  const rolesRequiringTrustedDuration = new Set<UnifiedVideoReference["role"]>(
    params.modeId === "multi_image_reference"
      ? ["video_reference", "audio_reference"]
      : role ? [role] : [],
  );
  if (rolesRequiringTrustedDuration.size === 0) {
    return { references: params.references, durationSeconds: null };
  }

  const references = await Promise.all(params.references.map(async (reference) => {
    if (!rolesRequiringTrustedDuration.has(reference.role)) return reference;
    const key = mediaObjectKeyFromPublicUrl(reference.url);
    if (!key || !ownedMediaKey(key, params.userId)) {
      throw new VideoReferenceSecurityError("REFERENCE_NOT_OWNED", "视频或音频素材不是当前账号拥有的站内文件。");
    }
    const object = await getMediaObject(key);
    if (!object) throw new VideoReferenceSecurityError("VIDEO_DURATION_UNVERIFIED", "视频或音频素材不存在或已失效。");
    try {
      const metadata = await parseBuffer(object.bytes, {
        mimeType: object.contentType,
        size: object.bytes.byteLength,
      }, { duration: true, skipCovers: true });
      const seconds = metadata.format.duration;
      if (!Number.isFinite(seconds) || !seconds || seconds <= 0) throw new Error("duration missing");
      return { ...reference, durationSeconds: Math.max(1, Math.ceil(seconds)) };
    } catch (error) {
      console.error("[video reference duration]", { key, error });
      throw new VideoReferenceSecurityError("VIDEO_DURATION_UNVERIFIED", "无法读取素材的真实时长，请重新上传有效的视频或音频文件。");
    }
  }));
  const durationSeconds = role
    ? references.find((reference) => reference.role === role)?.durationSeconds ?? null
    : null;
  return { references, durationSeconds };
}
