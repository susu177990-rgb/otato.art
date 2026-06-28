import type { GptImageBackground, GptImageQuality, ImageAspectRatio, ImageModelId, ImageSizeTier } from "@/lib/image-workspace";
import type { VideoAspectRatio, VideoGenerationModeId, VideoModelId, VideoResolution } from "@/lib/video-workspace";

export type CanvasPosition = {
  x: number;
  y: number;
};

export type CanvasViewport = {
  x: number;
  y: number;
  k: number;
};

export type CanvasNodeType = "text" | "image" | "video" | "audio" | "group";

export type CanvasSourcePort = "output";

export type CanvasTargetPort =
  | "source"
  | "prompt"
  | "imageReference"
  | "firstFrame"
  | "lastFrame"
  | "videoReference"
  | "audioReference";

export type CanvasNodeMetadata = {
  text?: string;
  textMode?: "chooser" | "chat" | "manual";
  chatConversationId?: string;
  chatInput?: string;
  chatStatus?: "idle" | "running" | "success" | "error";
  chatLastError?: string;
  chatPreferredLlmModelId?: string;
  chatPreferredImageModelId?: ImageModelId;
  chatLastAssistantMessageId?: string;
  chatPreviewMarkdown?: string;
  prompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  videoDurationSeconds?: number;
  audioDurationSeconds?: number;
  mimeType?: string;
  source?: "upload" | "manual";
  /** Group node: ordered list of child node IDs */
  children?: string[];
  /** Child node: ID of the parent group node */
  parentId?: string;
  /** image node generation runtime */
  imageModelId?: ImageModelId;
  aspectRatio?: ImageAspectRatio;
  imageSize?: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  gptImageBackground?: GptImageBackground;
  /** video node generation runtime */
  videoModelId?: VideoModelId;
  videoModeId?: VideoGenerationModeId;
  videoAspectRatio?: VideoAspectRatio;
  videoResolution?: VideoResolution;
  status?: "idle" | "running" | "success" | "error";
  lastRunAt?: string;
  lastError?: string;
  /** image node: inline preview URL (may differ from imageUrl during generation) */
  previewImageUrl?: string;
  /** video node: inline preview URL */
  previewVideoUrl?: string;
  /** preset node metadata fields */
  presetId?: string;
  presetKind?: "image" | "video" | "chat";
  presetDescription?: string;
  presetCoverNaturalWidth?: number;
  presetCoverNaturalHeight?: number;
};

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  title: string;
  position: CanvasPosition;
  width: number;
  height: number;
  metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  sourcePort: CanvasSourcePort;
  targetPort: CanvasTargetPort;
};

export type CanvasBoardData = {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: CanvasViewport;
  snapToGrid?: boolean;
};

export type CanvasBoard = CanvasBoardData & {
  id: string;
  projectId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasBoardSummary = {
  id: string;
  projectId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
};

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { x: 0, y: 0, k: 1 };

export function emptyCanvasBoardData(): CanvasBoardData {
  return {
    nodes: [],
    connections: [],
    viewport: DEFAULT_CANVAS_VIEWPORT,
    snapToGrid: false,
  };
}
