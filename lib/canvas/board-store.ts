import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CanvasBoard,
  CanvasBoardData,
  CanvasBoardSummary,
  CanvasConnection,
  CanvasNode,
  CanvasViewport,
} from "@/lib/canvas/types";
import { normalizeConnectionPorts } from "@/lib/canvas/connection-rules";
import { DEFAULT_CANVAS_VIEWPORT, emptyCanvasBoardData } from "@/lib/canvas/types";
import {
  DEFAULT_IMAGE_SETTINGS,
  GPT_IMAGE_QUALITY_ORDER,
  IMAGE_MODEL_ORDER,
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import {
  VIDEO_MODEL_ORDER,
  type VideoAspectRatio,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";

type CanvasBoardRow = {
  id: string;
  title: string | null;
  data: unknown;
  created_at: string;
  updated_at: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeViewport(value: unknown): CanvasViewport {
  if (!isObject(value)) return DEFAULT_CANVAS_VIEWPORT;
  const x = Number(value.x);
  const y = Number(value.y);
  const k = Number(value.k);
  return {
    x: Number.isFinite(x) ? x : DEFAULT_CANVAS_VIEWPORT.x,
    y: Number.isFinite(y) ? y : DEFAULT_CANVAS_VIEWPORT.y,
    k: Number.isFinite(k) ? Math.min(Math.max(k, 0.05), 5) : DEFAULT_CANVAS_VIEWPORT.k,
  };
}

function normalizeNode(value: unknown): CanvasNode | null {
  if (!isObject(value)) return null;
  // Auto-migrate legacy gen node types
  let rawType = value.type;
  if (rawType === "imageGen") rawType = "image";
  if (rawType === "videoGen") rawType = "video";
  const type =
    rawType === "image" || rawType === "text" || rawType === "video" || rawType === "audio" || rawType === "group"
      ? rawType
      : null;
  const id = typeof value.id === "string" ? value.id : "";
  if (!type || !id) return null;
  const position = normalizePosition(value.position);
  const width = Number(value.width);
  const height = Number(value.height);
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const imageUrl = typeof metadata.imageUrl === "string" ? metadata.imageUrl : undefined;
  const videoUrl = typeof metadata.videoUrl === "string" ? metadata.videoUrl : undefined;
  const audioUrl = typeof metadata.audioUrl === "string" ? metadata.audioUrl : undefined;
  const fallbackWidth = type === "image" || type === "video" ? 280 : type === "audio" ? 320 : type === "group" ? 400 : 260;
  const fallbackHeight = type === "image" || type === "video" ? 220 : type === "audio" ? 96 : type === "group" ? 300 : 150;
  const imageModelId = normalizeImageModelId(metadata.imageModelId ?? metadata.modelId);
  const aspectRatio = normalizeImageAspectRatio(metadata.aspectRatio);
  const imageSize = normalizeImageSizeTier(metadata.imageSize);
  const gptImageQuality = normalizeGptImageQuality(metadata.gptImageQuality);
  const videoModelId = normalizeVideoModelId(metadata.videoModelId ?? metadata.modelId);
  const videoModeId = normalizeVideoModeId(metadata.videoModeId);
  const videoAspectRatio = normalizeVideoAspectRatio(metadata.videoAspectRatio ?? metadata.aspectRatio);
  const videoResolution = normalizeVideoResolution(metadata.videoResolution);
  const videoDurationSeconds = normalizeVideoDurationSeconds(metadata.videoDurationSeconds);
  return {
    id,
    type,
    title: typeof value.title === "string" && value.title.trim() ? value.title : defaultNodeTitle(type),
    position,
    width: Number.isFinite(width) && width > 0 ? width : fallbackWidth,
    height: Number.isFinite(height) && height > 0 ? height : fallbackHeight,
    metadata: {
      text: typeof metadata.text === "string" ? metadata.text : undefined,
      textMode:
        type === "text"
          ? metadata.textMode === "chat" || metadata.textMode === "chooser"
            ? "chat"
            : "manual"
          : undefined,
      chatConversationId: type === "text" && typeof metadata.chatConversationId === "string" ? metadata.chatConversationId : undefined,
      chatInput: type === "text" && typeof metadata.chatInput === "string" ? metadata.chatInput : undefined,
      chatStatus: type === "text" ? normalizeTextNodeChatStatus(metadata.chatStatus) : undefined,
      chatLastError: type === "text" && typeof metadata.chatLastError === "string" ? metadata.chatLastError : undefined,
      chatPreferredLlmModelId: type === "text" && typeof metadata.chatPreferredLlmModelId === "string" ? metadata.chatPreferredLlmModelId : undefined,
      chatPreferredImageModelId: type === "text" ? normalizeOptionalImageModelId(metadata.chatPreferredImageModelId) : undefined,
      chatLastAssistantMessageId: type === "text" && typeof metadata.chatLastAssistantMessageId === "string" ? metadata.chatLastAssistantMessageId : undefined,
      chatPreviewMarkdown: type === "text" && typeof metadata.chatPreviewMarkdown === "string" ? metadata.chatPreviewMarkdown : undefined,
      prompt: typeof metadata.prompt === "string" ? metadata.prompt : undefined,
      imageUrl: imageUrl && !isUnsafeMediaString(imageUrl) ? imageUrl : undefined,
      videoUrl: videoUrl && !isUnsafeMediaString(videoUrl) ? videoUrl : undefined,
      audioUrl: audioUrl && !isUnsafeMediaString(audioUrl) ? audioUrl : undefined,
      naturalWidth: Number.isFinite(Number(metadata.naturalWidth)) ? Number(metadata.naturalWidth) : undefined,
      naturalHeight: Number.isFinite(Number(metadata.naturalHeight)) ? Number(metadata.naturalHeight) : undefined,
      audioDurationSeconds: Number.isFinite(Number(metadata.audioDurationSeconds)) ? Number(metadata.audioDurationSeconds) : undefined,
      mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : undefined,
      source: metadata.source === "upload" ? "upload" : metadata.source === "manual" ? "manual" : undefined,
      children: Array.isArray(metadata.children) ? metadata.children.filter((c): c is string => typeof c === "string") : undefined,
      parentId: typeof metadata.parentId === "string" ? metadata.parentId : undefined,
      imageModelId: type === "image" ? imageModelId : undefined,
      aspectRatio: type === "image" ? aspectRatio : undefined,
      imageSize: type === "image" ? imageSize : undefined,
      gptImageQuality: type === "image" && imageModelId === "gpt-image-2" ? gptImageQuality : undefined,
      videoModelId: type === "video" ? videoModelId : undefined,
      videoModeId: type === "video" ? videoModeId : undefined,
      videoAspectRatio: type === "video" ? videoAspectRatio : undefined,
      videoResolution: type === "video" ? videoResolution : undefined,
      videoDurationSeconds: type === "video" ? videoDurationSeconds : undefined,
      status: (type === "image" || type === "video") ? normalizeImageNodeStatus(metadata.status) : undefined,
      lastRunAt: (type === "image" || type === "video") && typeof metadata.lastRunAt === "string" ? metadata.lastRunAt : undefined,
      lastError: (type === "image" || type === "video") && typeof metadata.lastError === "string" ? metadata.lastError : undefined,
      previewImageUrl: type === "image" && typeof metadata.previewImageUrl === "string" ? metadata.previewImageUrl : undefined,
      previewVideoUrl: type === "video" && typeof metadata.previewVideoUrl === "string" ? metadata.previewVideoUrl : undefined,
    },
  };
}

function normalizeImageModelId(value: unknown): ImageModelId {
  return IMAGE_MODEL_ORDER.includes(value as ImageModelId) ? (value as ImageModelId) : "gpt-image-2";
}

function normalizeOptionalImageModelId(value: unknown): ImageModelId | undefined {
  return IMAGE_MODEL_ORDER.includes(value as ImageModelId) ? (value as ImageModelId) : undefined;
}

function normalizeVideoModelId(value: unknown): VideoModelId {
  return VIDEO_MODEL_ORDER.includes(value as VideoModelId) ? (value as VideoModelId) : "seedance-2.0";
}

function normalizeVideoModeId(value: unknown): VideoGenerationModeId {
  switch (value) {
    case "text_to_video":
    case "start_frame":
    case "start_end_frame":
    case "multi_image_reference":
    case "motion_control":
      return value;
    default:
      return "text_to_video";
  }
}

function normalizeImageAspectRatio(value: unknown): ImageAspectRatio {
  switch (value) {
    case "auto":
    case "1:1":
    case "2:3":
    case "3:2":
    case "3:4":
    case "4:3":
    case "9:16":
    case "16:9":
    case "21:9":
      return value;
    default:
      return "4:3";
  }
}

function normalizeVideoAspectRatio(value: unknown): VideoAspectRatio {
  switch (value) {
    case "1:1":
    case "4:3":
    case "3:4":
    case "16:9":
    case "9:16":
    case "21:9":
    case "9:21":
      return value;
    default:
      return "16:9";
  }
}

function normalizeImageSizeTier(value: unknown): ImageSizeTier {
  return value === "1K" || value === "2K" || value === "4K" ? value : "1K";
}

function normalizeGptImageQuality(value: unknown): GptImageQuality {
  return GPT_IMAGE_QUALITY_ORDER.includes(value as GptImageQuality)
    ? (value as GptImageQuality)
    : DEFAULT_IMAGE_SETTINGS.gptImageQuality;
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  switch (value) {
    case "480p":
    case "720p":
    case "1080p":
    case "4k":
      return value;
    default:
      return "1080p";
  }
}

function normalizeVideoDurationSeconds(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function normalizeImageNodeStatus(value: unknown): "idle" | "running" | "success" | "error" {
  return value === "running" || value === "success" || value === "error" ? value : "idle";
}

function normalizeTextNodeChatStatus(value: unknown): "idle" | "running" | "success" | "error" | undefined {
  if (value === "running" || value === "success" || value === "error") return value;
  if (value === "idle") return "idle";
  return undefined;
}

function defaultNodeTitle(type: CanvasNode["type"]): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  if (type === "audio") return "音频";
  if (type === "group") return "素材组";
  return "文本";
}

function normalizePosition(value: unknown) {
  if (!isObject(value)) return { x: 0, y: 0 };
  const x = Number(value.x);
  const y = Number(value.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function normalizeConnection(value: unknown, nodeMap: Map<string, CanvasNode>, existing: CanvasConnection[]): CanvasConnection | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const fromNodeId = typeof value.fromNodeId === "string" ? value.fromNodeId : "";
  const toNodeId = typeof value.toNodeId === "string" ? value.toNodeId : "";
  const from = nodeMap.get(fromNodeId);
  const to = nodeMap.get(toNodeId);
  if (!id || !from || !to || fromNodeId === toNodeId) return null;
  return normalizeConnectionPorts(
    {
      id,
      fromNodeId,
      toNodeId,
      sourcePort: value.sourcePort === "output" ? "output" : undefined,
      targetPort:
        value.targetPort === "source" ||
        value.targetPort === "prompt" ||
        value.targetPort === "imageReference" ||
        value.targetPort === "firstFrame" ||
        value.targetPort === "lastFrame" ||
        value.targetPort === "videoReference" ||
        value.targetPort === "audioReference"
          ? value.targetPort
          : undefined,
    },
    from,
    to,
    existing
  );
}

function isUnsafeMediaString(value: string): boolean {
  return /^data:(image|video|audio)\//i.test(value.trim()) || /^blob:/i.test(value.trim());
}

function assertNoInlineMedia(value: unknown): void {
  if (typeof value === "string") {
    if (isUnsafeMediaString(value)) throw new Error("画布数据不能保存内联图片");
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(assertNoInlineMedia);
    return;
  }
  Object.values(value).forEach(assertNoInlineMedia);
}

export function normalizeBoardData(value: unknown): CanvasBoardData {
  if (!isObject(value)) return emptyCanvasBoardData();
  const nodes = Array.isArray(value.nodes) ? value.nodes.map(normalizeNode).filter((node): node is CanvasNode => Boolean(node)) : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connections: CanvasConnection[] = [];
  if (Array.isArray(value.connections)) {
    for (const item of value.connections) {
      const conn = normalizeConnection(item, nodeMap, connections);
      if (conn) connections.push(conn);
    }
  }
  return {
    nodes,
    connections,
    viewport: normalizeViewport(value.viewport),
    snapToGrid: value.snapToGrid === true,
  };
}

function rowToBoard(row: CanvasBoardRow): CanvasBoard {
  const data = normalizeBoardData(row.data);
  return {
    id: row.id,
    title: row.title?.trim() || "未命名画布",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...data,
  };
}

function rowToSummary(row: CanvasBoardRow): CanvasBoardSummary {
  const board = rowToBoard(row);
  return {
    id: board.id,
    title: board.title,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    nodeCount: board.nodes.length,
    imageCount: board.nodes.filter((node) => node.type === "image").length,
    videoCount: board.nodes.filter((node) => node.type === "video").length,
    audioCount: board.nodes.filter((node) => node.type === "audio").length,
  };
}

export async function listCanvasBoards(supabase: SupabaseClient): Promise<CanvasBoardSummary[]> {
  const { data, error } = await supabase.from("canvas_boards").select("id, title, data, created_at, updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CanvasBoardRow[]).map(rowToSummary);
}

export async function getCanvasBoard(supabase: SupabaseClient, id: string): Promise<CanvasBoard | null> {
  const { data, error } = await supabase.from("canvas_boards").select("id, title, data, created_at, updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToBoard(data as CanvasBoardRow) : null;
}

export async function createCanvasBoard(supabase: SupabaseClient, userId: string, id: string, title: string): Promise<CanvasBoard> {
  const now = new Date().toISOString();
  const data = emptyCanvasBoardData();
  const { error } = await supabase.from("canvas_boards").insert({
    id,
    user_id: userId,
    title: title.trim() || "未命名画布",
    data,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return {
    id,
    title: title.trim() || "未命名画布",
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

export async function updateCanvasBoard(
  supabase: SupabaseClient,
  id: string,
  updates: { title?: string; data?: CanvasBoardData },
): Promise<CanvasBoard | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof updates.title === "string") patch.title = updates.title.trim() || "未命名画布";
  if (updates.data) {
    assertNoInlineMedia(updates.data);
    patch.data = normalizeBoardData(updates.data);
  }
  const { data, error } = await supabase.from("canvas_boards").update(patch).eq("id", id).select("id, title, data, created_at, updated_at").maybeSingle();
  if (error) throw error;
  return data ? rowToBoard(data as CanvasBoardRow) : null;
}

export async function deleteCanvasBoard(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("canvas_boards").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
