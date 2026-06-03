import type { GptImageQuality, ImageAspectRatio, ImageModelId, ImageSizeTier } from "@/lib/image-workspace";

export type CanvasPosition = {
  x: number;
  y: number;
};

export type CanvasViewport = {
  x: number;
  y: number;
  k: number;
};

export type CanvasNodeType = "text" | "image" | "video" | "group";

export type CanvasSourcePort = "output";

export type CanvasTargetPort = "source" | "prompt" | "imageReference" | "firstFrame" | "lastFrame" | "videoReference";

export type CanvasNodeMetadata = {
  text?: string;
  prompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  mimeType?: string;
  source?: "upload" | "manual";
  /** Group node: ordered list of child node IDs */
  children?: string[];
  /** Child node: ID of the parent group node */
  parentId?: string;
  /** image/video node generation-mode runtime */
  modelId?: ImageModelId;
  aspectRatio?: ImageAspectRatio;
  imageSize?: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  status?: "idle" | "running" | "success" | "error";
  lastRunAt?: string;
  lastError?: string;
  /** image node: inline preview URL (may differ from imageUrl during generation) */
  previewImageUrl?: string;
  /** video node: inline preview URL */
  previewVideoUrl?: string;
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
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasBoardSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  imageCount: number;
  videoCount: number;
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
