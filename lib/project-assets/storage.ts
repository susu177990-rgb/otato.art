import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveImageBytes } from "@/lib/db/persist-generated-image";
import { deleteMediaPrefix, mediaFileExtensionFromMime, putMediaObject, safeMediaPathPart } from "@/lib/media-storage";

function safePathPart(value: string): string {
  return safeMediaPathPart(value);
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
    extension: mediaFileExtensionFromMime(contentType, "png"),
  });
  return putMediaObject({ key: path, bytes, contentType });
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
  await deleteMediaPrefix(prefix);
}
