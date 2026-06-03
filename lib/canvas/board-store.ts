import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CanvasBoard,
  CanvasBoardData,
  CanvasBoardSummary,
  CanvasConnection,
  CanvasNode,
  CanvasViewport,
} from "@/lib/canvas/types";
import { DEFAULT_CANVAS_VIEWPORT, emptyCanvasBoardData } from "@/lib/canvas/types";

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
  const type =
    value.type === "image" || value.type === "text" || value.type === "video" || value.type === "imageGen" || value.type === "videoGen" || value.type === "group"
      ? value.type
      : null;
  const id = typeof value.id === "string" ? value.id : "";
  if (!type || !id) return null;
  const position = normalizePosition(value.position);
  const width = Number(value.width);
  const height = Number(value.height);
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const imageUrl = typeof metadata.imageUrl === "string" ? metadata.imageUrl : undefined;
  const videoUrl = typeof metadata.videoUrl === "string" ? metadata.videoUrl : undefined;
  const fallbackWidth = type === "image" || type === "video" ? 280 : type === "group" ? 400 : 260;
  const fallbackHeight = type === "image" || type === "video" ? 220 : type === "group" ? 300 : 150;
  return {
    id,
    type,
    title: typeof value.title === "string" && value.title.trim() ? value.title : defaultNodeTitle(type),
    position,
    width: Number.isFinite(width) && width > 0 ? width : fallbackWidth,
    height: Number.isFinite(height) && height > 0 ? height : fallbackHeight,
    metadata: {
      text: typeof metadata.text === "string" ? metadata.text : undefined,
      prompt: typeof metadata.prompt === "string" ? metadata.prompt : undefined,
      imageUrl: imageUrl && !isUnsafeMediaString(imageUrl) ? imageUrl : undefined,
      videoUrl: videoUrl && !isUnsafeMediaString(videoUrl) ? videoUrl : undefined,
      naturalWidth: Number.isFinite(Number(metadata.naturalWidth)) ? Number(metadata.naturalWidth) : undefined,
      naturalHeight: Number.isFinite(Number(metadata.naturalHeight)) ? Number(metadata.naturalHeight) : undefined,
      mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : undefined,
      source: metadata.source === "upload" ? "upload" : metadata.source === "manual" ? "manual" : undefined,
      children: Array.isArray(metadata.children) ? metadata.children.filter((c): c is string => typeof c === "string") : undefined,
      parentId: typeof metadata.parentId === "string" ? metadata.parentId : undefined,
    },
  };
}

function defaultNodeTitle(type: CanvasNode["type"]): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  if (type === "imageGen") return "生图节点";
  if (type === "videoGen") return "生视频节点";
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

function normalizeConnection(value: unknown, nodeIds: Set<string>): CanvasConnection | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const fromNodeId = typeof value.fromNodeId === "string" ? value.fromNodeId : "";
  const toNodeId = typeof value.toNodeId === "string" ? value.toNodeId : "";
  if (!id || !nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId) || fromNodeId === toNodeId) return null;
  return { id, fromNodeId, toNodeId };
}

function isUnsafeMediaString(value: string): boolean {
  return /^data:(image|video)\//i.test(value.trim()) || /^blob:/i.test(value.trim());
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
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = Array.isArray(value.connections)
    ? value.connections.map((item) => normalizeConnection(item, nodeIds)).filter((conn): conn is CanvasConnection => Boolean(conn))
    : [];
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
