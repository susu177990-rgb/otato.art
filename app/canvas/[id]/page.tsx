"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import shellStyles from "@/app/shared/shell.module.css";
import { fetchWorkspaceSnapshot } from "@/lib/workspace-api";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import { PromptPresetLibraryDialog } from "@/components/prompt-presets/PromptPresetLibraryDialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPortal } from "react-dom";
import type { SitePromptPreset, PromptPresetKind } from "@/lib/db/prompt-preset-store";
import { detectMediaKind, mediaContentType, mediaFileExtension } from "@/lib/media-file";
import {
  DEFAULT_IMAGE_SETTINGS,
  GPT_IMAGE_QUALITY_LABELS,
  GPT_IMAGE_QUALITY_ORDER,
  IMAGE_MODEL_ORDER,
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageGalleryRecord,
  type ImageModelId,
  type ImageSizeTier,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_MODEL_ORDER,
  defaultModeForModel,
  getVideoCapabilities,
  type VideoAspectRatio,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
  type VideoWorkspaceSettings,
  UI_VIDEO_MODES,
} from "@/lib/video-workspace";
import { AssetMentionEditor } from "@/components/AssetMentionEditor";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { useProjectCanvasRouteOptions } from "@/components/project-canvas/project-canvas-route-context";
import type { AssetMentionCandidate, AssetMentionRole } from "@/lib/asset-mentions";
import type { ChatConversation, ChatMessage } from "@/lib/chat/types";
import { isImeCompositionKeyEvent } from "@/lib/ime-enter";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type {
  CanvasBoard,
  CanvasBoardData,
  CanvasConnection,
  CanvasNode,
  CanvasNodeType,
  CanvasPosition,
  CanvasTargetPort,
  CanvasViewport,
} from "@/lib/canvas/types";
import {
  canStartConnection,
  getTargetPorts,
  inferTargetPort,
  makeCanvasConnection,
} from "@/lib/canvas/connection-rules";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas/types";
import { CanvasAudioPlayer, CanvasIcon, type CanvasIconName } from "./canvas-ui";
import styles from "../canvas-page.module.css";
import { formatGenerationErrorForDisplay } from "@/lib/generation-error-classifier";

// ─── Interaction state types ───────────────────────────────────────────────────


type DragState = {
  nodeId: string;
  startX: number;
  startY: number;
  initial: CanvasPosition;
  coselected: Map<string, CanvasPosition>;
  moved: boolean;
};

type PanState = { startX: number; startY: number; initial: CanvasViewport };
type MinimapPanState = { startX: number; startY: number; initial: CanvasViewport; moved: boolean };
type UploadKind = "image" | "video" | "audio";
type MenuState =
  | { kind: "canvas"; x: number; y: number; world: CanvasPosition }
  | { kind: "node"; x: number; y: number; nodeId: string }
  | { kind: "connection"; x: number; y: number; connectionId: string }
  | null;

type CanvasPickerOption = {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
};

type CanvasPickerMenuState = {
  anchor: { left: number; top: number; width: number; height: number };
  options: CanvasPickerOption[];
} | null;


type CanvasImageGenerateResponse = {
  sourceNode: CanvasNode;
  galleryRecord: ImageGalleryRecord;
};

type CanvasVideoGenerateResponse = {
  sourceNode: CanvasNode;
  galleryRecord: VideoGalleryRecord;
};

type CanvasChatRunResponse = {
  sourceNode: CanvasNode;
  conversation: ChatConversation;
};

type ConnectionDraft = {
  mode: "fromOutput" | "toInput";
  anchorNodeId: string;
  fromNodeId: string | null;
  /** Current cursor position in world coordinates (snapped to target port when near) */
  current: CanvasPosition;
  targetNodeId: string | null;
  targetPort: CanvasTargetPort | null;
  message: string | null;
};

type SelectBoxScreen = {
  screenX0: number;
  screenY0: number;
  screenX1: number;
  screenY1: number;
} | null;

type HistoryEntry = { nodes: CanvasNode[]; connections: CanvasConnection[] };

type SmartGuide = { axis: "x" | "y"; pos: number; start: number; end: number };

/** Pending canvas pointer — we wait to see if it becomes a click or a drag */
type CanvasPending = { startX: number; startY: number; world: CanvasPosition };

/** Quick-add bar shown after a single click on empty canvas */
type QuickAddBar = { left: number; top: number; world: CanvasPosition } | null;

const MAX_HISTORY = 40;
const GROUP_PAD = 28;
const DRAG_THRESHOLD = 5;
const PORT_SNAP_RADIUS = 80;
const GRID_SIZE = 32;

// ─── Pure utilities ────────────────────────────────────────────────────────────

function menuAnchorFromElement(element: HTMLElement): { left: number; top: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("无法读取图片尺寸"));
    img.src = url;
  });
}

function readVideoSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.onloadedmetadata = () => resolve({ width: video.videoWidth || 16, height: video.videoHeight || 9 });
    video.onerror = () => resolve({ width: 16, height: 9 });
    video.src = url;
  });
}

function readVideoDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => resolve(undefined);
    video.src = url;
  });
}

function readAudioDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
    audio.onerror = () => resolve(undefined);
    audio.src = url;
  });
}

function clampViewport(vp: CanvasViewport): CanvasViewport {
  return { x: vp.x, y: vp.y, k: Math.min(Math.max(vp.k, 0.05), 5) };
}

function snapPosition(pos: CanvasPosition): CanvasPosition {
  return {
    x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
  };
}

function snapNode(node: CanvasNode): CanvasNode {
  return { ...node, position: snapPosition(node.position) };
}

/** Normalize wheel delta to pixels (handles deltaMode: line / page) */
function normWheelDelta(e: WheelEvent) {
  const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
  return { dx: e.deltaX * factor, dy: e.deltaY * factor };
}

function isCanvasGestureBlockedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(
    target.closest("textarea,input,select,button,video,audio,[contenteditable='true'],[data-canvas-no-zoom],[data-canvas-scroll-area]"),
  );
}

