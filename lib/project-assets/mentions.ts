import type { AssetMentionCandidate } from "@/lib/asset-mentions";
import type { ProjectAsset } from "./types";

const TYPE_LABELS: Record<ProjectAsset["type"], string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
};

function isVideoUrl(value: string): boolean {
  return /^data:video\//i.test(value) || /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(value);
}

export function projectAssetsToMentionCandidates(
  assets: ProjectAsset[],
): AssetMentionCandidate[] {
  return assets.map((asset) => {
    const isVideo = isVideoUrl(asset.primaryImageUrl);
    return {
      id: asset.id,
      label: asset.name,
      type: "project-asset",
      role: isVideo ? "video_reference" : "image_reference",
      groupLabel: TYPE_LABELS[asset.type],
      description: asset.description || asset.tags.join(" / "),
      thumbnailUrl: asset.primaryImageUrl,
      url: asset.primaryImageUrl,
      referenceUrls: [],
      nodeType: isVideo ? "video" : "image",
    };
  });
}
