export const PROJECT_ASSET_TYPES = ["character", "prop", "scene"] as const;

export type ProjectAssetType = (typeof PROJECT_ASSET_TYPES)[number];

export type ProjectAsset = {
  id: string;
  projectId: string;
  type: ProjectAssetType;
  name: string;
  description: string;
  tags: string[];
  primaryImageUrl: string;
  referenceImageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectAssetInput = {
  type: ProjectAssetType;
  name: string;
  description?: string;
  tags?: string[];
  primaryImageUrl: string;
  referenceImageUrls?: string[];
};

export type ProjectAssetPatch = Partial<ProjectAssetInput>;

export type ProjectGalleryImageItem = {
  id: string;
  kind: "image";
  createdAt: string;
  name: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  sourceRecordId: string;
};

export type ProjectGalleryVideoItem = {
  id: string;
  kind: "video";
  createdAt: string;
  name: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  sourceRecordId: string;
};

export type ProjectGalleryAssetItem = {
  id: string;
  kind: "project-asset";
  createdAt: string;
  name: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  assetType: ProjectAssetType;
  tags: string[];
  sourceRecordId: string;
};

export type ProjectGalleryItem =
  | ProjectGalleryImageItem
  | ProjectGalleryVideoItem
  | ProjectGalleryAssetItem;
