import type { AssetMentionCandidate } from "@/lib/asset-mentions";
import type { ProjectAsset } from "./types";

const TYPE_LABELS: Record<ProjectAsset["type"], string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
};

export function projectAssetsToMentionCandidates(
  assets: ProjectAsset[],
): AssetMentionCandidate[] {
  return assets.map((asset) => ({
    id: asset.id,
    label: asset.name,
    type: "project-asset",
    role: "image_reference",
    groupLabel: TYPE_LABELS[asset.type],
    description: asset.description || asset.tags.join(" / "),
    thumbnailUrl: asset.primaryImageUrl,
    url: asset.primaryImageUrl,
    referenceUrls: asset.referenceImageUrls,
    nodeType: "image",
  }));
}
