import type {
  ImageAspectRatio,
  ImageGalleryReferenceImage,
  ImageModelId,
  ImageSizeTier,
} from "@/lib/image-workspace";

export const AI_LIVE_ACTION_MODE_ID = "ai-live-action-first-frame";
export const AI_LIVE_ACTION_MODE_NAME = "AI+实拍首帧";

export type LiveActionAssetKind =
  | "scene-grid"
  | "marked-scene-grid"
  | "source-first-frame"
  | "character"
  | "prop";

export interface LiveActionImageAsset {
  id: string;
  label: string;
  kind: LiveActionAssetKind;
  dataUrl: string;
  name?: string;
  type?: string;
  description?: string;
}

export interface LiveActionCharacterAsset {
  id: string;
  name: string;
  image: LiveActionImageAsset;
  notes?: string;
}

export interface LiveActionPropAsset {
  id: string;
  name: string;
  image: LiveActionImageAsset;
  boundCharacterName?: string;
  notes?: string;
}

export interface LiveActionAssetBundle {
  sceneGridImage: LiveActionImageAsset;
  markedSceneGridImage?: LiveActionImageAsset;
  sourceFirstFrameImage: LiveActionImageAsset;
  characters: LiveActionCharacterAsset[];
  props: LiveActionPropAsset[];
  userIntent: string;
  aspectRatio: ImageAspectRatio;
}

export interface LiveActionRunOptions {
  modelId: ImageModelId;
  imageSize: ImageSizeTier;
}

export interface LiveActionReconstructResult {
  assetReview: string;
  reconstructionOutput: string;
  assetSummary: string;
  aspectRatio: ImageAspectRatio;
}

export interface LiveActionRunResult extends LiveActionReconstructResult {
  redrawOutput: string;
  finalPrompt: string;
  negativePrompt: string;
  imageUrl: string;
  payloadKind: string;
  galleryRecordId: string;
}

export interface ParsedLiveActionRequest {
  bundle: LiveActionAssetBundle;
  options: LiveActionRunOptions;
  referenceImages: ImageGalleryReferenceImage[];
}