function bezierPath(from: CanvasNode, to: CanvasNode, targetPort: CanvasTargetPort) {
  const { start, cp1, cp2, end } = connectionBezierControls(from, to, targetPort);
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

function connectionBezierControls(from: CanvasNode, to: CanvasNode, targetPort: CanvasTargetPort) {
  const start = getOutputPortPos(from);
  const end = getInputPortPos(to, targetPort);
  const dir = end.x >= start.x ? 1 : -1;
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;
  const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
  return {
    start,
    cp1: { x: x1 + dx * dir, y: y1 },
    cp2: { x: x2 - dx * dir, y: y2 },
    end,
  };
}

function draftBezierPath(start: CanvasPosition, to: CanvasPosition) {
  const x1 = start.x;
  const y1 = start.y;
  const dir = to.x > x1 ? 1 : -1;
  const dx = Math.max(80, Math.abs(to.x - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx * dir} ${y1}, ${to.x - dx * dir} ${to.y}, ${to.x} ${to.y}`;
}

function connectionCenterPos(from: CanvasNode, to: CanvasNode, targetPort: CanvasTargetPort): CanvasPosition {
  const start = getOutputPortPos(from);
  const end = getInputPortPos(to, targetPort);
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function cubicBezierPoint(
  start: CanvasPosition,
  cp1: CanvasPosition,
  cp2: CanvasPosition,
  end: CanvasPosition,
  t: number
): CanvasPosition {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * start.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t2 * t * end.x,
    y: mt2 * mt * start.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t2 * t * end.y,
  };
}

function connectionIntersectsRect(
  from: CanvasNode,
  to: CanvasNode,
  targetPort: CanvasTargetPort,
  rect: { x0: number; y0: number; x1: number; y1: number }
) {
  const { start, cp1, cp2, end } = connectionBezierControls(from, to, targetPort);
  for (let i = 0; i <= 36; i += 1) {
    const point = cubicBezierPoint(start, cp1, cp2, end, i / 36);
    if (point.x >= rect.x0 && point.x <= rect.x1 && point.y >= rect.y0 && point.y <= rect.y1) {
      return true;
    }
  }
  return false;
}

function getOutputPortPos(node: CanvasNode): CanvasPosition {
  return {
    x: node.position.x + node.width,
    y: node.position.y + node.height / 2,
  };
}

function getInputPortPos(node: CanvasNode, targetPort: CanvasTargetPort): CanvasPosition {
  void targetPort;
  return {
    x: node.position.x,
    y: node.position.y + node.height / 2,
  };
}

function getDraftStartPos(draft: ConnectionDraft, anchor: CanvasNode): CanvasPosition {
  return draft.mode === "toInput" ? getInputPortPos(anchor, "prompt") : getOutputPortPos(anchor);
}

function findConnectionTarget(
  nodes: CanvasNode[],
  point: CanvasPosition,
  fromNodeId: string,
  connections: CanvasConnection[]
): { nodeId: string; targetPort: CanvasTargetPort; dist: number } | null {
  const from = nodes.find((n) => n.id === fromNodeId);
  if (!from) return null;
  let best: { nodeId: string; targetPort: CanvasTargetPort; dist: number } | null = null;
  for (const n of nodes) {
    if (n.id === fromNodeId || n.type === "group") continue;
    const inferred = inferTargetPort(from, n, connections);
    if (!inferred.targetPort) continue;
    const portPos = getInputPortPos(n, inferred.targetPort);
    const dist = Math.hypot(point.x - portPos.x, point.y - portPos.y);
    if (dist < PORT_SNAP_RADIUS && (!best || dist < best.dist)) {
      best = { nodeId: n.id, targetPort: inferred.targetPort, dist };
    }
  }
  return best;
}

function findConnectionSource(
  nodes: CanvasNode[],
  point: CanvasPosition,
  targetNodeId: string,
  connections: CanvasConnection[]
): { nodeId: string; targetPort: CanvasTargetPort; dist: number } | null {
  const target = nodes.find((n) => n.id === targetNodeId);
  if (!target) return null;
  let best: { nodeId: string; targetPort: CanvasTargetPort; dist: number } | null = null;
  for (const n of nodes) {
    if (n.id === targetNodeId || n.type === "group") continue;
    const inferred = inferTargetPort(n, target, connections);
    if (!inferred.targetPort) continue;
    const portPos = getOutputPortPos(n);
    const dist = Math.hypot(point.x - portPos.x, point.y - portPos.y);
    if (dist < PORT_SNAP_RADIUS && (!best || dist < best.dist)) {
      best = { nodeId: n.id, targetPort: inferred.targetPort, dist };
    }
  }
  return best;
}

function fitMediaSize(size: { width: number; height: number }, maxW = 360, maxH = 300) {
  const ratio = size.width / size.height || 1;
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { width: w, height: h };
}

function newNodeId(type: CanvasNodeType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function presetModelLabels(kind?: PromptPresetKind) {
  if (kind === "image") return ["GPT Image", "Nano Banana"];
  if (kind === "video") return ["Seedance", "Kling", "Veo"];
  if (kind === "chat") return ["LLM"];
  return ["预设"];
}

function makePresetNode(pos: CanvasPosition, preset: SitePromptPreset): CanvasNode {
  const width = 320;
  const height = 214;
  return {
    id: newNodeId("text"),
    type: "text",
    title: preset.title,
    position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    width,
    height,
    metadata: {
      text: preset.promptTemplate,
      textMode: "manual",
      presetId: preset.id,
      presetKind: preset.kind,
      presetDescription: preset.description,
      prompt: preset.promptTemplate,
      previewImageUrl: preset.coverImageUrl,
    },
  };
}

function makeTextNode(pos: CanvasPosition): CanvasNode {
  return {
    id: newNodeId("text"),
    type: "text",
    title: "文本",
    position: { x: pos.x - 140, y: pos.y - 140 },
    width: 280,
    height: 280,
    metadata: {
      text: "",
      textMode: "chat",
      chatInput: "",
      chatStatus: "idle",
      chatPreferredLlmModelId: DEFAULT_SETTINGS.defaultModelId,
      chatPreviewMarkdown: "",
    },
  };
}

function textNodeOutput(node: CanvasNode): string | undefined {
  if (node.type !== "text") return undefined;
  if (node.metadata?.textMode === "chat") {
    return node.metadata.chatPreviewMarkdown || node.metadata.text;
  }
  return node.metadata?.text;
}

function isPresetTextNode(node: CanvasNode): boolean {
  return node.type === "text" && Boolean(node.metadata?.presetId);
}

function presetCoverFitSize(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
  return fitMediaSize({ width: naturalWidth, height: naturalHeight }, 360, 300);
}

function makeEmptyImageNode(
  pos: CanvasPosition,
  imageDefaults?: {
    imageModelId: ImageModelId;
    aspectRatio: ImageAspectRatio;
    imageSize: ImageSizeTier;
    gptImageQuality: GptImageQuality;
  },
): CanvasNode {
  return {
    id: newNodeId("image"),
    type: "image",
    title: "图片",
    position: { x: pos.x - 140, y: pos.y - 140 },
    width: 280,
    height: 280,
    metadata: {
      prompt: "",
      imageModelId: imageDefaults?.imageModelId ?? "gpt-image-2",
      aspectRatio: imageDefaults?.aspectRatio ?? "4:3",
      imageSize: imageDefaults?.imageSize ?? "1K",
      gptImageQuality: imageDefaults?.gptImageQuality ?? DEFAULT_IMAGE_SETTINGS.gptImageQuality,
      status: "idle",
    },
  };
}

function makeEmptyVideoNode(
  pos: CanvasPosition,
  videoDefaults?: {
    videoModelId: VideoModelId;
    videoModeId: VideoGenerationModeId;
    videoAspectRatio: VideoAspectRatio;
    videoResolution: VideoResolution;
    videoDurationSeconds: number;
  },
): CanvasNode {
  return {
    id: newNodeId("video"),
    type: "video",
    title: "视频",
    position: { x: pos.x - 140, y: pos.y - 140 },
    width: 280,
    height: 280,
    metadata: {
      prompt: "",
      videoModelId: videoDefaults?.videoModelId ?? "seedance-2.0",
      videoModeId: videoDefaults?.videoModeId ?? "text_to_video",
      videoAspectRatio: videoDefaults?.videoAspectRatio ?? "16:9",
      videoResolution: videoDefaults?.videoResolution ?? "1080p",
      videoDurationSeconds: videoDefaults?.videoDurationSeconds ?? 5,
      status: "idle",
    },
  };
}

function makeMediaNode(
  pos: CanvasPosition,
  kind: UploadKind,
  media: { url: string; width: number; height: number; mimeType: string; filename?: string; videoDurationSeconds?: number; audioDurationSeconds?: number },
): CanvasNode {
  const size = kind === "audio" ? { width: 360, height: 116 } : fitMediaSize(media);
  const title = media.filename || (kind === "image" ? "图片" : kind === "video" ? "视频" : "音频");
  return {
    id: newNodeId(kind), type: kind, title,
    position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    width: size.width, height: size.height,
    metadata: {
      imageUrl: kind === "image" ? media.url : undefined,
      videoUrl: kind === "video" ? media.url : undefined,
      audioUrl: kind === "audio" ? media.url : undefined,
      naturalWidth: kind === "audio" ? undefined : media.width,
      naturalHeight: kind === "audio" ? undefined : media.height,
      videoDurationSeconds: kind === "video" ? media.videoDurationSeconds : undefined,
      audioDurationSeconds: media.audioDurationSeconds,
      mimeType: media.mimeType,
      source: "upload",
    },
  };
}

function nodeTypeIcon(type: CanvasNodeType): CanvasIconName {
  if (type === "group") return "group";
  if (type === "image") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";

  return "text";
}

function nodeTypeColor(type: CanvasNodeType) {
  if (type === "group") return "#a1a1aa";
  if (type === "image") return "#60a5fa";
  if (type === "video") return "#f472b6";
  if (type === "audio") return "#facc15";

  return "#6ee7b7";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CanvasBoardPage() {
  const params = useParams<{ id?: string }>();
  const routeOptions = useProjectCanvasRouteOptions();
  const boardId = routeOptions?.boardId ?? params.id ?? "";
  const backHref = routeOptions?.backHref ?? "/canvas";
  const backLabel = routeOptions?.backLabel ?? "返回画布库";
  const displayTitle = routeOptions?.displayTitle;
  const titleEditable = routeOptions?.titleEditable ?? true;
  const projectId = routeOptions?.projectId;
  const isProjectCanvas = Boolean(routeOptions);

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetNodeRef = useRef<string | null>(null);

  // Interaction refs — never trigger re-render
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const minimapPanRef = useRef<MinimapPanState | null>(null);
  const selectBoxStartRef = useRef<{ x: number; y: number } | null>(null);
  const canvasPendingRef = useRef<CanvasPending | null>(null);
  const menuWorldRef = useRef<CanvasPosition | null>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<CanvasNode[]>([]);
  const connectionsRef = useRef<CanvasConnection[]>([]);
  const connectionDraftRef = useRef<ConnectionDraft | null>(null);
  const viewportRef = useRef<CanvasViewport>(DEFAULT_CANVAS_VIEWPORT);
  const snapToGridRef = useRef(false);
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoHistoryRef = useRef<HistoryEntry[]>([]);
  /** Internal node clipboard for Ctrl+C / Ctrl+V */
  const nodeClipboardRef = useRef<CanvasNode[]>([]);
  /** True while Space key is held — left-drag becomes pan */
  const spaceHeldRef = useRef(false);

  // React state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("无限画布");
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [viewport, setViewport] = useState<CanvasViewport>(DEFAULT_CANVAS_VIEWPORT);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<Set<string>>(new Set());
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [, setUploading] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [canvasPickerMenu, setCanvasPickerMenu] = useState<CanvasPickerMenuState>(null);
  const [selectBox, setSelectBox] = useState<SelectBoxScreen>(null);
  const [quickAddBar, setQuickAddBar] = useState<QuickAddBar>(null);
  const [editingNodeTitleId, setEditingNodeTitleId] = useState<string | null>(null);
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Preset Library States
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [presetAddNodePos, setPresetAddNodePos] = useState<CanvasPosition | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [videoSettings, setVideoSettings] = useState<VideoWorkspaceSettings>(DEFAULT_VIDEO_SETTINGS);
  const [imagePreviewNode, setImagePreviewNode] = useState<CanvasNode | null>(null);
  const [llmSettings, setLlmSettings] = useState<Settings>(DEFAULT_SETTINGS);
  /** Whether Space key is held — drives cursor CSS class */
  const [spacePanMode, setSpacePanMode] = useState(false);
  /** Whether pointer is actively panning */
  const [isPanning, setIsPanning] = useState(false);
  /** Whether clipboard has nodes (drives menu item enabled state) */
  const [hasClipboard, setHasClipboard] = useState(false);
  /** Active smart guides for rendering during drag */
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const getCandidatesForNode = useCallback((currentNodeId: string): AssetMentionCandidate[] => {
    const incomingConnections = connections.filter((conn) => conn.toNodeId === currentNodeId);
    const typeCounts: Record<string, number> = {};
    return incomingConnections
      .flatMap((conn): AssetMentionCandidate[] => {
        const n = nodes.find((node) => node.id === conn.fromNodeId);
        if (!n || n.id === currentNodeId) return [];
        const typeName = n.type === "image" ? "图" : n.type === "video" ? "视频" : n.type === "audio" ? "音频" : n.metadata?.presetId ? "预设" : "文本";
        typeCounts[typeName] = (typeCounts[typeName] ?? 0) + 1;
        const role: AssetMentionRole =
          conn.targetPort === "prompt"
            ? "prompt"
            : conn.targetPort === "firstFrame"
              ? "start_frame"
              : conn.targetPort === "lastFrame"
                ? "end_frame"
                : conn.targetPort === "videoReference"
                  ? nodeMap.get(currentNodeId)?.metadata?.videoModeId === "motion_control"
                    ? "motion_source_video"
                    : "video_reference"
                  : conn.targetPort === "audioReference"
                    ? "audio_reference"
                  : "image_reference";
        return [{
          id: n.id,
          label: `${typeName}${typeCounts[typeName]}`,
          type: "node" as const,
          role,
          nodeType: n.type === "text" || n.type === "image" || n.type === "video" || n.type === "audio" ? n.type : undefined,
          groupLabel: "已连接素材",
          description: conn.targetPort,
          thumbnailUrl: n.metadata?.previewImageUrl || n.metadata?.imageUrl,
          url: n.metadata?.imageUrl || n.metadata?.previewImageUrl || n.metadata?.videoUrl || n.metadata?.previewVideoUrl || n.metadata?.audioUrl,
          text: textNodeOutput(n),
        }];
      });
  }, [nodes, connections, nodeMap]);

  const sortedNodes = useMemo(() => {
    const groups = nodes.filter((n) => n.type === "group");
    const others = nodes.filter((n) => n.type !== "group");
    return [...groups, ...others];
  }, [nodes]);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { connectionDraftRef.current = connectionDraft; }, [connectionDraft]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { snapToGridRef.current = snapToGrid; }, [snapToGrid]);

  // ── Core helpers ────────────────────────────────────────────────────────────

  const markDirty = useCallback(() => {
    setDirty(true);
    setSaveStatus((s) => (s === "saving" ? s : "idle"));
  }, []);

  const pushHistory = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1)),
      { nodes: [...nodesRef.current], connections: [...connectionsRef.current] },
    ];
    redoHistoryRef.current = [];
  }, []);

  const setViewportBoth = useCallback((vp: CanvasViewport) => {
    setViewport(vp);
    viewportRef.current = vp;
  }, []);

  const setSnapToGridBoth = useCallback((value: boolean) => {
    setSnapToGrid(value);
    snapToGridRef.current = value;
  }, []);

  const screenToWorld = useCallback((clientX: number, clientY: number): CanvasPosition => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    return { x: (clientX - rect.left - vp.x) / vp.k, y: (clientY - rect.top - vp.y) / vp.k };
  }, []);

  const worldCenter = useCallback((): CanvasPosition => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    return { x: (rect.width / 2 - vp.x) / vp.k, y: (rect.height / 2 - vp.y) / vp.k };
  }, []);

  const dismissOverlays = useCallback(() => {
    setMenu(null);
    setCanvasPickerMenu(null);
    setQuickAddBar(null);
    setEditingNodeTitleId(null);
    setEditingTextNodeId(null);
    setPresetLibraryOpen(false);
    setPresetAddNodePos(null);
    setImagePreviewNode(null);
  }, []);

  const currentImageNodeDefaults = useCallback(() => ({
    imageModelId: "gpt-image-2" as ImageModelId,
    aspectRatio: "4:3" as ImageAspectRatio,
    imageSize: "1K" as ImageSizeTier,
    gptImageQuality: imageSettings.gptImageQuality,
  }), [imageSettings.gptImageQuality]);

  const currentVideoNodeDefaults = useCallback(() => {
    const videoModelId = videoSettings.uiDefaults.defaultModelId;
    const capabilities = getVideoCapabilities(videoModelId);
    const videoModeId = defaultModeForModel(videoSettings, videoModelId);
    return {
      videoModelId,
      videoModeId,
      videoAspectRatio: videoSettings.uiDefaults.defaultAspectRatio,
      videoResolution: videoSettings.uiDefaults.defaultResolution,
      videoDurationSeconds: capabilities.durations[0] ?? videoSettings.uiDefaults.defaultDurationSeconds,
    };
  }, [videoSettings]);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (isCanvasGestureBlockedTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    const { dx, dy } = normWheelDelta(event.nativeEvent);
    const current = viewportRef.current;

    if (event.ctrlKey || event.metaKey) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const factor = Math.pow(1.1, -dy / 100);
      const nextK = Math.min(Math.max(current.k * factor, 0.05), 5);
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldX = (mouseX - current.x) / current.k;
      const worldY = (mouseY - current.y) / current.k;
      setViewportBoth(clampViewport({
        x: mouseX - worldX * nextK,
        y: mouseY - worldY * nextK,
        k: nextK,
      }));
    } else {
      setViewportBoth(clampViewport({
        x: current.x - (event.shiftKey && dx === 0 ? dy : dx),
        y: current.y - (event.shiftKey && dx === 0 ? 0 : dy),
        k: current.k,
      }));
    }

    markDirty();
  }, [markDirty, setViewportBoth]);

  // ── Block page scrolling while the pointer is over the canvas ───────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (event: WheelEvent) => {
      if (isCanvasGestureBlockedTarget(event.target)) return;
      event.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, []);

  // ── Load board ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true); setLoadError("");
      try {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
        const res = await fetch(`/api/canvas-boards/${boardId}${query}`, { cache: "no-store" });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(typeof d.error === "string" ? d.error : "画布无法加载"); }
        const board = (await res.json()) as CanvasBoard;
        setTitle(board.title); setNodes(board.nodes); setConnections(board.connections);
        setViewportBoth(board.viewport);
        setSnapToGridBoth(board.snapToGrid === true);
        setDirty(false); setSaveStatus("saved");
      } catch (e) { setLoadError(e instanceof Error ? e.message : "画布无法加载"); }
      finally { setLoading(false); }
    };
    if (boardId) void load();
  }, [boardId, projectId, setSnapToGridBoth, setViewportBoth]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          setImageSettings(snapshot.imageWorkspace);
          setVideoSettings(snapshot.videoWorkspace);
          setLlmSettings(snapshot.llm);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageSettings(DEFAULT_IMAGE_SETTINGS);
          setVideoSettings(DEFAULT_VIDEO_SETTINGS);
          setLlmSettings(DEFAULT_SETTINGS);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const openPresetLibraryForAddingNode = useCallback((pos: CanvasPosition) => {
    setPresetAddNodePos(pos);
    setPresetLibraryOpen(true);
  }, []);


  // ── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty || loading || loadError) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
        const res = await fetch(`/api/canvas-boards/${boardId}${query}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, projectId, data: { nodes, connections, viewport, snapToGrid } as CanvasBoardData }),
        });
        if (!res.ok) throw new Error("保存失败");
        setDirty(false); setSaveStatus("saved");
      } catch { setSaveStatus("error"); }
    }, 450);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [boardId, connections, dirty, loadError, loading, nodes, projectId, snapToGrid, title, viewport]);

  // ── Global pointer events ───────────────────────────────────────────────────
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      // Connection draft — update position and snap to nearest port
      if (connectionDraftRef.current) {
        const draft = connectionDraftRef.current;
        const rawWorld = screenToWorld(e.clientX, e.clientY);
        const snap =
          draft.mode === "fromOutput"
            ? draft.fromNodeId
              ? findConnectionTarget(nodesRef.current, rawWorld, draft.fromNodeId, connectionsRef.current)
              : null
            : findConnectionSource(nodesRef.current, rawWorld, draft.anchorNodeId, connectionsRef.current);
        const snapNode = snap ? nodesRef.current.find((n) => n.id === snap.nodeId) : null;
        const snappedPos = snapNode && snap
          ? draft.mode === "fromOutput"
            ? getInputPortPos(snapNode, snap.targetPort)
            : getOutputPortPos(snapNode)
          : rawWorld;
        const next: ConnectionDraft = {
          ...draft,
          current: snappedPos,
          fromNodeId: draft.mode === "fromOutput" ? draft.fromNodeId : snap?.nodeId ?? null,
          targetNodeId: draft.mode === "fromOutput" ? snap?.nodeId ?? null : draft.anchorNodeId,
          targetPort: snap?.targetPort ?? null,
          message: snap?.targetPort ? "将建立连线" : draft.mode === "toInput" ? "拖到素材或生成节点输出点" : "拖到生成节点输入点",
        };
        connectionDraftRef.current = next;
        setConnectionDraft(next);
        return;
      }

      // Node drag (with co-selection)
      if (dragRef.current) {
        const d = dragRef.current;
        const vp = viewportRef.current;
        let dx = (e.clientX - d.startX) / vp.k;
        let dy = (e.clientY - d.startY) / vp.k;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;

        const newGuides: SmartGuide[] = [];
        const draggedNode = nodesRef.current.find(n => n.id === d.nodeId);
        
        if (draggedNode && d.moved) {
          const targetX = d.initial.x + dx;
          const targetY = d.initial.y + dy;
          const snapDist = 8 / vp.k;
          
          const srcL = targetX;
          const srcC = targetX + draggedNode.width / 2;
          const srcR = targetX + draggedNode.width;
          const srcT = targetY;
          const srcM = targetY + draggedNode.height / 2;
          const srcB = targetY + draggedNode.height;

          let bestSnapX: { diff: number; pos: number; start: number; end: number; offset: number } | null = null;
          let bestSnapY: { diff: number; pos: number; start: number; end: number; offset: number } | null = null;

          for (const other of nodesRef.current) {
            if (other.id === d.nodeId || d.coselected.has(other.id) || other.type === "group") continue;
            
            const tgtL = other.position.x;
            const tgtC = other.position.x + other.width / 2;
            const tgtR = other.position.x + other.width;
            const tgtT = other.position.y;
            const tgtM = other.position.y + other.height / 2;
            const tgtB = other.position.y + other.height;

            const xChecks = [
              { s: srcL, t: tgtL, offset: tgtL - targetX },
              { s: srcL, t: tgtR, offset: tgtR - targetX },
              { s: srcR, t: tgtL, offset: tgtL - (targetX + draggedNode.width) },
              { s: srcR, t: tgtR, offset: tgtR - (targetX + draggedNode.width) },
              { s: srcC, t: tgtC, offset: tgtC - (targetX + draggedNode.width / 2) }
            ];

            for (const check of xChecks) {
              const diff = Math.abs(check.s - check.t);
              if (diff < snapDist && (!bestSnapX || diff < bestSnapX.diff)) {
                bestSnapX = { diff, pos: check.t, start: Math.min(srcT, tgtT), end: Math.max(srcB, tgtB), offset: check.offset };
              }
            }

            const yChecks = [
              { s: srcT, t: tgtT, offset: tgtT - targetY },
              { s: srcT, t: tgtB, offset: tgtB - targetY },
              { s: srcB, t: tgtT, offset: tgtT - (targetY + draggedNode.height) },
              { s: srcB, t: tgtB, offset: tgtB - (targetY + draggedNode.height) },
              { s: srcM, t: tgtM, offset: tgtM - (targetY + draggedNode.height / 2) }
            ];

            for (const check of yChecks) {
              const diff = Math.abs(check.s - check.t);
              if (diff < snapDist && (!bestSnapY || diff < bestSnapY.diff)) {
                bestSnapY = { diff, pos: check.t, start: Math.min(srcL, tgtL), end: Math.max(srcR, tgtR), offset: check.offset };
              }
            }
          }

          if (bestSnapX) {
            dx += bestSnapX.offset;
            newGuides.push({ axis: "x", pos: bestSnapX.pos, start: bestSnapX.start - 100, end: bestSnapX.end + 100 });
          }
          if (bestSnapY) {
            dy += bestSnapY.offset;
            newGuides.push({ axis: "y", pos: bestSnapY.pos, start: bestSnapY.start - 100, end: bestSnapY.end + 100 });
          }
        }
        
        setSmartGuides(newGuides);

        setNodes((items) => items.map((node) => {
          if (node.id === d.nodeId) return { ...node, position: { x: d.initial.x + dx, y: d.initial.y + dy } };
          const coPos = d.coselected.get(node.id);
          if (coPos) return { ...node, position: { x: coPos.x + dx, y: coPos.y + dy } };
          return node;
        }));
        markDirty(); return;
      }

      // Canvas pending → check if should become rubber-band
      if (canvasPendingRef.current) {
        const p = canvasPendingRef.current;
        if (Math.abs(e.clientX - p.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - p.startY) > DRAG_THRESHOLD) {
          selectBoxStartRef.current = { x: p.startX, y: p.startY };
          canvasPendingRef.current = null;
        } else {
          return; // still pending, wait
        }
      }

      // Rubber-band update
      if (selectBoxStartRef.current) {
        setSelectBox({ screenX0: selectBoxStartRef.current.x, screenY0: selectBoxStartRef.current.y, screenX1: e.clientX, screenY1: e.clientY });
        if (window.getSelection) { window.getSelection()?.removeAllRanges(); }
        return;
      }

      // Pan
      if (panRef.current) {
        const p = panRef.current;
        setViewportBoth(clampViewport({ x: p.initial.x + e.clientX - p.startX, y: p.initial.y + e.clientY - p.startY, k: p.initial.k }));
        markDirty();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      setSmartGuides([]);
      // Finish connection
      const draft = connectionDraftRef.current;
      if (draft?.fromNodeId && draft.targetNodeId && draft.targetPort) {
        const fromNodeId = draft.fromNodeId;
        const targetNodeId = draft.targetNodeId;
        const targetPort = draft.targetPort;
        const from = nodesRef.current.find((n) => n.id === fromNodeId);
        const to = nodesRef.current.find((n) => n.id === targetNodeId);
        const inferred = from && to ? inferTargetPort(from, to, connectionsRef.current) : { targetPort: null, reason: "节点不存在" };
        if (inferred.targetPort === targetPort) {
          historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), { nodes: [...nodesRef.current], connections: [...connectionsRef.current] }];
          setConnections((items) => [...items, makeCanvasConnection(`conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fromNodeId, targetNodeId, targetPort)]);
          markDirty();
        }
      }
      connectionDraftRef.current = null;
      setConnectionDraft(null);

      // Single click on empty canvas: just clear pending (no quick-add bar)
      // Double-click is handled by onDoubleClick on the container
      if (canvasPendingRef.current) {
        canvasPendingRef.current = null;
      }

      // Finish rubber-band selection
      if (selectBoxStartRef.current) {
        const start = selectBoxStartRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect && (Math.abs(e.clientX - start.x) > DRAG_THRESHOLD || Math.abs(e.clientY - start.y) > DRAG_THRESHOLD)) {
          const vp = viewportRef.current;
          const wx0 = (Math.min(start.x, e.clientX) - rect.left - vp.x) / vp.k;
          const wy0 = (Math.min(start.y, e.clientY) - rect.top - vp.y) / vp.k;
          const wx1 = (Math.max(start.x, e.clientX) - rect.left - vp.x) / vp.k;
          const wy1 = (Math.max(start.y, e.clientY) - rect.top - vp.y) / vp.k;
          const inside = new Set<string>();
          for (const node of nodesRef.current) {
            if (node.position.x < wx1 && node.position.x + node.width > wx0 && node.position.y < wy1 && node.position.y + node.height > wy0) inside.add(node.id);
          }
          const insideConnections = new Set<string>();
          const nodeMap = new Map(nodesRef.current.map((node) => [node.id, node]));
          for (const conn of connectionsRef.current) {
            const from = nodeMap.get(conn.fromNodeId);
            const to = nodeMap.get(conn.toNodeId);
            if (from && to && connectionIntersectsRect(from, to, conn.targetPort, { x0: wx0, y0: wy0, x1: wx1, y1: wy1 })) {
              insideConnections.add(conn.id);
            }
          }
          if (inside.size > 0 || insideConnections.size > 0) {
            setSelectedNodeIds(inside);
            setSelectedConnectionIds(insideConnections);
            setSelectedConnectionId(insideConnections.values().next().value ?? null);
          }
        }
        selectBoxStartRef.current = null;
        setSelectBox(null);
      }

      // Pop no-op drag history
      if (dragRef.current && !dragRef.current.moved && historyRef.current.length > 0) {
        historyRef.current = historyRef.current.slice(0, -1);
      }
      if (dragRef.current?.moved && snapToGridRef.current) {
        const movedIds = new Set([dragRef.current.nodeId, ...dragRef.current.coselected.keys()]);
        setNodes((items) => items.map((node) => (movedIds.has(node.id) ? snapNode(node) : node)));
        markDirty();
      }
      dragRef.current = null;
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); };
  }, [markDirty, screenToWorld, setViewportBoth]);

  // ── Paste (image/video/audio from OS clipboard) ─────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => detectMediaKind(f));
      if (!file) return;
      e.preventDefault();
      void uploadMedia(file, worldCenter());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // ── Space key → pan mode ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " && !spaceHeldRef.current) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpacePanMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") { spaceHeldRef.current = false; setSpacePanMode(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") return; // handled by separate effect above
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      const meta = e.metaKey || e.ctrlKey;

      // Ctrl+Z — undo
      if (meta && !e.shiftKey && e.key === "z") {
        if (isEditable) return; e.preventDefault();
        const snapshot = historyRef.current.pop();
        if (snapshot) {
          redoHistoryRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
          setNodes(snapshot.nodes); setConnections(snapshot.connections); nodesRef.current = snapshot.nodes; connectionsRef.current = snapshot.connections; markDirty();
        }
        return;
      }
      // Ctrl+Shift+Z or Ctrl+Y — redo
      if (meta && ((e.shiftKey && e.key === "Z") || e.key === "y" || e.key === "Y")) {
        if (isEditable) return; e.preventDefault();
        const snapshot = redoHistoryRef.current.pop();
        if (snapshot) {
          historyRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
          setNodes(snapshot.nodes); setConnections(snapshot.connections); nodesRef.current = snapshot.nodes; connectionsRef.current = snapshot.connections; markDirty();
        }
        return;
      }
      // Ctrl+C — copy selected nodes to internal clipboard
      if (meta && e.key === "c") {
        if (isEditable) return;
        const selected = nodesRef.current.filter((n) => selectedNodeIds.has(n.id));
        const toCopy = [...selected];
        for (const s of selected) {
          if (s.type === "group" && s.metadata?.children) {
            for (const childId of s.metadata.children) {
              const child = nodesRef.current.find((n) => n.id === childId);
              if (child && !toCopy.some((n) => n.id === childId)) toCopy.push(child);
            }
          }
        }
        if (toCopy.length) { nodeClipboardRef.current = toCopy; setHasClipboard(true); }
        return;
      }
      // Ctrl+V — paste nodes (image paste is handled by the paste event)
      if (meta && e.key === "v") {
        if (isEditable) return;
        if (nodeClipboardRef.current.length > 0) { e.preventDefault(); pasteNodes(); }
        return;
      }
      // Ctrl+D — duplicate
      if (meta && e.key === "d") { if (isEditable) return; e.preventDefault(); duplicateNodes(selectedNodeIds); return; }
      // Ctrl+G — group
      if (meta && !e.shiftKey && e.key === "g") { if (isEditable) return; e.preventDefault(); groupSelected(); return; }
      // Ctrl+Shift+G — ungroup
      if (meta && e.shiftKey && e.key === "G") {
        if (isEditable) return; e.preventDefault();
        for (const id of selectedNodeIds) { if (nodesRef.current.find((n) => n.id === id)?.type === "group") { ungroupNode(id); break; } }
        return;
      }
      // Ctrl+A — select all
      if (meta && e.key === "a") {
        if (isEditable) return;
        e.preventDefault();
        setSelectedNodeIds(new Set(nodesRef.current.map((n) => n.id)));
        setSelectedConnectionIds(new Set(connectionsRef.current.map((conn) => conn.id)));
        setSelectedConnectionId(null);
        return;
      }
      // Ctrl+= / Ctrl+- / Ctrl+0 — zoom
      if (meta && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(0.15); return; }
      if (meta && e.key === "-") { e.preventDefault(); zoomBy(-0.15); return; }
      if (meta && e.key === "0") { e.preventDefault(); setViewportBoth(DEFAULT_CANVAS_VIEWPORT); markDirty(); return; }

      if (isEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
      if (e.key === "Escape") {
        setSelectedNodeIds(new Set()); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); dismissOverlays();
        connectionDraftRef.current = null; setConnectionDraft(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIds, selectedConnectionId, markDirty, dismissOverlays]);

  // ── Action helpers ──────────────────────────────────────────────────────────

  const appendNode = useCallback((node: CanvasNode) => {
    pushHistory();
    const nextNode = snapToGridRef.current ? snapNode(node) : node;
    setNodes((items) => {
      const nextNodes = [...items, nextNode];
      nodesRef.current = nextNodes;
      return nextNodes;
    });
    setSelectedNodeIds(new Set([nextNode.id])); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); setConnectionDraft(null);
    setQuickAddBar(null);
    markDirty();
  }, [pushHistory, markDirty]);

  const handlePresetSelect = useCallback((preset: SitePromptPreset) => {
    appendNode(makePresetNode(presetAddNodePos ?? worldCenter(), preset));
    setPresetLibraryOpen(false);
    setPresetAddNodePos(null);
  }, [appendNode, presetAddNodePos, worldCenter]);

  const appendImageNodeWithSelection = useCallback((position: CanvasPosition) => {
    const node = makeEmptyImageNode(position, currentImageNodeDefaults());
    pushHistory();
    const nextNode = snapToGridRef.current ? snapNode(node) : node;
    const selectedSources = nodesRef.current.filter((item) => selectedNodeIds.has(item.id));
    const newConnections: CanvasConnection[] = [];
    const simulatedConnections = [...connectionsRef.current];
    for (const source of selectedSources) {
      const inferred = inferTargetPort(source, nextNode, simulatedConnections);
      if (!inferred.targetPort) continue;
      const conn = makeCanvasConnection(
        `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source.id,
        nextNode.id,
        inferred.targetPort,
      );
      simulatedConnections.push(conn);
      newConnections.push(conn);
    }
    setNodes((items) => [...items, nextNode]);
    if (newConnections.length > 0) {
      setConnections((items) => [...items, ...newConnections]);
    }
    setSelectedNodeIds(new Set([nextNode.id]));
    setSelectedConnectionIds(new Set());
    setSelectedConnectionId(null);
    setConnectionDraft(null);
    setQuickAddBar(null);
    markDirty();
  }, [currentImageNodeDefaults, markDirty, pushHistory, selectedNodeIds]);

  const uploadMedia = async (file?: File, position = menuWorldRef.current ?? worldCenter(), targetNodeId?: string | null, preferredKind?: UploadKind) => {
    if (!file) return;
    const kind = detectMediaKind(file, preferredKind) as UploadKind | null;
    if (!kind) {
      setSaveStatus("error");
      return;
    }
    setUploading(true); setSaveStatus("saving");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("请先登录");
      const contentType = mediaContentType(file, kind);
      const path = `${user.id}/canvas/${boardId}/${kind}/${crypto.randomUUID()}.${mediaFileExtension(file, kind)}`;
      const form = new FormData();
      form.append("file", file, file.name || `${kind}.${mediaFileExtension(file, kind)}`);
      form.append("key", path);
      form.append("contentType", contentType);
      const response = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { publicUrl?: string; error?: string };
      if (!response.ok || !data.publicUrl) throw new Error(data.error || "媒体上传失败");
      const objectUrl = URL.createObjectURL(file);
      const size = kind === "video" ? await readVideoSize(objectUrl) : kind === "audio" ? { width: 320, height: 96 } : await readImageSize(objectUrl);
      const videoDurationSeconds = kind === "video" ? await readVideoDuration(objectUrl) : undefined;
      const audioDurationSeconds = kind === "audio" ? await readAudioDuration(objectUrl) : undefined;
      URL.revokeObjectURL(objectUrl);
      
      if (targetNodeId) {
        pushHistory();
        const displaySize = kind === "audio" ? { width: 320, height: 96 } : fitMediaSize(size, 360, 300);
        setNodes((items) => items.map((n) => n.id === targetNodeId ? {
          ...n,
          title: file.name,
          type: kind,
          width: displaySize.width,
          height: displaySize.height,
          metadata: {
            ...n.metadata,
            source: "upload",
            filename: file.name,
            imageUrl: kind === "image" ? data.publicUrl : undefined,
            videoUrl: kind === "video" ? data.publicUrl : undefined,
            audioUrl: kind === "audio" ? data.publicUrl : undefined,
            naturalWidth: kind === "audio" ? undefined : size.width,
            naturalHeight: kind === "audio" ? undefined : size.height,
            videoDurationSeconds,
            audioDurationSeconds,
            mimeType: contentType,
            status: "success",
          }
        } : n));
        markDirty();
      } else {
        appendNode(makeMediaNode(position, kind, { url: data.publicUrl, width: size.width, height: size.height, mimeType: contentType, filename: file.name, videoDurationSeconds, audioDurationSeconds }));
      }
    } catch { setSaveStatus("error"); }
    finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      if (audioInputRef.current) audioInputRef.current.value = "";
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };

  const patchNode = useCallback((nodeId: string, updater: (node: CanvasNode) => CanvasNode) => {
    setNodes((items) => items.map((node) => (node.id === nodeId ? updater(node) : node)));
    markDirty();
  }, [markDirty]);

  const updateNodeMetadata = (
    nodeId: string,
    key: "text" | "prompt",
    value: string,
  ) => {
    patchNode(nodeId, (node) => ({ ...node, metadata: { ...node.metadata, [key]: value } }));
  };

  const updateTextNodeChatInput = useCallback((nodeId: string, value: string) => {
    patchNode(nodeId, (node) => ({ ...node, metadata: { ...node.metadata, chatInput: value } }));
  }, [patchNode]);

  const switchTextNodeToManual = useCallback((nodeId: string) => {
    patchNode(nodeId, (node) => ({
      ...node,
      metadata: {
        ...node.metadata,
        textMode: "manual",
        text: node.metadata?.text ?? node.metadata?.chatPreviewMarkdown ?? "",
      },
    }));
    setEditingTextNodeId(nodeId);
  }, [patchNode]);

  const updateImageGenNodeSettings = useCallback((
    nodeId: string,
    patch: Partial<NonNullable<CanvasNode["metadata"]>>,
  ) => {
    patchNode(nodeId, (node) => {
      const nextMetadata = { ...node.metadata, ...patch };
      if (patch.imageModelId && patch.imageModelId !== "gpt-image-2") {
        delete nextMetadata.gptImageQuality;
      }
      if (patch.imageModelId === "gpt-image-2" && !nextMetadata.gptImageQuality) {
        nextMetadata.gptImageQuality = imageSettings.gptImageQuality;
      }
      return { ...node, metadata: nextMetadata };
    });
  }, [imageSettings.gptImageQuality, patchNode]);

  const updateVideoGenNodeSettings = useCallback((
    nodeId: string,
    patch: Partial<NonNullable<CanvasNode["metadata"]>>,
  ) => {
    patchNode(nodeId, (node) => {
      const nextMetadata = { ...node.metadata, ...patch };
      if (patch.videoModelId) {
        const capabilities = getVideoCapabilities(patch.videoModelId);
        if (!nextMetadata.videoModeId) {
          nextMetadata.videoModeId = "start_end_frame";
        }
        if (!nextMetadata.videoAspectRatio || !capabilities.aspectRatios.includes(nextMetadata.videoAspectRatio)) {
          nextMetadata.videoAspectRatio = capabilities.aspectRatios[0];
        }
        if (!nextMetadata.videoResolution || !capabilities.resolutions.includes(nextMetadata.videoResolution)) {
          nextMetadata.videoResolution = capabilities.resolutions[0];
        }
        if (!nextMetadata.videoDurationSeconds || !capabilities.durations.includes(nextMetadata.videoDurationSeconds)) {
          nextMetadata.videoDurationSeconds = capabilities.durations[0];
        }
      }
      return { ...node, metadata: nextMetadata };
    });
  }, [patchNode]);

  const updateNodeTitle = (nodeId: string, value: string) => {
    setNodes((items) => items.map((n) => (n.id === nodeId ? { ...n, title: value.trim() || "未命名" } : n)));
    markDirty();
  };

  const deleteConnectionById = useCallback((connectionId: string) => {
    pushHistory();
    setConnections((items) => items.filter((x) => x.id !== connectionId));
    setSelectedConnectionIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
    setSelectedConnectionId(null);
    setMenu(null);
    markDirty();
  }, [pushHistory, markDirty]);

  const deleteSelected = useCallback(() => {
    const connectionIds = new Set(selectedConnectionIds);
    if (selectedConnectionId) connectionIds.add(selectedConnectionId);
    if (selectedNodeIds.size > 0 || connectionIds.size > 0) {
      pushHistory();
      const nodeIds = new Set(selectedNodeIds);
      setNodes((items) => items.filter((n) => !nodeIds.has(n.id)).map((n) => nodeIds.has(n.metadata?.parentId ?? "") ? { ...n, metadata: { ...n.metadata, parentId: undefined } } : n));
      setConnections((c) => c.filter((x) => !connectionIds.has(x.id) && !nodeIds.has(x.fromNodeId) && !nodeIds.has(x.toNodeId)));
      setSelectedNodeIds(new Set());
      setSelectedConnectionIds(new Set());
      setSelectedConnectionId(null);
      markDirty();
    }
  }, [selectedConnectionId, selectedConnectionIds, selectedNodeIds, pushHistory, markDirty]);

  const deleteNodeById = useCallback((nodeId: string) => {
    pushHistory();
    setNodes((items) => items.filter((n) => n.id !== nodeId).map((n) => n.metadata?.parentId === nodeId ? { ...n, metadata: { ...n.metadata, parentId: undefined } } : n));
    setConnections((c) => c.filter((x) => x.fromNodeId !== nodeId && x.toNodeId !== nodeId));
    setSelectedNodeIds((prev) => { const next = new Set(prev); next.delete(nodeId); return next; });
    markDirty();
  }, [pushHistory, markDirty]);

  const duplicateNodes = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    pushHistory();
    const idMap = new Map<string, string>();
    const sourceNodes: CanvasNode[] = [];
    for (const id of ids) {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node) continue;
      const newId = newNodeId(node.type);
      idMap.set(id, newId);
      sourceNodes.push(node);
    }
    const newNodes: CanvasNode[] = sourceNodes.map((node) => {
      const next: CanvasNode = {
        ...node,
        id: idMap.get(node.id)!,
        position: { x: node.position.x + 30, y: node.position.y + 30 },
        metadata: {
          ...node.metadata,
          children: node.metadata?.children?.map((c) => idMap.get(c)).filter((c): c is string => Boolean(c)),
          parentId: undefined,
        },
      };
      return snapToGridRef.current ? snapNode(next) : next;
    });
    const newConns: CanvasConnection[] = [];
    for (const conn of connectionsRef.current) {
      const nf = idMap.get(conn.fromNodeId), nt = idMap.get(conn.toNodeId);
      if (nf && nt) newConns.push(makeCanvasConnection(`conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nf, nt, conn.targetPort));
    }
    setNodes((items) => [...items, ...newNodes]);
    if (newConns.length) setConnections((items) => [...items, ...newConns]);
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    markDirty();
  }, [pushHistory, markDirty]);



  const pasteNodes = useCallback((targetWorld?: CanvasPosition) => {
    const clipboard = nodeClipboardRef.current;
    if (!clipboard.length) return;
    pushHistory();
    const cx = (Math.min(...clipboard.map((n) => n.position.x)) + Math.max(...clipboard.map((n) => n.position.x + n.width))) / 2;
    const cy = (Math.min(...clipboard.map((n) => n.position.y)) + Math.max(...clipboard.map((n) => n.position.y + n.height))) / 2;
    const target = targetWorld ?? worldCenter();
    const dx = target.x - cx + 30, dy = target.y - cy + 30;
    const idMap = new Map<string, string>();
    for (const n of clipboard) idMap.set(n.id, newNodeId(n.type));
    const newNodes: CanvasNode[] = clipboard.map((n) => {
      const newId = newNodeId(n.type);
      const next: CanvasNode = {
        ...n,
        id: idMap.get(n.id) ?? newId,
        position: { x: n.position.x + dx, y: n.position.y + dy },
        metadata: {
          ...n.metadata,
          children: n.metadata?.children?.map((c) => idMap.get(c)).filter((c): c is string => Boolean(c)),
          parentId: undefined,
        },
      };
      return snapToGridRef.current ? snapNode(next) : next;
    });
    const newConns: CanvasConnection[] = [];
    for (const conn of connectionsRef.current) {
      const nf = idMap.get(conn.fromNodeId), nt = idMap.get(conn.toNodeId);
      if (nf && nt) newConns.push(makeCanvasConnection(`conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nf, nt, conn.targetPort));
    }
    setNodes((items) => [...items, ...newNodes]);
    if (newConns.length) setConnections((items) => [...items, ...newConns]);
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    markDirty();
  }, [pushHistory, worldCenter, markDirty]);

  const duplicateSelected = useCallback(() => {
    const selected = nodesRef.current.filter((n) => selectedNodeIds.has(n.id));
    const toCopy = [...selected];
    for (const s of selected) {
      if (s.type === "group" && s.metadata?.children) {
        for (const childId of s.metadata.children) {
          const child = nodesRef.current.find((n) => n.id === childId);
          if (child && !toCopy.some((n) => n.id === childId)) toCopy.push(child);
        }
      }
    }
    if (toCopy.length) {
      nodeClipboardRef.current = toCopy;
      pasteNodes();
    }
  }, [selectedNodeIds, pasteNodes]);

  const groupSelected = useCallback(() => {
    const childIds = [...selectedNodeIds].filter((id) => nodeMap.get(id)?.type !== "group");
    if (childIds.length < 2) return;
    pushHistory();
    const targets = nodesRef.current.filter((n) => childIds.includes(n.id));
    const minX = Math.min(...targets.map((n) => n.position.x)) - GROUP_PAD;
    const minY = Math.min(...targets.map((n) => n.position.y)) - GROUP_PAD;
    const maxX = Math.max(...targets.map((n) => n.position.x + n.width)) + GROUP_PAD;
    const maxY = Math.max(...targets.map((n) => n.position.y + n.height)) + GROUP_PAD;
    const groupId = newNodeId("group");
    const groupNode: CanvasNode = { id: groupId, type: "group" as const, title: "素材组", position: { x: minX, y: minY }, width: maxX - minX, height: maxY - minY, metadata: { children: childIds } };
    setNodes((items) => [
      ...items.map((n) => childIds.includes(n.id) ? { ...n, metadata: { ...n.metadata, parentId: groupId } } : n),
      snapToGridRef.current ? snapNode(groupNode) : groupNode,
    ]);
    setSelectedNodeIds(new Set([groupId]));
    markDirty();
  }, [selectedNodeIds, nodeMap, pushHistory, markDirty]);

  const ungroupNode = useCallback((groupId: string) => {
    const groupNode = nodesRef.current.find((n) => n.id === groupId);
    if (!groupNode || groupNode.type !== "group") return;
    pushHistory();
    const childIds = new Set(groupNode.metadata?.children ?? []);
    setNodes((items) => items.filter((n) => n.id !== groupId).map((n) => childIds.has(n.id) ? { ...n, metadata: { ...n.metadata, parentId: undefined } } : n));
    setSelectedNodeIds(childIds);
    markDirty();
  }, [pushHistory, markDirty]);

  const deleteGroupWithChildren = useCallback((groupId: string) => {
    const groupNode = nodesRef.current.find((n) => n.id === groupId);
    if (!groupNode || groupNode.type !== "group") return;
    pushHistory();
    const removeIds = new Set([groupId, ...(groupNode.metadata?.children ?? [])]);
    setNodes((items) => items.filter((n) => !removeIds.has(n.id)));
    setConnections((c) => c.filter((x) => !removeIds.has(x.fromNodeId) && !removeIds.has(x.toNodeId)));
    setSelectedNodeIds(new Set()); markDirty();
  }, [pushHistory, markDirty]);

  const toggleSnapToGrid = useCallback(() => {
    const next = !snapToGridRef.current;
    setSnapToGridBoth(next);
    markDirty();
  }, [markDirty, setSnapToGridBoth]);

  const undoLast = useCallback(() => {
    const snapshot = historyRef.current.pop();
    if (!snapshot) return;
    redoHistoryRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
    setNodes(snapshot.nodes);
    setConnections(snapshot.connections);
    nodesRef.current = snapshot.nodes;
    connectionsRef.current = snapshot.connections;
    markDirty();
  }, [markDirty]);

  const redoLast = useCallback(() => {
    const snapshot = redoHistoryRef.current.pop();
    if (!snapshot) return;
    historyRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
    setNodes(snapshot.nodes);
    setConnections(snapshot.connections);
    nodesRef.current = snapshot.nodes;
    connectionsRef.current = snapshot.connections;
    markDirty();
  }, [markDirty]);

  const runImageGenNode = useCallback(async (nodeId: string) => {
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.type !== "image") return;
    updateImageGenNodeSettings(nodeId, {
      status: "running",
      lastError: undefined,
    });
    try {
      const res = await fetch("/api/canvas/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, nodeId, projectId }),
      });
      let rawText = "";
      try {
        rawText = await res.text();
      } catch {
        rawText = "Failed to read response body";
      }

      let data: Partial<CanvasImageGenerateResponse> & { error?: string; code?: string; reasonCode?: string; userMessage?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // Not JSON
      }

      if (!res.ok || !data.sourceNode || !data.galleryRecord) {
        throw new Error(formatGenerationErrorForDisplay({
          code: data.code,
          reasonCode: data.reasonCode,
          userMessage: data.userMessage,
          fallbackCode: `HTTP_${res.status}`,
        }));
      }
      // Update the image node with the generated result
      const nextNodes = nodesRef.current.map((n) => n.id === nodeId ? data.sourceNode! : n);
      setNodes(nextNodes);
      nodesRef.current = nextNodes;
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedConnectionIds(new Set());
      setSelectedConnectionId(null);
      markDirty();
    } catch (error) {
      updateImageGenNodeSettings(nodeId, {
        status: "error",
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "无线画布生图失败",
      });
    }
  }, [boardId, markDirty, projectId, updateImageGenNodeSettings]);

  const runVideoGenNode = useCallback(async (nodeId: string) => {
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.type !== "video") return;
    updateVideoGenNodeSettings(nodeId, {
      status: "running",
      lastError: undefined,
    });
    try {
      const res = await fetch("/api/canvas/video-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, nodeId, projectId }),
      });
      let rawText = "";
      try {
        rawText = await res.text();
      } catch {
        rawText = "Failed to read response body";
      }

      let data: Partial<CanvasVideoGenerateResponse> & { error?: string; code?: string; reasonCode?: string; userMessage?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // Not JSON
      }

      if (!res.ok || !data.sourceNode || !data.galleryRecord) {
        throw new Error(formatGenerationErrorForDisplay({
          code: data.code,
          reasonCode: data.reasonCode,
          userMessage: data.userMessage,
          fallbackCode: `HTTP_${res.status}`,
        }));
      }
      const nextNodes = nodesRef.current.map((n) => n.id === nodeId ? data.sourceNode! : n);
      setNodes(nextNodes);
      nodesRef.current = nextNodes;
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedConnectionIds(new Set());
      setSelectedConnectionId(null);
      markDirty();
    } catch (error) {
      updateVideoGenNodeSettings(nodeId, {
        status: "error",
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "无线画布生视频失败",
      });
    }
  }, [boardId, markDirty, projectId, updateVideoGenNodeSettings]);

  const runTextChatNode = useCallback(async (nodeId: string) => {
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.type !== "text") return;
    const input = targetNode.metadata?.chatInput?.trim() ?? "";
    if (!input) return;
    const contextBlocks = connectionsRef.current
      .filter((conn) => conn.toNodeId === nodeId && conn.targetPort === "prompt")
      .map((conn) => nodesRef.current.find((node) => node.id === conn.fromNodeId))
      .filter((node): node is CanvasNode => {
        return Boolean(node) && node?.type === "text";
      })
      .map((node, index) => {
        const text = textNodeOutput(node)?.trim();
        return text ? `### 文本上下文 ${index + 1}：${node.title || node.id}\n\n${text}` : "";
      })
      .filter(Boolean);
    const messageText = contextBlocks.length
      ? `${contextBlocks.join("\n\n")}\n\n### 用户要求\n\n${input}`
      : input;

    patchNode(nodeId, (node) => ({
      ...node,
      metadata: {
        ...node.metadata,
        textMode: "chat",
        chatStatus: "running",
        chatLastError: undefined,
      },
    }));

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      createdAt: Date.now(),
      parts: [{ type: "text", text: messageText }],
    };

    try {
      const res = await fetch("/api/canvas/chat-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          nodeId,
          userMessage,
          preferredImageModelId: targetNode.metadata?.chatPreferredImageModelId,
          preferredLlmModelId: targetNode.metadata?.chatPreferredLlmModelId ?? llmSettings.defaultModelId,
        }),
      });
      let rawText = "";
      try {
        rawText = await res.text();
      } catch {
        rawText = "Failed to read response body";
      }

      let data: Partial<CanvasChatRunResponse> & { error?: string; code?: string; reasonCode?: string; userMessage?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        // Not JSON
      }

      if (!res.ok || !data.sourceNode || !data.conversation) {
        throw new Error(formatGenerationErrorForDisplay({
          code: data.code,
          reasonCode: data.reasonCode,
          userMessage: data.userMessage,
          fallbackCode: `HTTP_${res.status}`,
        }));
      }

      const nextNodes = nodesRef.current.map((n) => (n.id === nodeId ? data.sourceNode! : n));
      setNodes(nextNodes);
      nodesRef.current = nextNodes;
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedConnectionIds(new Set());
      setSelectedConnectionId(null);
      markDirty();
    } catch (error) {
      patchNode(nodeId, (node) => ({
        ...node,
        metadata: {
          ...node.metadata,
          textMode: "chat",
          chatStatus: "error",
          chatLastError: error instanceof Error ? error.message : "无线画布对话失败",
        },
      }));
    }
  }, [boardId, llmSettings.defaultModelId, markDirty, patchNode]);

  const focusNode = useCallback((node: CanvasNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = viewportRef.current;
    setViewportBoth(clampViewport({
      x: rect.width / 2 - (node.position.x + node.width / 2) * vp.k,
      y: rect.height / 2 - (node.position.y + node.height / 2) * vp.k,
      k: vp.k,
    }));
    setSelectedNodeIds(new Set([node.id]));
    setSelectedConnectionIds(new Set());
    setSelectedConnectionId(null);
    markDirty();
  }, [markDirty, setViewportBoth]);

  const openNodeMedia = useCallback((node: CanvasNode) => {
    const url = node.type === "image" ? node.metadata?.imageUrl : node.type === "video" ? node.metadata?.videoUrl : node.type === "audio" ? node.metadata?.audioUrl : undefined;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else focusNode(node);
  }, [focusNode]);

  const openImagePreview = useCallback((node: CanvasNode) => {
    const url = node.metadata?.imageUrl?.trim() || node.metadata?.previewImageUrl?.trim();
    if (!url) {
      focusNode(node);
      return;
    }
    setImagePreviewNode(node);
  }, [focusNode]);

  const downloadNodeMedia = useCallback((node: CanvasNode) => {
    const url = node.type === "image" ? node.metadata?.imageUrl : node.type === "video" ? node.metadata?.videoUrl : node.type === "audio" ? node.metadata?.audioUrl : undefined;
    if (url) {
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = node.title || (node.type === "image" ? "image.png" : node.type === "video" ? "video.mp4" : "audio.mp3");
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    } else if (node.type === "text" || (!node.metadata?.source && node.metadata?.prompt !== undefined)) {
      const text = node.type === "text" ? textNodeOutput(node) : node.metadata?.prompt;
      if (!text) return;
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${node.title || "node"}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }, []);


  const fitToView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !nodesRef.current.length) { setViewportBoth(DEFAULT_CANVAS_VIEWPORT); return; }
    const pad = 60;
    const minX = Math.min(...nodesRef.current.map((n) => n.position.x));
    const minY = Math.min(...nodesRef.current.map((n) => n.position.y));
    const maxX = Math.max(...nodesRef.current.map((n) => n.position.x + n.width));
    const maxY = Math.max(...nodesRef.current.map((n) => n.position.y + n.height));
    const k = Math.min(rect.width / (maxX - minX + pad * 2), rect.height / (maxY - minY + pad * 2), 1.5);
    setViewportBoth(clampViewport({ x: rect.width / 2 - (minX + maxX) / 2 * k, y: rect.height / 2 - (minY + maxY) / 2 * k, k }));
    markDirty();
  }, [setViewportBoth, markDirty]);

  const zoomBy = useCallback((delta: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = viewportRef.current;
    const nextK = Math.min(Math.max(vp.k + delta, 0.05), 5);
    const cx = rect.width / 2, cy = rect.height / 2;
    setViewportBoth(clampViewport({ x: cx - ((cx - vp.x) / vp.k) * nextK, y: cy - ((cy - vp.y) / vp.k) * nextK, k: nextK }));
    markDirty();
  }, [setViewportBoth, markDirty]);

  const startOutputConnectionDrag = (nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const fromNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!fromNode || !canStartConnection(fromNode)) return;
    const current = getOutputPortPos(fromNode);
    const draft: ConnectionDraft = { mode: "fromOutput", anchorNodeId: nodeId, fromNodeId: nodeId, current, targetNodeId: null, targetPort: null, message: "拖到合法输入槽" };
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
    setSelectedNodeIds(new Set([nodeId])); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null);
  };

  const startInputConnectionDrag = (nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const targetNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!targetNode || targetNode.type === "group" || getTargetPorts(targetNode).length === 0) return;
    const current = getInputPortPos(targetNode, getTargetPorts(targetNode)[0]);
    const draft: ConnectionDraft = { mode: "toInput", anchorNodeId: nodeId, fromNodeId: null, current, targetNodeId: nodeId, targetPort: null, message: "拖到素材或生成节点输出点" };
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
    setSelectedNodeIds(new Set([nodeId])); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null);
  };

  const startNodeDrag = (nodeId: string, e: React.PointerEvent, currentIds: Set<string>) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    pushHistory();
    const coselected = new Map<string, CanvasPosition>();
    if (node.type === "group" && currentIds.size === 1 && currentIds.has(nodeId)) {
      for (const childId of node.metadata?.children ?? []) {
        const child = nodesRef.current.find((n) => n.id === childId);
        if (child) coselected.set(childId, { ...child.position });
      }
    } else if (currentIds.has(nodeId)) {
      for (const id of currentIds) {
        if (id === nodeId) continue;
        const other = nodesRef.current.find((n) => n.id === id);
        if (other) coselected.set(id, { ...other.position });
      }
    }
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, initial: { ...node.position }, coselected, moved: false };
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const selectBoxStyle = useMemo(() => {
    if (!selectBox) return undefined;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return { left: Math.min(selectBox.screenX0, selectBox.screenX1) - rect.left, top: Math.min(selectBox.screenY0, selectBox.screenY1) - rect.top, width: Math.abs(selectBox.screenX1 - selectBox.screenX0), height: Math.abs(selectBox.screenY1 - selectBox.screenY0) };
  }, [selectBox]);

  const gridSize = GRID_SIZE * viewport.k;
  const gridStyle = {
    backgroundImage: [
      "linear-gradient(rgba(5,5,5,0.10) 1px, transparent 1px)",
      "linear-gradient(90deg, rgba(5,5,5,0.10) 1px, transparent 1px)",
    ].join(", "),
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${viewport.x % gridSize}px ${viewport.y % gridSize}px`,
  } satisfies CSSProperties;


  const hasSelection = selectedNodeIds.size > 0 || selectedConnectionIds.size > 0 || !!selectedConnectionId;
  const zoomPct = Math.round(viewport.k * 100);
  const worldStyle = useMemo(
    () => ({
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
      "--canvas-zoom-inverse": `${1 / Math.max(viewport.k, 0.01)}`,
    }) as CSSProperties,
    [viewport.k, viewport.x, viewport.y],
  );
  const canGroup = [...selectedNodeIds].filter((id) => nodeMap.get(id)?.type !== "group").length >= 2;
  const canUngroup = [...selectedNodeIds].some((id) => nodeMap.get(id)?.type === "group");
  const connectedOutputs = useMemo(() => new Set(connections.map((conn) => conn.fromNodeId)), [connections]);
  const connectedInputs = useMemo(() => new Set(connections.map((conn) => `${conn.toNodeId}:${conn.targetPort}`)), [connections]);

  const selectedNodes = useMemo(() => nodes.filter(n => selectedNodeIds.has(n.id)), [nodes, selectedNodeIds]);
  const hasMultiSelection = selectedNodes.length > 1;

  const multiSelectionBox = useMemo(() => {
    if (!hasMultiSelection) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selectedNodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + n.width > maxX) maxX = n.position.x + n.width;
      if (n.position.y + n.height > maxY) maxY = n.position.y + n.height;
    }
    const pad = 12;
    return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 };
  }, [hasMultiSelection, selectedNodes]);

  const minimap = useMemo(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const width = 196;
    const height = 128;
    const viewportWorld = rect
      ? {
          x: -viewport.x / viewport.k,
          y: -viewport.y / viewport.k,
          width: rect.width / viewport.k,
          height: rect.height / viewport.k,
        }
      : { x: 0, y: 0, width: 1, height: 1 };
    const nodeBounds = nodes.length ? {
      minX: Math.min(...nodes.map((n) => n.position.x)),
      minY: Math.min(...nodes.map((n) => n.position.y)),
      maxX: Math.max(...nodes.map((n) => n.position.x + n.width)),
      maxY: Math.max(...nodes.map((n) => n.position.y + n.height)),
    } : { minX: -400, minY: -260, maxX: 400, maxY: 260 };
    const minX = Math.min(nodeBounds.minX, viewportWorld.x) - 120;
    const minY = Math.min(nodeBounds.minY, viewportWorld.y) - 120;
    const maxX = Math.max(nodeBounds.maxX, viewportWorld.x + viewportWorld.width) + 120;
    const maxY = Math.max(nodeBounds.maxY, viewportWorld.y + viewportWorld.height) + 120;
    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);
    const scale = Math.min(width / worldWidth, height / worldHeight);
    const ox = (width - worldWidth * scale) / 2;
    const oy = (height - worldHeight * scale) / 2;
    const mapRect = (world: { x: number; y: number; width: number; height: number }) => ({
      left: ox + (world.x - minX) * scale,
      top: oy + (world.y - minY) * scale,
      width: Math.max(2, world.width * scale),
      height: Math.max(2, world.height * scale),
    });
    return { width, height, minX, minY, scale, ox, oy, viewportWorld, mapRect };
  }, [nodes, viewport]);

  const centerViewportFromMinimap = useCallback((clientX: number, clientY: number) => {
    const miniRect = minimapRef.current?.getBoundingClientRect();
    const canvasRect = containerRef.current?.getBoundingClientRect();
    if (!miniRect || !canvasRect) return;
    const mapX = clientX - miniRect.left;
    const mapY = clientY - miniRect.top;
    const worldX = minimap.minX + (mapX - minimap.ox) / minimap.scale;
    const worldY = minimap.minY + (mapY - minimap.oy) / minimap.scale;
    const vp = viewportRef.current;
    setViewportBoth(clampViewport({
      x: canvasRect.width / 2 - worldX * vp.k,
      y: canvasRect.height / 2 - worldY * vp.k,
      k: vp.k,
    }));
    markDirty();
  }, [markDirty, minimap, setViewportBoth]);

  const dragViewportFromMinimap = useCallback((clientX: number, clientY: number) => {
    const drag = minimapPanRef.current;
    if (!drag) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    const damping = 2;
    setViewportBoth(clampViewport({
      x: drag.initial.x - dx * damping,
      y: drag.initial.y - dy * damping,
      k: drag.initial.k,
    }));
    markDirty();
  }, [markDirty, setViewportBoth]);

  const setZoom = useCallback((nextK: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = viewportRef.current;
    const k = Math.min(Math.max(nextK, 0.05), 5);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setViewportBoth(clampViewport({ x: cx - ((cx - vp.x) / vp.k) * k, y: cy - ((cy - vp.y) / vp.k) * k, k }));
    markDirty();
  }, [markDirty, setViewportBoth]);

  const renderCanvasPickerButton = (
    label: string,
    options: CanvasPickerOption[],
    ariaLabel: string,
    disabled = false,
  ) => (
    <button
      type="button"
      className={styles.generatorPill}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={Boolean(canvasPickerMenu)}
      onClick={(event) => {
        if (disabled) return;
        event.stopPropagation();
        const anchor = menuAnchorFromElement(event.currentTarget);
        setCanvasPickerMenu((current) =>
          current?.anchor.left === anchor.left && current.anchor.top === anchor.top
            ? null
            : { anchor, options },
        );
      }}
    >
      <span className={styles.generatorPillLabelText}>{label}</span>
    </button>
  );

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) return <main className={shellStyles.page}><div className={shellStyles.empty}>正在加载画布...</div></main>;
  if (loadError) return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}><Link href={backHref} className={shellStyles.navLink}>{backLabel}</Link></div>
        <nav className={shellStyles.topnav}><TopbarAccountActions /></nav>
      </header>
      <div className={shellStyles.empty}>{loadError}</div>
    </main>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className={[shellStyles.page, styles.canvasEditorShell, isProjectCanvas ? styles.projectCanvasEditorShell : ""].filter(Boolean).join(" ")}>
      {!isProjectCanvas ? <header className={[shellStyles.topbar, styles.canvasTopbar].join(" ")}>
        <div className={shellStyles.topbarLeft}>
          <Link href={backHref} className={shellStyles.navLink}>{backLabel}</Link>
          <div className={shellStyles.topbarTagline}>
            <input
              className={styles.canvasTitleInput}
              value={displayTitle ?? title}
              readOnly={!titleEditable || displayTitle !== undefined}
              onChange={(e) => {
                if (!titleEditable || displayTitle !== undefined) return;
                setTitle(e.target.value);
                markDirty();
              }}
              aria-label="画布标题"
            />
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <TopbarAccountActions />
        </nav>
      </header> : null}

      <section className={styles.canvasPage}>
        <div
          ref={containerRef}
          className={[
            styles.canvasRoot,
            spacePanMode ? styles.canvasRootPanMode : "",
            isPanning ? styles.canvasRootPanning : "",
          ].filter(Boolean).join(" ")}
          tabIndex={0}
          onContextMenu={(e) => {
            e.preventDefault();
            const world = screenToWorld(e.clientX, e.clientY);
            menuWorldRef.current = world;
            setMenu({ kind: "canvas", x: e.clientX, y: e.clientY, world });
            setQuickAddBar(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDoubleClick={(e) => {
            // Only on canvas background (not on nodes/handles)
            if ((e.target as HTMLElement).closest("article")) return;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const world = screenToWorld(e.clientX, e.clientY);
            const barHalfW = 225;
            const barH = 68;
            const left = Math.min(Math.max(e.clientX - rect.left, barHalfW), rect.width - barHalfW);
            const top = Math.max(e.clientY - rect.top - barH, 8);
            setQuickAddBar({ left, top, world });
          }}
          onDrop={(e) => {
            e.preventDefault();
            const world = screenToWorld(e.clientX, e.clientY);
            const file = Array.from(e.dataTransfer.files).find((f) => detectMediaKind(f));
            void uploadMedia(file, world);
          }}
          onWheel={handleCanvasWheel}
          onPointerDown={(e) => {
            if (isCanvasGestureBlockedTarget(e.target)) return;
            dismissOverlays();

            // Middle button OR Space+left button → pan
            if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
              e.preventDefault();
              panRef.current = { startX: e.clientX, startY: e.clientY, initial: viewportRef.current };
              setIsPanning(true);
              return;
            }

            if (e.button !== 0) return;

            // Left button on empty canvas: clear selection, enter pending state
            setSelectedNodeIds(new Set());
            setSelectedConnectionIds(new Set());
            setSelectedConnectionId(null);
            connectionDraftRef.current = null;
            setConnectionDraft(null);
            canvasPendingRef.current = { startX: e.clientX, startY: e.clientY, world: screenToWorld(e.clientX, e.clientY) };
          }}
        >
          <div className={styles.gridLayer} style={gridStyle} />
          {!nodes.length && <div className={styles.emptyCanvasHint}>双击空白区域快速添加节点；拖拽框选素材；滚动移动画布；右键更多操作</div>}
          {selectBox && selectBoxStyle && <div className={styles.selectionRect} style={selectBoxStyle} />}

          {/* Quick-add floating bar */}
          {quickAddBar && (
            <div className={styles.quickAddBar} style={{ left: quickAddBar.left, top: quickAddBar.top }} onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className={styles.quickAddBtn} onClick={() => appendNode(makeTextNode(quickAddBar.world))}>
                <span className={styles.quickAddBtnIcon}><CanvasIcon name="text" /></span>文本
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => appendImageNodeWithSelection(quickAddBar.world)}>
                <span className={styles.quickAddBtnIcon}><CanvasIcon name="image" /></span>图片
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => appendNode(makeEmptyVideoNode(quickAddBar.world, currentVideoNodeDefaults()))}>
                <span className={styles.quickAddBtnIcon}><CanvasIcon name="video" /></span>视频
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => { openPresetLibraryForAddingNode(quickAddBar.world); setQuickAddBar(null); }}>
                <span className={styles.quickAddBtnIcon}><CanvasIcon name="preset" /></span>预设
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => { menuWorldRef.current = quickAddBar.world; setQuickAddBar(null); audioInputRef.current?.click(); }}>
                <span className={styles.quickAddBtnIcon}><CanvasIcon name="audio" /></span>音频
              </button>
            </div>
          )}

          {/* World */}
          <div className={styles.world} style={worldStyle}>
            {/* Connections */}
            <svg className={styles.connectionLayer}>
              {connections.map((conn) => {
                const from = nodeMap.get(conn.fromNodeId), to = nodeMap.get(conn.toNodeId);
                if (!from || !to) return null;
                const centerPos = connectionCenterPos(from, to, conn.targetPort);
                const pathData = bezierPath(from, to, conn.targetPort);
                const selected = selectedConnectionId === conn.id || selectedConnectionIds.has(conn.id);
                const selectConnection = () => {
                  setSelectedConnectionIds(new Set([conn.id]));
                  setSelectedConnectionId(conn.id);
                  setSelectedNodeIds(new Set());
                  setConnectionDraft(null);
                };
                return (
                  <g key={conn.id} className={styles.connectionItem}>
                    <path
                      className={styles.connectionHitPath}
                      d={pathData}
                      strokeWidth={22 / viewport.k}
                      onPointerDown={(e) => { e.stopPropagation(); selectConnection(); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectConnection();
                        setMenu({ kind: "connection", x: e.clientX, y: e.clientY, connectionId: conn.id });
                      }}
                    />
                    <path
                      className={[styles.connectionPath, selected ? styles.connectionPathActive : ""].join(" ")}
                      d={pathData}
                      onPointerDown={(e) => { e.stopPropagation(); selectConnection(); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectConnection();
                        setMenu({ kind: "connection", x: e.clientX, y: e.clientY, connectionId: conn.id });
                      }}
                    />
                    <g
                      className={[styles.connectionBreakButton, selected ? styles.connectionBreakButtonActive : ""].join(" ")}
                      transform={`translate(${centerPos.x} ${centerPos.y})`}
                      onPointerDown={(e) => { e.stopPropagation(); deleteConnectionById(conn.id); }}
                      aria-label="断开连线"
                    >
                      <rect x="-13" y="-13" width="26" height="26" rx="10" />
                      <path d="M -6 -6 L 6 6 M 6 -6 L -6 6" />
                    </g>
                  </g>
                );
              })}
              {connectionDraft && nodeMap.get(connectionDraft.anchorNodeId) && (() => {
                const anchor = nodeMap.get(connectionDraft.anchorNodeId)!;
                return (
                  <path
                    className={[styles.connectionPath, styles.connectionPathDraft].join(" ")}
                    d={draftBezierPath(getDraftStartPos(connectionDraft, anchor), connectionDraft.current)}
                  />
                );
              })()}
            </svg>

            {/* Smart Guides */}
            {smartGuides.length > 0 && (
              <svg style={{ position: "absolute", left: 0, top: 0, width: "1px", height: "1px", overflow: "visible", pointerEvents: "none", zIndex: 10 }}>
                {smartGuides.map((g, i) => (
                  <line
                    key={i}
                    x1={g.axis === "x" ? g.pos : g.start}
                    y1={g.axis === "y" ? g.pos : g.start}
                    x2={g.axis === "x" ? g.pos : g.end}
                    y2={g.axis === "y" ? g.pos : g.end}
                    stroke="#6ee7b7"
                    strokeOpacity={0.8}
                    strokeWidth={1.5 / viewport.k}
                    strokeDasharray={`${6 / viewport.k} ${5 / viewport.k}`}
                  />
                ))}
              </svg>
            )}

            {/* Multi-selection bounding box and toolbar */}
            {multiSelectionBox && !isPanning && !dragRef.current && !selectBox && (
              <>
                <div className={styles.multiSelectionBox} style={{ left: multiSelectionBox.x, top: multiSelectionBox.y, width: multiSelectionBox.width, height: multiSelectionBox.height }} />
                
                <div className={styles.multiSelectionToolbar} style={{ left: multiSelectionBox.x + multiSelectionBox.width / 2, top: multiSelectionBox.y }} onPointerDown={(e) => e.stopPropagation()}>
                  {canGroup ? (
                    <button type="button" title="打组 (Ctrl+G)" onClick={(e) => { e.stopPropagation(); groupSelected(); }}><CanvasIcon name="group" />打组</button>
                  ) : canUngroup ? (
                    <button type="button" title="解散组 (Ctrl+Shift+G)" onClick={(e) => { e.stopPropagation(); for (const id of selectedNodeIds) { if (nodeMap.get(id)?.type === "group") { ungroupNode(id); break; } } }}><CanvasIcon name="ungroup" />解散组</button>
                  ) : null}
                  <div className={styles.multiSelectionToolbarDivider} />
                  <button type="button" title="创建副本 (Ctrl+C & V)" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>复制</button>
                  <button type="button" title="删除 (Delete)" onClick={(e) => { e.stopPropagation(); deleteSelected(); }}>删除</button>
                </div>
              </>
            )}

            {/* Nodes (groups rendered first = behind) */}
            {sortedNodes.map((node) => {
              const selected = selectedNodeIds.has(node.id);
              const connectTarget = connectionDraft?.targetNodeId === node.id;
              const isGroup = node.type === "group";
              const isPresetText = isPresetTextNode(node);
              const hasNaturalDim = (node.type === "image" || node.type === "video") &&
                node.metadata?.naturalWidth && node.metadata?.naturalHeight;
              const startTextNodeEdgeDrag = (e: React.PointerEvent) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const cur = new Set(selectedNodeIds);
                if (!cur.has(node.id)) {
                  if (!e.shiftKey) cur.clear();
                  cur.add(node.id);
                  setSelectedNodeIds(cur);
                  setSelectedConnectionIds(new Set());
                  setSelectedConnectionId(null);
                }
                startNodeDrag(node.id, e, cur);
              };
              return (
                <article
                  key={node.id}
                  className={[styles.node, isGroup ? styles.groupNode : "", selected ? styles.nodeActive : "", connectTarget ? styles.nodeConnectTarget : ""].filter(Boolean).join(" ")}
                  style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    setSelectedConnectionIds(new Set());
                    setSelectedConnectionId(null);
                    if (e.shiftKey) { setSelectedNodeIds((prev) => { const next = new Set(prev); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); }
                    else { setSelectedNodeIds(new Set([node.id])); }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: "node", x: e.clientX, y: e.clientY, nodeId: node.id }); setQuickAddBar(null); }}
                >
                  {/* Title overlay (top-left, outside visual boundary) */}
                  <div
                    className={styles.nodeOverlay}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingNodeTitleId(node.id); }}
                  >
                    <span className={styles.nodeOverlayIcon}><CanvasIcon name={isPresetText ? "preset" : nodeTypeIcon(node.type)} /></span>
                    {editingNodeTitleId === node.id ? (
                      <input
                        className={styles.nodeOverlayTitleEdit}
                        defaultValue={node.title}
                        autoFocus
                        onBlur={(e) => { updateNodeTitle(node.id, e.currentTarget.value); setEditingNodeTitleId(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingNodeTitleId(null); e.stopPropagation(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={styles.nodeOverlayTitle}>{node.title}</span>
                    )}
                  </div>

                  {/* Dimensions badge (top-right, outside visual boundary) */}
                  {hasNaturalDim && (
                    <div className={styles.nodeDimBadge}>
                      {node.metadata!.naturalWidth} × {node.metadata!.naturalHeight}
                    </div>
                  )}

                  {!hasMultiSelection && (
                    <div className={styles.nodeHoverToolbar} onPointerDown={(e) => e.stopPropagation()}>
                      {isGroup ? (
                        <>
                          <button type="button" title="解散组 (Ctrl+Shift+G)" onClick={(e) => { e.stopPropagation(); ungroupNode(node.id); }}><CanvasIcon name="ungroup" />解散组</button>
                          <div className={styles.multiSelectionToolbarDivider} />
                          <button type="button" title="创建副本" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>复制</button>
                          <button type="button" title="删除组及内容" onClick={(e) => { e.stopPropagation(); deleteGroupWithChildren(node.id); }}>删除</button>
                        </>
                      ) : (node.type === "image" || node.type === "video") && node.metadata?.source !== "upload" ? (
                        <>
                          <button
                            type="button"
                            title="上传本地文件"
                            onClick={(e) => {
                              e.stopPropagation();
                              uploadTargetNodeRef.current = node.id;
                              if (node.type === "image") imageInputRef.current?.click();
                              else videoInputRef.current?.click();
                            }}
                          >
                            上传
                          </button>
                          <button
                            type="button"
                            title="执行生成"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (node.type === "image") void runImageGenNode(node.id);
                              else void runVideoGenNode(node.id);
                            }}
                            disabled={node.metadata?.status === "running"}
                          >
                            {node.metadata?.status === "success" ? "重新生成" : "生成"}
                          </button>
                          <button type="button" title="导出提示词" onClick={() => downloadNodeMedia(node)}>导出</button>
                          {node.type === "image" && (node.metadata?.imageUrl?.trim() || node.metadata?.previewImageUrl?.trim()) ? (
                            <button
                              type="button"
                              title="放大"
                              onClick={(e) => {
                                e.stopPropagation();
                                openImagePreview(node);
                              }}
                            >
                              放大
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <button type="button" title="下载" onClick={() => downloadNodeMedia(node)}>下载</button>
                          <button type="button" title="放大" onClick={() => openNodeMedia(node)}>放大</button>
                        </>
                      )}
                    </div>
                  )}

                  {/* For image / video gen nodes: two separate visual cards (preview on top, composer below).
                      For all other types: the standard single nodeVisual box. */}
                  {isPresetText ? (
                    <div
                      className={styles.canvasPresetCard}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const target = e.target as HTMLElement;
                        if (["TEXTAREA", "INPUT", "BUTTON", "A", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
                        e.stopPropagation();
                        const cur = new Set(selectedNodeIds);
                        if (!cur.has(node.id)) { if (!e.shiftKey) cur.clear(); cur.add(node.id); setSelectedNodeIds(cur); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); }
                        startNodeDrag(node.id, e, cur);
                      }}
                    >
                      <span className={styles.presetCardCover}>
                        <span className={styles.presetCardOverlay}>
                          <span className={styles.presetCardOverlayTop}>
                            <span className={styles.presetCardTitle}>{node.title}</span>
                            {node.metadata?.presetDescription?.trim() ? (
                              <span className={styles.presetCardDesc}>{node.metadata.presetDescription.trim()}</span>
                            ) : null}
                          </span>
                          <span className={styles.presetModelChips}>
                            {presetModelLabels(node.metadata?.presetKind).map((label) => (
                              <span key={label} className={styles.presetModelChip}>{label}</span>
                            ))}
                          </span>
                        </span>
                        {node.metadata?.previewImageUrl?.trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={node.metadata.previewImageUrl.trim()}
                            alt=""
                            draggable={false}
                            onLoad={(e) => {
                              const img = e.currentTarget;
                              if (!img.naturalWidth || !img.naturalHeight) return;
                              const nextSize = presetCoverFitSize(img.naturalWidth, img.naturalHeight);
                              if (
                                node.metadata?.presetCoverNaturalWidth === img.naturalWidth &&
                                node.metadata?.presetCoverNaturalHeight === img.naturalHeight &&
                                Math.abs(node.width - nextSize.width) < 0.5 &&
                                Math.abs(node.height - nextSize.height) < 0.5
                              ) {
                                return;
                              }
                              patchNode(node.id, (item) => ({
                                ...item,
                                width: nextSize.width,
                                height: nextSize.height,
                                metadata: {
                                  ...item.metadata,
                                  presetCoverNaturalWidth: img.naturalWidth,
                                  presetCoverNaturalHeight: img.naturalHeight,
                                },
                              }));
                            }}
                          />
                        ) : (
                          <span>{node.title}</span>
                        )}
                      </span>
                    </div>
                  ) : node.type === "text" && node.metadata?.textMode === "chat" ? (
                    <>
                      <div
                        className={styles.textChatBox}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          const target = e.target as HTMLElement;
                          if (["TEXTAREA", "INPUT", "BUTTON", "A", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
                          e.stopPropagation();
                          const cur = new Set(selectedNodeIds);
                          if (!cur.has(node.id)) { if (!e.shiftKey) cur.clear(); cur.add(node.id); setSelectedNodeIds(cur); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); }
                          startNodeDrag(node.id, e, cur);
                        }}
                      >
                        <div className={styles.textNodeDragEdges} aria-hidden>
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeTop].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeRight].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeBottom].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeLeft].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                        </div>
                        {node.metadata?.chatPreviewMarkdown?.trim() ? (
                          <div
                            className={styles.textChatMarkdown}
                            data-canvas-scroll-area
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <ChatMarkdown markdown={node.metadata.chatPreviewMarkdown} />
                          </div>
                        ) : (
                          <div className={styles.textChatEmpty}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M8 6h8" />
                              <path d="M8 10h8" />
                              <path d="M8 14h5" />
                              <rect x="5" y="3" width="14" height="18" rx="2" />
                            </svg>
                            <div className={styles.textChatTry}>
                              <span>尝试：</span>
                              <button type="button" onClick={() => switchTextNodeToManual(node.id)}>
                                <span aria-hidden>▤</span>
                                自己写内容
                              </button>
                            </div>
                          </div>
                        )}
                        {node.metadata?.chatStatus === "running" ? (
                          <div className={styles.textChatRunning}>
                            <span className={styles.generatorBtnSpinner} aria-hidden />
                            正在生成回复
                          </div>
                        ) : null}
                        {node.metadata?.chatStatus === "error" && node.metadata?.chatLastError ? (
                          <div className={styles.textChatError}>{node.metadata.chatLastError}</div>
                        ) : null}
                      </div>
                      <div className={styles.genComposerBox} onPointerDown={(e) => e.stopPropagation()} data-canvas-no-zoom>
                        <textarea
                          className={styles.generatorPrompt}
                          value={node.metadata?.chatInput ?? ""}
                          disabled={node.metadata?.chatStatus === "running"}
                          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                          aria-label="画布对话节点输入"
                          onChange={(e) => updateTextNodeChatInput(node.id, e.currentTarget.value)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter" && !e.shiftKey) {
                              if (isImeCompositionKeyEvent(e)) return;
                              e.preventDefault();
                              void runTextChatNode(node.id);
                            }
                          }}
                        />
                        <div className={styles.generatorToolbar}>
                          {renderCanvasPickerButton(
                            llmSettings.models[node.metadata?.chatPreferredLlmModelId ?? llmSettings.defaultModelId]?.label ??
                              node.metadata?.chatPreferredLlmModelId ??
                              llmSettings.defaultModelId,
                            Object.values(llmSettings.models)
                              .filter((model) => model.enabled)
                              .map((model) => ({
                                id: model.id,
                                label: model.label,
                                active: model.id === (node.metadata?.chatPreferredLlmModelId ?? llmSettings.defaultModelId),
                                onSelect: () => {
                                  patchNode(node.id, (item) => ({
                                    ...item,
                                    metadata: { ...item.metadata, chatPreferredLlmModelId: model.id },
                                  }));
                                  const convId = node.metadata?.chatConversationId?.trim();
                                  if (!convId) return;
                                  void fetch(`/api/chat/conversations/${convId}`, { cache: "no-store" })
                                    .then((res) => res.json())
                                    .then((data: { conversation?: ChatConversation }) => {
                                      const conversation = data.conversation;
                                      if (!conversation) return;
                                      return fetch(`/api/chat/conversations/${convId}`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          ...conversation,
                                          preferredLlmModelId: model.id,
                                          updatedAt: Date.now(),
                                        }),
                                      });
                                    })
                                    .catch(() => {});
                                },
                              })),
                            "画布对话模型",
                            node.metadata?.chatStatus === "running",
                          )}
                          {renderCanvasPickerButton(
                            imageSettings.models[node.metadata?.chatPreferredImageModelId ?? "gpt-image-2"]?.label ??
                              node.metadata?.chatPreferredImageModelId ??
                              "gpt-image-2",
                            IMAGE_MODEL_ORDER.map((id) => ({
                              id,
                              label: imageSettings.models[id]?.label ?? id,
                              active: id === (node.metadata?.chatPreferredImageModelId ?? "gpt-image-2"),
                              onSelect: () => patchNode(node.id, (item) => ({
                                ...item,
                                metadata: { ...item.metadata, chatPreferredImageModelId: id },
                              })),
                            })),
                            "画布对话生图模型",
                            node.metadata?.chatStatus === "running",
                          )}
                          <span className={styles.generatorPillLabel}>常规对话</span>
                          <button
                            type="button"
                            className={styles.generatorRunButton}
                            disabled={node.metadata?.chatStatus === "running" || !(node.metadata?.chatInput ?? "").trim()}
                            onClick={() => void runTextChatNode(node.id)}
                            aria-label="发送对话"
                          >
                            {node.metadata?.chatStatus === "running" ? (
                              <span className={styles.generatorBtnSpinner} aria-hidden />
                            ) : (
                              "发送"
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (node.type === "image" || node.type === "video") && node.metadata?.source !== "upload" ? (
                    <>
                      {/* ── Top card: standalone preview box ── */}
                      <div
                        className={styles.genImageBox}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          const target = e.target as HTMLElement;
                          if (["TEXTAREA", "INPUT", "BUTTON", "A", "SELECT"].includes(target.tagName)) return;
                          e.stopPropagation();
                          const cur = new Set(selectedNodeIds);
                          if (!cur.has(node.id)) { if (!e.shiftKey) cur.clear(); cur.add(node.id); setSelectedNodeIds(cur); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); }
                          startNodeDrag(node.id, e, cur);
                        }}
                      >
                        {node.type === "image" ? (
                          /* ── image gen preview ── */
                          node.metadata?.status === "running" ? (
                            <div className={styles.generatorImageLoading}>
                              <span className={styles.generatorSpinner} aria-hidden />
                              <span className={styles.generatorLoadingLabel}>生成中</span>
                            </div>
                          ) : node.metadata?.previewImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={node.metadata.previewImageUrl}
                              alt="生成结果"
                              className={styles.generatorPreviewImage}
                              draggable={false}
                            />
                          ) : (
                            <div className={styles.generatorImagePlaceholder}>
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <rect x="3" y="3" width="18" height="18" rx="3" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                              {node.metadata?.status === "error" && node.metadata?.lastError ? (
                                <span className={styles.generatorPlaceholderError}>{node.metadata.lastError}</span>
                              ) : null}
                            </div>
                          )
                        ) : (
                          /* ── video gen preview ── */
                          node.metadata?.status === "running" ? (
                            <div className={styles.generatorImageLoading}>
                              <span className={styles.generatorSpinner} aria-hidden />
                              <span className={styles.generatorLoadingLabel}>生成中</span>
                            </div>
                          ) : node.metadata?.previewVideoUrl ? (
                            <video
                              src={node.metadata.previewVideoUrl}
                              controls
                              className={styles.generatorPreviewVideo}
                            />
                          ) : (
                            <div className={styles.generatorImagePlaceholder}>
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <rect x="2" y="4" width="20" height="16" rx="3" />
                                <polygon points="10 8 16 12 10 16" />
                              </svg>
                              {node.metadata?.status === "error" && node.metadata?.lastError ? (
                                <span className={styles.generatorPlaceholderError}>{node.metadata.lastError}</span>
                              ) : null}
                            </div>
                          )
                        )}
                      </div>

                      {/* ── Bottom card: composer (prompt + toolbar) ── */}
                      <div className={styles.genComposerBox} onPointerDown={(e) => e.stopPropagation()}>
                        <AssetMentionEditor
                          className={styles.generatorPrompt}
                          value={node.metadata?.prompt ?? ""}
                          placeholder={node.type === "image" ? "描述任何你想要生成的内容" : "描述你想要生成的视频内容"}
                          placeholderClassName={styles.generatorPromptPlaceholder}
                          onValueChange={(newVal) => updateNodeMetadata(node.id, "prompt", newVal)}
                          candidates={getCandidatesForNode(node.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                        <div className={styles.generatorToolbar}>
                          {node.type === "image" ? (
                            <>
                              {renderCanvasPickerButton(
                                imageSettings.models[node.metadata?.imageModelId ?? "gpt-image-2"]?.label ??
                                  node.metadata?.imageModelId ??
                                  "gpt-image-2",
                                IMAGE_MODEL_ORDER.map((id) => ({
                                  id,
                                  label: imageSettings.models[id]?.label ?? id,
                                  active: id === (node.metadata?.imageModelId ?? "gpt-image-2"),
                                  onSelect: () =>
                                    updateImageGenNodeSettings(node.id, {
                                      imageModelId: id,
                                      gptImageQuality:
                                        id === "gpt-image-2" ? (node.metadata?.gptImageQuality ?? imageSettings.gptImageQuality) : undefined,
                                    }),
                                })),
                                "画布生图模型",
                              )}
                              {renderCanvasPickerButton(
                                (node.metadata?.aspectRatio ?? "4:3") === "auto" ? "自适应" : (node.metadata?.aspectRatio ?? "4:3"),
                                (["auto", "1:1", "2:3", "3:2", "5:4", "4:5", "3:4", "4:3", "9:16", "16:9", "21:9", "9:21"] as ImageAspectRatio[]).map((ratio) => ({
                                  id: ratio,
                                  label: ratio === "auto" ? "自适应" : ratio,
                                  active: ratio === (node.metadata?.aspectRatio ?? "4:3"),
                                  onSelect: () => updateImageGenNodeSettings(node.id, { aspectRatio: ratio }),
                                })),
                                "画布生图比例",
                              )}
                              {renderCanvasPickerButton(
                                node.metadata?.imageSize ?? "1K",
                                (["1K", "2K", "4K"] as ImageSizeTier[]).map((size) => ({
                                  id: size,
                                  label: size,
                                  active: size === (node.metadata?.imageSize ?? "1K"),
                                  onSelect: () => updateImageGenNodeSettings(node.id, { imageSize: size }),
                                })),
                                "画布生图尺寸",
                              )}
                              {(node.metadata?.imageModelId ?? "gpt-image-2") === "gpt-image-2" ? (
                                renderCanvasPickerButton(
                                  GPT_IMAGE_QUALITY_LABELS[node.metadata?.gptImageQuality ?? imageSettings.gptImageQuality],
                                  GPT_IMAGE_QUALITY_ORDER.map((quality) => ({
                                    id: quality,
                                    label: GPT_IMAGE_QUALITY_LABELS[quality],
                                    active: quality === (node.metadata?.gptImageQuality ?? imageSettings.gptImageQuality),
                                    onSelect: () => updateImageGenNodeSettings(node.id, { gptImageQuality: quality }),
                                  })),
                                  "画布生图质量",
                                )
                              ) : null}
                            </>
                          ) : (
                            <>
                              {renderCanvasPickerButton(
                                videoSettings.models[node.metadata?.videoModelId ?? videoSettings.uiDefaults.defaultModelId]?.label ??
                                  node.metadata?.videoModelId ??
                                  videoSettings.uiDefaults.defaultModelId,
                                VIDEO_MODEL_ORDER.map((id) => ({
                                  id,
                                  label: videoSettings.models[id]?.label ?? id,
                                  active: id === (node.metadata?.videoModelId ?? videoSettings.uiDefaults.defaultModelId),
                                  onSelect: () => updateVideoGenNodeSettings(node.id, { videoModelId: id }),
                                })),
                                "画布视频模型",
                              )}
                              {renderCanvasPickerButton(
                                UI_VIDEO_MODES.find((mode) => mode.id === (
                                  node.metadata?.videoModeId === "multi_image_reference" ? "multi_image_reference" : "start_end_frame"
                                ))?.label ?? "首尾帧",
                                UI_VIDEO_MODES.map((mode) => ({
                                  id: mode.id,
                                  label: mode.label,
                                  active: mode.id === (
                                    node.metadata?.videoModeId === "multi_image_reference" ? "multi_image_reference" : "start_end_frame"
                                  ),
                                  onSelect: () => updateVideoGenNodeSettings(node.id, { videoModeId: mode.id as VideoGenerationModeId }),
                                })),
                                "画布视频模式",
                              )}
                              {renderCanvasPickerButton(
                                node.metadata?.videoAspectRatio ?? "16:9",
                                getVideoCapabilities(node.metadata?.videoModelId ?? videoSettings.uiDefaults.defaultModelId).aspectRatios.map((ratio) => ({
                                  id: ratio,
                                  label: ratio,
                                  active: ratio === (node.metadata?.videoAspectRatio ?? "16:9"),
                                  onSelect: () => updateVideoGenNodeSettings(node.id, { videoAspectRatio: ratio as VideoAspectRatio }),
                                })),
                                "画布视频比例",
                              )}
                              {renderCanvasPickerButton(
                                `${node.metadata?.videoDurationSeconds ?? 5}s`,
                                getVideoCapabilities(node.metadata?.videoModelId ?? videoSettings.uiDefaults.defaultModelId).durations.map((duration) => ({
                                  id: String(duration),
                                  label: `${duration}s`,
                                  active: duration === (node.metadata?.videoDurationSeconds ?? 5),
                                  onSelect: () => updateVideoGenNodeSettings(node.id, { videoDurationSeconds: duration }),
                                })),
                                "画布视频时长",
                              )}
                              {renderCanvasPickerButton(
                                node.metadata?.videoResolution ?? "1080p",
                                getVideoCapabilities(node.metadata?.videoModelId ?? videoSettings.uiDefaults.defaultModelId).resolutions.map((resolution) => ({
                                  id: resolution,
                                  label: resolution,
                                  active: resolution === (node.metadata?.videoResolution ?? "1080p"),
                                  onSelect: () => updateVideoGenNodeSettings(node.id, { videoResolution: resolution as VideoResolution }),
                                })),
                                "画布视频分辨率",
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className={styles.generatorRunButton}
                            disabled={node.metadata?.status === "running"}
                            onClick={() => node.type === "image" ? void runImageGenNode(node.id) : void runVideoGenNode(node.id)}
                          >
                            {node.metadata?.status === "running" ? (
                              <span className={styles.generatorBtnSpinner} aria-hidden />
                            ) : (
                              "生成"
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Standard single-box layout for text / image / video / audio */
                    <div
                      className={styles.nodeVisual}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const target = e.target as HTMLElement;
                        if (["TEXTAREA", "INPUT", "BUTTON", "A", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
                        e.stopPropagation();
                        const cur = new Set(selectedNodeIds);
                        if (!cur.has(node.id)) { if (!e.shiftKey) cur.clear(); cur.add(node.id); setSelectedNodeIds(cur); setSelectedConnectionIds(new Set()); setSelectedConnectionId(null); }
                        startNodeDrag(node.id, e, cur);
                      }}
                      onDoubleClick={(e) => {
                        if (node.type === "text") {
                          e.stopPropagation();
                          setEditingTextNodeId(node.id);
                        }
                      }}
                    >
                      {node.type === "text" ? (
                        <div className={styles.textNodeDragEdges} aria-hidden>
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeTop].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeRight].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeBottom].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                          <span className={[styles.textNodeDragEdge, styles.textNodeDragEdgeLeft].join(" ")} onPointerDown={startTextNodeEdgeDrag} />
                        </div>
                      ) : null}
                      {node.type === "text" ? (
                        editingTextNodeId === node.id ? (
                          <AssetMentionEditor
                            className={styles.textNodeInput}
                            value={node.metadata?.text ?? ""}
                            placeholder="输入文本、提示词或分镜备注"
                            placeholderClassName={styles.textNodePlaceholder}
                            onValueChange={(newVal) => updateNodeMetadata(node.id, "text", newVal)}
                            candidates={getCandidatesForNode(node.id)}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className={[styles.textNodeMarkdownPreview, styles.textNodePreview].join(" ")}
                            data-canvas-scroll-area
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            {node.metadata?.text?.trim() ? (
                              <ChatMarkdown markdown={node.metadata.text} />
                            ) : (
                              <span className={styles.textNodeEmptyHint}>双击输入文本、提示词或分镜备注</span>
                            )}
                          </div>
                        )
                      ) : node.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <div className={styles.imageFrame}>{node.metadata?.imageUrl && <img src={node.metadata.imageUrl} alt={node.title} draggable={false} />}</div>
                      ) : node.type === "video" ? (
                        <div className={styles.imageFrame}>{node.metadata?.videoUrl && <video src={node.metadata.videoUrl} controls className={styles.videoMedia} />}</div>
                      ) : node.type === "audio" ? (
                        <div className={styles.audioFrame}>
                          <div className={styles.audioGlyph} aria-hidden><CanvasIcon name="audio" /></div>
                          <div className={styles.audioInfo}>
                            <span className={styles.audioTitle}>{node.title || "音频"}</span>
                            <span className={styles.audioMeta}>{node.metadata?.mimeType || "audio"}</span>
                          </div>
                          {node.metadata?.audioUrl ? <CanvasAudioPlayer src={node.metadata.audioUrl} /> : null}
                        </div>
                      ) : null}
                    </div>
                  )}{/* end node visual */}


                  {/* Typed input ports on the left, single output port on the right */}
                  {!isGroup && (() => {
                    const isFromNode = connectionDraft?.mode === "fromOutput" && connectionDraft.fromNodeId === node.id;
                    const isInputAnchor = connectionDraft?.mode === "toInput" && connectionDraft.anchorNodeId === node.id;
                    const targetPorts = getTargetPorts(node);
                    const hasInputPort = targetPorts.length > 0;
                    const inputSnap = connectionDraft?.targetNodeId === node.id && Boolean(connectionDraft.targetPort);
                    const inputConnected = targetPorts.some((targetPort) => connectedInputs.has(`${node.id}:${targetPort}`));
                    return (
                      <>
                        {hasInputPort ? (
                          <button
                            type="button"
                            aria-label="输入端口"
                            className={[
                              styles.connPort,
                              styles.connPortInput,
                              inputSnap || isInputAnchor ? styles.connPortSnap : "",
                              inputConnected ? styles.connPortConnected : "",
                            ].filter(Boolean).join(" ")}
                            onPointerDown={(e) => startInputConnectionDrag(node.id, e)}
                          />
                        ) : null}
                        {canStartConnection(node) ? (
                          <button
                            type="button"
                            aria-label="输出端口"
                            className={[styles.connPort, styles.connPortOutput, isFromNode ? styles.connPortSnap : "", connectedOutputs.has(node.id) ? styles.connPortConnected : ""].filter(Boolean).join(" ")}
                            onPointerDown={(e) => startOutputConnectionDrag(node.id, e)}
                          />
                        ) : null}
                      </>
                    );
                  })()}

                </article>
              );
            })}
          </div>

          {/* Canvas background right-click */}
          {menu?.kind === "canvas" && (
            <div className={styles.uploadMenu} style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
              {/* Group / ungroup based on selection */}
              {canGroup && <button type="button" onClick={() => { groupSelected(); setMenu(null); }}><CanvasIcon name="group" />打组选中 (Ctrl+G)</button>}
              {canUngroup && <button type="button" onClick={() => { for (const id of selectedNodeIds) { if (nodeMap.get(id)?.type === "group") { ungroupNode(id); break; } } setMenu(null); }}><CanvasIcon name="ungroup" />解散组 (Ctrl+⇧+G)</button>}
              {selectedNodeIds.size > 0 && <button type="button" onClick={() => { const s = nodesRef.current.filter(n => selectedNodeIds.has(n.id)); if (s.length) { nodeClipboardRef.current = s; setHasClipboard(true); } setMenu(null); }}><CanvasIcon name="copy" />复制选中 (Ctrl+C)</button>}
              {hasSelection && <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteSelected(); setMenu(null); }}><CanvasIcon name="delete" />删除选中 (Del)</button>}
              {(canGroup || canUngroup || hasSelection) && <div className={styles.uploadMenuDivider} />}
              <button type="button" disabled={!hasClipboard} onClick={() => { pasteNodes(menu.world); setMenu(null); }}><CanvasIcon name="paste" />粘贴节点 (Ctrl+V)</button>
              <button type="button" onClick={() => { setSelectedNodeIds(new Set(nodesRef.current.map(n => n.id))); setSelectedConnectionIds(new Set(connectionsRef.current.map(conn => conn.id))); setSelectedConnectionId(null); setMenu(null); }}>全选 (Ctrl+A)</button>
              <button type="button" onClick={() => {
                const snapshot = historyRef.current.pop();
                if (snapshot) {
                  redoHistoryRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
                  setNodes(snapshot.nodes); setConnections(snapshot.connections); nodesRef.current = snapshot.nodes; connectionsRef.current = snapshot.connections; markDirty();
                }
                setMenu(null);
              }}>撤销 (Ctrl+Z)</button>
              <button type="button" onClick={() => {
                const snapshot = redoHistoryRef.current.pop();
                if (snapshot) {
                  historyRef.current.push({ nodes: [...nodesRef.current], connections: [...connectionsRef.current] });
                  setNodes(snapshot.nodes); setConnections(snapshot.connections); nodesRef.current = snapshot.nodes; connectionsRef.current = snapshot.connections; markDirty();
                }
                setMenu(null);
              }}>重做 (Ctrl+Y)</button>
            </div>
          )}

          {/* Connection right-click */}
          {menu?.kind === "connection" && (
            <div className={styles.uploadMenu} style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className={styles.uploadMenuDanger} onClick={() => deleteConnectionById(menu.connectionId)}>断开连线</button>
            </div>
          )}

          {/* Node right-click */}
          {menu?.kind === "node" && (() => {
            const nodeId = menu.nodeId;
            const nodeData = nodeMap.get(nodeId);
            const isGroup = nodeData?.type === "group";
            // When right-clicking a node that's part of a multi-selection
            const multiSelected = selectedNodeIds.size > 1 && selectedNodeIds.has(nodeId);
            if (isGroup) {
              return (
                <div className={styles.uploadMenu} style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => { ungroupNode(nodeId); setMenu(null); }}><CanvasIcon name="ungroup" />解散组（保留内容）</button>
                  <button type="button" onClick={() => { duplicateNodes(new Set([nodeId])); setMenu(null); }}><CanvasIcon name="copy" />复制节点 (Ctrl+D)</button>
                  <div className={styles.uploadMenuDivider} />
                  <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteGroupWithChildren(nodeId); setMenu(null); }}><CanvasIcon name="delete" />删除组和全部内容</button>
                </div>
              );
            }
            return (
              <div className={styles.uploadMenu} style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                {multiSelected && canGroup && <button type="button" onClick={() => { groupSelected(); setMenu(null); }}><CanvasIcon name="group" />打组选中 (Ctrl+G)</button>}
                {multiSelected && canGroup && <div className={styles.uploadMenuDivider} />}
                {(nodeData?.type === "image" || nodeData?.type === "video") && nodeData?.metadata?.source !== "upload" ? (
                  <>
                    <button type="button" onClick={() => {
                      const targetNode = nodeMap.get(nodeId);
                      if (targetNode?.type === "image") void runImageGenNode(nodeId);
                      if (targetNode?.type === "video") void runVideoGenNode(nodeId);
                      setMenu(null);
                    }}>
                      <CanvasIcon name="generate" />{nodeData.metadata?.status === "success" ? "重新生成" : "生成"}
                    </button>
                    <div className={styles.uploadMenuDivider} />
                  </>
                ) : null}
                <button type="button" onClick={() => { setEditingNodeTitleId(nodeId); setMenu(null); }}><CanvasIcon name="text" />重命名</button>
                <button type="button" onClick={() => { duplicateNodes(new Set([nodeId])); setMenu(null); }}><CanvasIcon name="copy" />复制节点 (Ctrl+D)</button>
                <div className={styles.uploadMenuDivider} />
                {multiSelected
                  ? <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteSelected(); setMenu(null); }}><CanvasIcon name="delete" />删除选中 ({selectedNodeIds.size} 个)</button>
                  : <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteNodeById(nodeId); setMenu(null); }}><CanvasIcon name="delete" />删除节点</button>
                }
              </div>
            );
          })()}

          {/* ── Bottom toolbar ── */}
          <div className={styles.toolbar} onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className={styles.toolbarIconBtn} onClick={undoLast} title="撤销 (Ctrl+Z)" aria-label="撤销">
              <svg className={styles.toolbarStrokeIcon} viewBox="0 0 24 24" aria-hidden>
                <path d="M9 8H5V4" />
                <path d="M5.7 8.2A7 7 0 1 1 6 16.2" />
              </svg>
            </button>
            <button type="button" className={styles.toolbarIconBtn} onClick={redoLast} title="重做 (Ctrl+Y)" aria-label="重做">
              <svg className={styles.toolbarStrokeIcon} viewBox="0 0 24 24" aria-hidden>
                <path d="M15 8h4V4" />
                <path d="M18.3 8.2A7 7 0 1 0 18 16.2" />
              </svg>
            </button>
            <div className={styles.toolbarDivider} />
            <button type="button" className={[styles.toolbarTextBtn, minimapVisible ? styles.toolbarBtnActive : ""].join(" ")} onClick={() => setMinimapVisible((v) => !v)} title="小地图">小地图</button>
            <button type="button" className={styles.toolbarTextBtn} onClick={fitToView} title="适配全部节点">适配</button>
            <button type="button" className={[styles.toolbarIconBtn, styles.toolbarZoomBtn].join(" ")} onClick={() => zoomBy(-0.15)} title="缩小 (Ctrl+−)">−</button>
            <input
              className={styles.zoomSlider}
              type="range"
              min={5}
              max={500}
              value={Math.round(viewport.k * 100)}
              onChange={(e) => setZoom(Number(e.currentTarget.value) / 100)}
              aria-label="缩放"
            />
            <span className={styles.zoomDisplay}>{zoomPct}%</span>
            <button type="button" className={[styles.toolbarIconBtn, styles.toolbarZoomBtn].join(" ")} onClick={() => zoomBy(0.15)} title="放大 (Ctrl+=)">+</button>
            <div className={styles.toolbarDivider} />
            <button
              type="button"
              className={[styles.toolbarTextBtn, styles.toolbarToggleBtn, snapToGrid ? styles.toolbarBtnActive : ""].join(" ")}
              onClick={toggleSnapToGrid}
              aria-pressed={snapToGrid}
              title={snapToGrid ? "自动对齐已开启" : "自动对齐已关闭"}
            >
              对齐
            </button>
            <button type="button" className={styles.toolbarTextBtn} onClick={() => setShortcutsOpen(true)} title="帮助">
              帮助
            </button>
          </div>

          {minimapVisible && (
            <div className={styles.minimap} onPointerDown={(e) => {
              e.stopPropagation();
              minimapPanRef.current = { startX: e.clientX, startY: e.clientY, initial: viewportRef.current, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }} onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              dragViewportFromMinimap(e.clientX, e.clientY);
            }} onPointerUp={(e) => {
              e.stopPropagation();
              const drag = minimapPanRef.current;
              minimapPanRef.current = null;
              if (!drag?.moved) centerViewportFromMinimap(e.clientX, e.clientY);
            }} onPointerCancel={() => {
              minimapPanRef.current = null;
            }}>
              <div ref={minimapRef} className={styles.minimapCanvas} style={{ width: minimap.width, height: minimap.height }}>
                {nodes.map((node) => {
                  const r = minimap.mapRect({ x: node.position.x, y: node.position.y, width: node.width, height: node.height });
                  return <span key={node.id} className={styles.minimapNode} style={{ left: r.left, top: r.top, width: r.width, height: r.height, backgroundColor: isPresetTextNode(node) ? "#c4b5fd" : nodeTypeColor(node.type) }} />;
                })}
              </div>
            </div>
          )}

          {shortcutsOpen && (
            <div className={styles.shortcutModalBackdrop} onPointerDown={(e) => { e.stopPropagation(); setShortcutsOpen(false); }}>
              <div className={styles.shortcutModal} onPointerDown={(e) => e.stopPropagation()}>
                <div className={styles.assetDrawerHeader}>
                  <div>
                    <div className={styles.assetDrawerTitle}>帮助</div>
                    <div className={styles.assetDrawerMeta}>画布操作、节点使用和快捷键</div>
                  </div>
                  <button type="button" className={styles.toolbarIconBtn} onClick={() => setShortcutsOpen(false)} aria-label="关闭快捷键">×</button>
                </div>
                <div className={styles.helpSections}>
                  <section className={styles.helpSection}>
                    <h3>使用方法</h3>
                    <div className={styles.shortcutGrid}>
                      <span>双击空白画布</span><strong>快速添加节点</strong>
                      <span>拖拽节点边缘</span><strong>移动节点</strong>
                      <span>拖拽节点端口</span><strong>建立连接</strong>
                      <span>右键节点或画布</span><strong>打开更多操作</strong>
                      <span>选中生成节点</span><strong>显示下方生成操作框</strong>
                    </div>
                  </section>
                  <section className={styles.helpSection}>
                    <h3>快捷键</h3>
                <div className={styles.shortcutGrid}>
                  <span>Ctrl / Cmd + 滚轮</span><strong>缩放</strong>
                  <span>滚轮 / 触控板滑动</span><strong>平移画布</strong>
                  <span>Space + 拖拽 / 鼠标中键</span><strong>平移画布</strong>
                  <span>拖拽节点端口</span><strong>连线</strong>
                  <span>Ctrl / Cmd + Z / Y</span><strong>撤销 / 重做</strong>
                  <span>Ctrl / Cmd + C / V / D</span><strong>复制 / 粘贴 / 复制节点</strong>
                  <span>Delete / Backspace</span><strong>删除选中</strong>
                </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {portalMounted && canvasPickerMenu
            ? createPortal(
                <>
                  <button
                    type="button"
                    className={styles.canvasPickerBackdrop}
                    aria-label="关闭画布选项菜单"
                    onClick={() => setCanvasPickerMenu(null)}
                  />
                  <div
                    className={styles.canvasPickerMenu}
                    style={{
                      left: canvasPickerMenu.anchor.left + canvasPickerMenu.anchor.width / 2,
                      top: canvasPickerMenu.anchor.top,
                      minWidth: canvasPickerMenu.anchor.width,
                    } as CSSProperties}
                    role="menu"
                  >
                    {canvasPickerMenu.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={[
                          styles.canvasPickerOption,
                          option.active ? styles.canvasPickerOptionActive : "",
                        ].filter(Boolean).join(" ")}
                        role="menuitemradio"
                        aria-checked={option.active}
                        onClick={() => {
                          option.onSelect();
                          setCanvasPickerMenu(null);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>,
                document.body,
              )
            : null}

          <PromptPresetLibraryDialog
            open={portalMounted && presetLibraryOpen}
            onClose={() => {
              setPresetLibraryOpen(false);
              setPresetAddNodePos(null);
            }}
            allowedApplyKinds="all"
            onApplyPreset={handlePresetSelect}
          />

          {portalMounted && imagePreviewNode
            ? createPortal(
                <div className={styles.imagePreviewRoot} role="dialog" aria-modal="true" aria-label="图片预览">
                  <button
                    type="button"
                    className={styles.imagePreviewBackdrop}
                    onClick={() => setImagePreviewNode(null)}
                    aria-label="关闭图片预览"
                  />
                  <figure className={styles.imagePreviewFrame}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreviewNode.metadata?.imageUrl?.trim() || imagePreviewNode.metadata?.previewImageUrl?.trim() || ""}
                      alt={imagePreviewNode.title || "生成图片"}
                      className={styles.imagePreviewImg}
                    />
                  </figure>
                  <button
                    type="button"
                    className={styles.imagePreviewClose}
                    onClick={() => setImagePreviewNode(null)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>,
                document.body,
              )
            : null}

          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => { const tid = uploadTargetNodeRef.current; uploadTargetNodeRef.current = null; void uploadMedia(e.target.files?.[0], undefined, tid, "image"); }} />
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => { const tid = uploadTargetNodeRef.current; uploadTargetNodeRef.current = null; void uploadMedia(e.target.files?.[0], undefined, tid, "video"); }} />
          <input ref={audioInputRef} type="file" accept="audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav" hidden onChange={(e) => { const tid = uploadTargetNodeRef.current; uploadTargetNodeRef.current = null; void uploadMedia(e.target.files?.[0], undefined, tid, "audio"); }} />
          <input ref={mediaInputRef} type="file" accept="image/*,video/*,audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav" hidden onChange={(e) => { const tid = uploadTargetNodeRef.current; uploadTargetNodeRef.current = null; void uploadMedia(e.target.files?.[0], undefined, tid); }} />
        </div>
      </section>
    </main>
  );
}
