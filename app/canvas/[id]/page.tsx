"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import shellStyles from "@/app/shared/shell.module.css";
import {
  fetchGalleryRecords,
  fetchVideoGalleryRecords,
  prependGalleryRecordApi,
  prependVideoGalleryRecordApi,
} from "@/lib/workspace-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import type {
  CanvasBoard,
  CanvasBoardData,
  CanvasConnection,
  CanvasNode,
  CanvasNodeType,
  CanvasPosition,
  CanvasViewport,
} from "@/lib/canvas/types";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas/types";
import styles from "../canvas-page.module.css";

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
type UploadKind = "image" | "video";
type AssetKind = "text" | "image" | "video";

type MenuState =
  | { kind: "canvas"; x: number; y: number; world: CanvasPosition }
  | { kind: "node"; x: number; y: number; nodeId: string }
  | null;

type AssetDrawerState = { open: boolean; insertAt: CanvasPosition | null };

type TextAsset = {
  id: string;
  title: string;
  text: string;
  createdAt: string;
};

type AssetItem = {
  id: string;
  kind: AssetKind;
  title: string;
  subtitle: string;
  url?: string;
  text?: string;
  source: "gallery" | "canvas" | "local";
};

type ConnectionDraft = {
  fromNodeId: string;
  /** Port the drag started from */
  fromSide: "left" | "right";
  /** Current cursor position in world coordinates (snapped to target port when near) */
  current: CanvasPosition;
  targetNodeId: string | null;
  /** Closest port on the target node */
  targetSide: "left" | "right" | null;
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

const MEDIA_BUCKET = "generated-images";
const MAX_HISTORY = 40;
const GROUP_PAD = 28;
const DRAG_THRESHOLD = 5;
const PORT_SNAP_RADIUS = 80;
const GRID_SIZE = 32;
const CANVAS_EXPORT_VERSION = 1;
const TEXT_ASSET_STORAGE_KEY = "gleam-canvas-text-assets";

// ─── Pure utilities ────────────────────────────────────────────────────────────

function fileExt(file: File) {
  const t = file.type.toLowerCase();
  if (t.includes("quicktime")) return "mov";
  if (t.includes("webm")) return "webm";
  if (t.includes("mp4")) return "mp4";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  return "png";
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

function bezierPath(from: CanvasNode, to: CanvasNode) {
  const dir = to.position.x + to.width / 2 >= from.position.x + from.width / 2 ? 1 : -1;
  const x1 = dir > 0 ? from.position.x + from.width : from.position.x;
  const y1 = from.position.y + from.height / 2;
  const x2 = dir > 0 ? to.position.x : to.position.x + to.width;
  const y2 = to.position.y + to.height / 2;
  const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx * dir} ${y1}, ${x2 - dx * dir} ${y2}, ${x2} ${y2}`;
}

function draftBezierPath(from: CanvasNode, fromSide: "left" | "right", to: CanvasPosition) {
  const x1 = fromSide === "right" ? from.position.x + from.width : from.position.x;
  const y1 = from.position.y + from.height / 2;
  const dir = to.x > x1 ? 1 : -1;
  const dx = Math.max(80, Math.abs(to.x - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx * dir} ${y1}, ${to.x - dx * dir} ${to.y}, ${to.x} ${to.y}`;
}

/** Return the world position of a node's connection port */
function getPortPos(node: CanvasNode, side: "left" | "right"): CanvasPosition {
  return {
    x: side === "right" ? node.position.x + node.width : node.position.x,
    y: node.position.y + node.height / 2,
  };
}

/**
 * Find the closest port within PORT_SNAP_RADIUS of the given world point.
 * Returns the node + side, or null if nothing is close enough.
 */
function nodeNear(
  nodes: CanvasNode[],
  point: CanvasPosition,
  exceptId?: string
): { nodeId: string; side: "left" | "right" } | null {
  let best: { nodeId: string; side: "left" | "right"; dist: number } | null = null;
  for (const n of nodes) {
    if (n.id === exceptId || n.type === "group") continue;
    const cy = n.position.y + n.height / 2;
    const dl = Math.hypot(point.x - n.position.x, point.y - cy);
    const dr = Math.hypot(point.x - (n.position.x + n.width), point.y - cy);
    const side = dl <= dr ? "left" : "right";
    const dist = Math.min(dl, dr);
    if (dist < PORT_SNAP_RADIUS && (!best || dist < best.dist)) {
      best = { nodeId: n.id, side, dist };
    }
  }
  return best ? { nodeId: best.nodeId, side: best.side } : null;
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

function makeTextNode(pos: CanvasPosition): CanvasNode {
  return { id: newNodeId("text"), type: "text", title: "文本", position: { x: pos.x - 140, y: pos.y - 85 }, width: 280, height: 170, metadata: { text: "" } };
}

function makeGenerationNode(type: "imageGen" | "videoGen", pos: CanvasPosition): CanvasNode {
  return { id: newNodeId(type), type, title: type === "imageGen" ? "生图节点" : "生视频节点", position: { x: pos.x - 150, y: pos.y - 90 }, width: 300, height: 180, metadata: { prompt: "" } };
}

function makeMediaNode(pos: CanvasPosition, kind: UploadKind, media: { url: string; width: number; height: number; mimeType: string, filename?: string }): CanvasNode {
  const size = fitMediaSize(media);
  return {
    id: newNodeId(kind), type: kind, title: media.filename || (kind === "image" ? "图片" : "视频"),
    position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    width: size.width, height: size.height,
    metadata: { imageUrl: kind === "image" ? media.url : undefined, videoUrl: kind === "video" ? media.url : undefined, naturalWidth: media.width, naturalHeight: media.height, mimeType: media.mimeType, source: "upload" },
  };
}

function makeMediaNodeFromAsset(pos: CanvasPosition, kind: UploadKind, asset: { url: string; title: string }): CanvasNode {
  return makeMediaNode(pos, kind, {
    url: asset.url,
    width: kind === "image" ? 1024 : 1280,
    height: kind === "image" ? 768 : 720,
    mimeType: kind === "image" ? "image/png" : "video/mp4",
    filename: asset.title,
  });
}

function nodeTypeIcon(type: CanvasNodeType) {
  if (type === "group") return "🗂️";
  if (type === "image") return "🖼️";
  if (type === "video") return "🎬";
  if (type === "imageGen") return "✨";
  if (type === "videoGen") return "🎥";
  return "✏️";
}

function nodeTypeColor(type: CanvasNodeType) {
  if (type === "group") return "#a1a1aa";
  if (type === "image") return "#60a5fa";
  if (type === "video") return "#f472b6";
  if (type === "imageGen") return "#facc15";
  if (type === "videoGen") return "#a78bfa";
  return "#6ee7b7";
}

function sanitizeImportedBoard(value: unknown): CanvasBoardData | null {
  if (!value || typeof value !== "object") return null;
  const maybeWrapper = value as { board?: unknown };
  const board = maybeWrapper.board && typeof maybeWrapper.board === "object" ? maybeWrapper.board : value;
  const data = board as Partial<CanvasBoardData>;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.connections) || !data.viewport) return null;
  return {
    nodes: data.nodes,
    connections: data.connections,
    viewport: data.viewport,
    snapToGrid: data.snapToGrid === true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CanvasBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const boardId = params.id ?? "";

  // DOM refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Interaction refs — never trigger re-render
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const selectBoxStartRef = useRef<{ x: number; y: number } | null>(null);
  const canvasPendingRef = useRef<CanvasPending | null>(null);
  const menuWorldRef = useRef<CanvasPosition | null>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
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
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [selectBox, setSelectBox] = useState<SelectBoxScreen>(null);
  const [quickAddBar, setQuickAddBar] = useState<QuickAddBar>(null);
  const [editingNodeTitleId, setEditingNodeTitleId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [assetDrawer, setAssetDrawer] = useState<AssetDrawerState>({ open: false, insertAt: null });
  const [assetQuery, setAssetQuery] = useState("");
  const [imageAssets, setImageAssets] = useState<ImageGalleryRecord[]>([]);
  const [videoAssets, setVideoAssets] = useState<VideoGalleryRecord[]>([]);
  const [textAssets, setTextAssets] = useState<TextAsset[]>([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [assetNotice, setAssetNotice] = useState("");
  /** Whether Space key is held — drives cursor CSS class */
  const [spacePanMode, setSpacePanMode] = useState(false);
  /** Whether pointer is actively panning */
  const [isPanning, setIsPanning] = useState(false);
  /** Whether clipboard has nodes (drives menu item enabled state) */
  const [hasClipboard, setHasClipboard] = useState(false);
  /** Active smart guides for rendering during drag */
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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
    setQuickAddBar(null);
    setEditingNodeTitleId(null);
  }, []);

  const loadTextAssets = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(TEXT_ASSET_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setTextAssets(Array.isArray(parsed) ? parsed.filter((item): item is TextAsset => (
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.text === "string" &&
        typeof item.createdAt === "string"
      )) : []);
    } catch {
      setTextAssets([]);
    }
  }, []);

  const saveTextAssets = useCallback((items: TextAsset[]) => {
    setTextAssets(items);
    window.localStorage.setItem(TEXT_ASSET_STORAGE_KEY, JSON.stringify(items.slice(0, 80)));
  }, []);

  const openAssetDrawer = useCallback((insertAt: CanvasPosition | null = null) => {
    setAssetDrawer({ open: true, insertAt });
    setAssetNotice("");
  }, []);

  const closeAssetDrawer = useCallback(() => {
    setAssetDrawer({ open: false, insertAt: null });
    setAssetQuery("");
  }, []);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("textarea,input,select,video,[data-canvas-no-zoom]")) return;

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

    const handler = (event: WheelEvent) => event.preventDefault();
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
        const res = await fetch(`/api/canvas-boards/${boardId}`, { cache: "no-store" });
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
  }, [boardId, setSnapToGridBoth, setViewportBoth]);

  useEffect(() => {
    loadTextAssets();
  }, [loadTextAssets]);

  useEffect(() => {
    if (!assetDrawer.open) return;
    let cancelled = false;
    setAssetLoading(true);
    setAssetError("");
    Promise.all([
      fetchGalleryRecords().catch(() => [] as ImageGalleryRecord[]),
      fetchVideoGalleryRecords().catch(() => [] as VideoGalleryRecord[]),
    ]).then(([images, videos]) => {
      if (cancelled) return;
      setImageAssets(images);
      setVideoAssets(videos);
    }).catch((e) => {
      if (!cancelled) setAssetError(e instanceof Error ? e.message : "素材库加载失败");
    }).finally(() => {
      if (!cancelled) setAssetLoading(false);
    });
    return () => { cancelled = true; };
  }, [assetDrawer.open]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty || loading || loadError) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/canvas-boards/${boardId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, data: { nodes, connections, viewport, snapToGrid } as CanvasBoardData }),
        });
        if (!res.ok) throw new Error("保存失败");
        setDirty(false); setSaveStatus("saved");
      } catch { setSaveStatus("error"); }
    }, 450);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [boardId, connections, dirty, loadError, loading, nodes, snapToGrid, title, viewport]);

  // ── Global pointer events ───────────────────────────────────────────────────
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      // Connection draft — update position and snap to nearest port
      if (connectionDraftRef.current) {
        const rawWorld = screenToWorld(e.clientX, e.clientY);
        const snap = nodeNear(nodesRef.current, rawWorld, connectionDraftRef.current.fromNodeId);
        const snapNode = snap ? nodesRef.current.find((n) => n.id === snap.nodeId) : null;
        const snappedPos = snapNode ? getPortPos(snapNode, snap!.side) : rawWorld;
        const next: ConnectionDraft = {
          ...connectionDraftRef.current,
          current: snappedPos,
          targetNodeId: snap?.nodeId ?? null,
          targetSide: snap?.side ?? null,
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

        let newGuides: SmartGuide[] = [];
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
      if (draft?.targetNodeId) {
        const exists = connectionsRef.current.some((c) => c.fromNodeId === draft.fromNodeId && c.toNodeId === draft.targetNodeId);
        if (!exists) {
          historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), { nodes: [...nodesRef.current], connections: [...connectionsRef.current] }];
          setConnections((items) => [...items, { id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fromNodeId: draft.fromNodeId, toNodeId: draft.targetNodeId! }]);
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
          if (inside.size > 0) { setSelectedNodeIds(inside); setSelectedConnectionId(null); }
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

  // ── Paste (image/video from OS clipboard) ───────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
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
      if (meta && e.key === "a") { if (isEditable) return; e.preventDefault(); setSelectedNodeIds(new Set(nodesRef.current.map((n) => n.id))); setSelectedConnectionId(null); return; }
      // Ctrl+= / Ctrl+- / Ctrl+0 — zoom
      if (meta && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomBy(0.15); return; }
      if (meta && e.key === "-") { e.preventDefault(); zoomBy(-0.15); return; }
      if (meta && e.key === "0") { e.preventDefault(); setViewportBoth(DEFAULT_CANVAS_VIEWPORT); markDirty(); return; }

      if (isEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
      if (e.key === "Escape") {
        setSelectedNodeIds(new Set()); setSelectedConnectionId(null); dismissOverlays();
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
    setNodes((items) => [...items, nextNode]);
    setSelectedNodeIds(new Set([node.id])); setSelectedConnectionId(null); setConnectionDraft(null);
    setQuickAddBar(null);
    markDirty();
  }, [pushHistory, markDirty]);

  const uploadMedia = async (file?: File, position = menuWorldRef.current ?? worldCenter()) => {
    if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) return;
    const kind: UploadKind = file.type.startsWith("video/") ? "video" : "image";
    setUploading(true); setSaveStatus("saving");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("请先登录");
      const path = `${user.id}/canvas/${boardId}/${kind}/${crypto.randomUUID()}.${fileExt(file)}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || (kind === "video" ? "video/mp4" : "image/png"), upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      if (!data.publicUrl) throw new Error("无法生成媒体地址");
      const objectUrl = URL.createObjectURL(file);
      const size = kind === "video" ? await readVideoSize(objectUrl) : await readImageSize(objectUrl);
      URL.revokeObjectURL(objectUrl);
      appendNode(makeMediaNode(position, kind, { url: data.publicUrl, width: size.width, height: size.height, mimeType: file.type || (kind === "video" ? "video/mp4" : "image/png"), filename: file.name }));
    } catch { setSaveStatus("error"); }
    finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };

  const updateNodeMetadata = (nodeId: string, key: "text" | "prompt", value: string) => {
    setNodes((items) => items.map((n) => (n.id === nodeId ? { ...n, metadata: { ...n.metadata, [key]: value } } : n)));
    markDirty();
  };

  const updateNodeTitle = (nodeId: string, value: string) => {
    setNodes((items) => items.map((n) => (n.id === nodeId ? { ...n, title: value.trim() || "未命名" } : n)));
    markDirty();
  };

  const deleteSelected = useCallback(() => {
    if (selectedConnectionId) {
      pushHistory(); setConnections((c) => c.filter((x) => x.id !== selectedConnectionId)); setSelectedConnectionId(null); markDirty(); return;
    }
    if (selectedNodeIds.size > 0) {
      pushHistory();
      const ids = new Set(selectedNodeIds);
      setNodes((items) => items.filter((n) => !ids.has(n.id)).map((n) => ids.has(n.metadata?.parentId ?? "") ? { ...n, metadata: { ...n.metadata, parentId: undefined } } : n));
      setConnections((c) => c.filter((x) => !ids.has(x.fromNodeId) && !ids.has(x.toNodeId)));
      setSelectedNodeIds(new Set()); markDirty();
    }
  }, [selectedConnectionId, selectedNodeIds, pushHistory, markDirty]);

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
      if (nf && nt) newConns.push({ id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fromNodeId: nf, toNodeId: nt });
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
      if (nf && nt) newConns.push({ id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fromNodeId: nf, toNodeId: nt });
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

  const insertAsset = useCallback((asset: AssetItem) => {
    const target = assetDrawer.insertAt ?? worldCenter();
    if (asset.kind === "text") {
      appendNode({
        ...makeTextNode(target),
        title: asset.title || "文本素材",
        metadata: { text: asset.text ?? "" },
      });
      closeAssetDrawer();
      return;
    }
    if (!asset.url) return;
    appendNode(makeMediaNodeFromAsset(target, asset.kind, { url: asset.url, title: asset.title }));
    closeAssetDrawer();
  }, [appendNode, assetDrawer.insertAt, closeAssetDrawer, worldCenter]);

  const saveNodeToAssets = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    setAssetNotice("");
    try {
      if (node.type === "text") {
        const text = node.metadata?.text?.trim();
        if (!text) {
          setAssetNotice("文本节点为空，未保存");
          return;
        }
        const next: TextAsset = {
          id: `text-asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: node.title || "文本素材",
          text,
          createdAt: new Date().toISOString(),
        };
        saveTextAssets([next, ...textAssets.filter((item) => item.text !== text)]);
        setAssetNotice("已保存为文本素材");
        return;
      }
      if (node.type === "image" && node.metadata?.imageUrl) {
        const record: ImageGalleryRecord = {
          id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          modeId: "canvas",
          modeName: "无限画布",
          modelId: "gpt-image-2",
          modelName: "canvas asset",
          finalPrompt: node.title,
          userInput: node.title,
          aspectRatio: "auto",
          imageSize: "1K",
          imageUrl: node.metadata.imageUrl,
          refImageCount: 0,
          status: "success",
        };
        const records = await prependGalleryRecordApi(record);
        setImageAssets(records);
        setAssetNotice("图片已加入素材库");
        return;
      }
      if (node.type === "video" && node.metadata?.videoUrl) {
        const record: VideoGalleryRecord = {
          id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          modeId: "canvas",
          modeName: "无限画布",
          modelId: "seedance-2.0",
          modelName: "canvas asset",
          finalPrompt: node.title,
          aspectRatio: "16:9",
          duration: 5,
          videoUrl: node.metadata.videoUrl,
          status: "success",
        };
        const records = await prependVideoGalleryRecordApi(record);
        setVideoAssets(records);
        setAssetNotice("视频已加入素材库");
        return;
      }
      setAssetNotice("当前节点不能加入素材库");
    } catch {
      setAssetNotice("加入素材库失败");
    }
  }, [saveTextAssets, textAssets]);

  const exportCanvas = useCallback(() => {
    const payload = {
      version: CANVAS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      board: { title, nodes, connections, viewport, snapToGrid } satisfies CanvasBoardData & { title: string },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.trim() || "canvas"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [connections, nodes, snapToGrid, title, viewport]);

  const importCanvasFile = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const data = sanitizeImportedBoard(parsed);
      if (!data) throw new Error("invalid");
      const importedTitle =
        parsed && typeof parsed === "object" && "board" in parsed && parsed.board && typeof parsed.board === "object" && "title" in parsed.board && typeof parsed.board.title === "string"
          ? `导入 - ${parsed.board.title}`
          : `导入 - ${title}`;
      const createRes = await fetch("/api/canvas-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: importedTitle }),
      });
      if (!createRes.ok) throw new Error("create_failed");
      const created = (await createRes.json()) as CanvasBoard;
      const putRes = await fetch(`/api/canvas-boards/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: importedTitle, data }),
      });
      if (!putRes.ok) throw new Error("save_failed");
      router.push(`/canvas/${created.id}`);
    } catch {
      setSaveStatus("error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, [router, title]);

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
    setSelectedConnectionId(null);
    markDirty();
  }, [markDirty, setViewportBoth]);

  const openNodeMedia = useCallback((node: CanvasNode) => {
    const url = node.type === "image" ? node.metadata?.imageUrl : node.type === "video" ? node.metadata?.videoUrl : undefined;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else focusNode(node);
  }, [focusNode]);

  const downloadNodeMedia = useCallback((node: CanvasNode) => {
    const url = node.type === "image" ? node.metadata?.imageUrl : node.type === "video" ? node.metadata?.videoUrl : undefined;
    if (url) {
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = node.title || (node.type === "image" ? "image.png" : "video.mp4");
          a.click();
          URL.revokeObjectURL(a.href);
        })
        .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    } else if (node.type === "text" || node.type === "imageGen" || node.type === "videoGen") {
      const text = node.type === "text" ? node.metadata?.text : node.metadata?.prompt;
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

  const startConnectionDrag = (nodeId: string, side: "left" | "right", e: React.PointerEvent) => {
    e.stopPropagation();
    const fromNode = nodesRef.current.find((n) => n.id === nodeId);
    const current = fromNode ? getPortPos(fromNode, side) : screenToWorld(e.clientX, e.clientY);
    const draft: ConnectionDraft = { fromNodeId: nodeId, fromSide: side, current, targetNodeId: null, targetSide: null };
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
    setSelectedNodeIds(new Set([nodeId])); setSelectedConnectionId(null);
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
    backgroundImage: "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${viewport.x % gridSize}px ${viewport.y % gridSize}px`,
  };

  const saveLabel = uploading ? "上传中" : saveStatus === "saving" ? "保存中" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败" : "未保存";
  const hasSelection = selectedNodeIds.size > 0 || !!selectedConnectionId;
  const zoomPct = Math.round(viewport.k * 100);
  const canGroup = [...selectedNodeIds].filter((id) => nodeMap.get(id)?.type !== "group").length >= 2;
  const canUngroup = [...selectedNodeIds].some((id) => nodeMap.get(id)?.type === "group");

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

  const assetItems = useMemo<AssetItem[]>(() => {
    const images: AssetItem[] = imageAssets
      .filter((record) => record.status === "success" && Boolean(record.imageUrl))
      .map((record) => ({
        id: `gallery-image-${record.id}`,
        kind: "image",
        title: record.modeName || "图片素材",
        subtitle: record.modelName || record.createdAt,
        url: record.imageUrl,
        source: "gallery",
      }));
    const videos: AssetItem[] = videoAssets
      .filter((record) => record.status === "success" && Boolean(record.videoUrl))
      .map((record) => ({
        id: `gallery-video-${record.id}`,
        kind: "video",
        title: record.modeName || "视频素材",
        subtitle: record.modelName || record.createdAt,
        url: record.videoUrl,
        source: "gallery",
      }));
    const texts: AssetItem[] = textAssets.map((item) => ({
      id: item.id,
      kind: "text",
      title: item.title,
      subtitle: "文本素材",
      text: item.text,
      source: "local",
    }));
    const canvasAssets: AssetItem[] = nodes.flatMap<AssetItem>((node) => {
      if (node.type === "image" && node.metadata?.imageUrl) {
        return [{
          id: `canvas-image-${node.id}`,
          kind: "image" as const,
          title: node.title || "画布图片",
          subtitle: "当前画布",
          url: node.metadata.imageUrl,
          source: "canvas" as const,
        }];
      }
      if (node.type === "video" && node.metadata?.videoUrl) {
        return [{
          id: `canvas-video-${node.id}`,
          kind: "video" as const,
          title: node.title || "画布视频",
          subtitle: "当前画布",
          url: node.metadata.videoUrl,
          source: "canvas" as const,
        }];
      }
      return [];
    });
    const q = assetQuery.trim().toLowerCase();
    return [...images, ...videos, ...texts, ...canvasAssets].filter((item) => {
      if (!q) return true;
      return `${item.title} ${item.subtitle} ${item.text ?? ""}`.toLowerCase().includes(q);
    });
  }, [assetQuery, imageAssets, nodes, textAssets, videoAssets]);

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

  const moveViewportFromMinimap = useCallback((clientX: number, clientY: number) => {
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

  // ── Early returns ───────────────────────────────────────────────────────────
  if (loading) return <main className={shellStyles.page}><div className={shellStyles.empty}>正在加载画布...</div></main>;
  if (loadError) return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}><div className={shellStyles.topbarLeft}><Link href="/canvas" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>返回画布库</Link></div></header>
      <div className={shellStyles.empty}>{loadError}</div>
    </main>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/canvas" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>返回画布库</Link>
          <div className={shellStyles.topbarTagline}>
            <input className={[shellStyles.input, shellStyles.inputCompact].join(" ")} value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} aria-label="画布标题" style={{ width: 220 }} />
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <span className={shellStyles.plainDockText}>{saveLabel}</span>
          <button type="button" className={shellStyles.navLink} onClick={() => openAssetDrawer(null)}>素材库</button>
          <button type="button" className={shellStyles.navLink} onClick={exportCanvas}>导出</button>
          <button type="button" className={shellStyles.navLink} onClick={() => importInputRef.current?.click()}>导入</button>
        </nav>
      </header>

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
            const barHalfW = 175;
            const barH = 68;
            const left = Math.min(Math.max(e.clientX - rect.left, barHalfW), rect.width - barHalfW);
            const top = Math.max(e.clientY - rect.top - barH, 8);
            setQuickAddBar({ left, top, world });
          }}
          onDrop={(e) => {
            e.preventDefault();
            const world = screenToWorld(e.clientX, e.clientY);
            const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
            void uploadMedia(file, world);
          }}
          onWheel={handleCanvasWheel}
          onPointerDown={(e) => {
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
                <span className={styles.quickAddBtnIcon}>✏️</span>文本
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => { menuWorldRef.current = quickAddBar.world; setQuickAddBar(null); imageInputRef.current?.click(); }}>
                <span className={styles.quickAddBtnIcon}>🖼️</span>图片
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => { menuWorldRef.current = quickAddBar.world; setQuickAddBar(null); videoInputRef.current?.click(); }}>
                <span className={styles.quickAddBtnIcon}>🎬</span>视频
              </button>
              <div className={styles.quickAddDivider} />
              <button type="button" className={styles.quickAddBtn} onClick={() => appendNode(makeGenerationNode("imageGen", quickAddBar.world))}>
                <span className={styles.quickAddBtnIcon}>✨</span>生图
              </button>
              <button type="button" className={styles.quickAddBtn} onClick={() => appendNode(makeGenerationNode("videoGen", quickAddBar.world))}>
                <span className={styles.quickAddBtnIcon}>🎥</span>生视频
              </button>
            </div>
          )}

          {/* World */}
          <div className={styles.world} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})` }}>
            {/* Connections */}
            <svg className={styles.connectionLayer}>
              {connections.map((conn) => {
                const from = nodeMap.get(conn.fromNodeId), to = nodeMap.get(conn.toNodeId);
                if (!from || !to) return null;
                return (
                  <path key={conn.id}
                    className={[styles.connectionPath, selectedConnectionId === conn.id ? styles.connectionPathActive : ""].join(" ")}
                    d={bezierPath(from, to)}
                    onPointerDown={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); setSelectedNodeIds(new Set()); setConnectionDraft(null); }}
                  />
                );
              })}
              {connectionDraft && nodeMap.get(connectionDraft.fromNodeId) && (
                <path className={[styles.connectionPath, styles.connectionPathDraft].join(" ")} d={draftBezierPath(nodeMap.get(connectionDraft.fromNodeId)!, connectionDraft.fromSide, connectionDraft.current)} />
              )}
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
                    <button type="button" title="打组 (Ctrl+G)" onClick={(e) => { e.stopPropagation(); groupSelected(); }}>🗂️ 打组</button>
                  ) : canUngroup ? (
                    <button type="button" title="解散组 (Ctrl+Shift+G)" onClick={(e) => { e.stopPropagation(); for (const id of selectedNodeIds) { if (nodeMap.get(id)?.type === "group") { ungroupNode(id); break; } } }}>✂️ 解散组</button>
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
              const hasNaturalDim = (node.type === "image" || node.type === "video") &&
                node.metadata?.naturalWidth && node.metadata?.naturalHeight;
              return (
                <article
                  key={node.id}
                  className={[styles.node, isGroup ? styles.groupNode : "", selected ? styles.nodeActive : "", connectTarget ? styles.nodeConnectTarget : ""].filter(Boolean).join(" ")}
                  style={{ left: node.position.x, top: node.position.y, width: node.width, height: node.height }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    if (e.shiftKey) { setSelectedNodeIds((prev) => { const next = new Set(prev); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); }
                    else { setSelectedNodeIds(new Set([node.id])); setSelectedConnectionId(null); }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: "node", x: e.clientX, y: e.clientY, nodeId: node.id }); setQuickAddBar(null); }}
                >
                  {/* Title overlay (top-left, outside visual boundary) */}
                  <div
                    className={styles.nodeOverlay}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingNodeTitleId(node.id); }}
                  >
                    <span className={styles.nodeOverlayIcon}>{nodeTypeIcon(node.type)}</span>
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
                          <button type="button" title="解散组 (Ctrl+Shift+G)" onClick={(e) => { e.stopPropagation(); ungroupNode(node.id); }}>✂️ 解散组</button>
                          <div className={styles.multiSelectionToolbarDivider} />
                          <button type="button" title="创建副本" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>复制</button>
                          <button type="button" title="删除组及内容" onClick={(e) => { e.stopPropagation(); deleteGroupWithChildren(node.id); }}>删除</button>
                        </>
                      ) : (
                        <>
                          <button type="button" title="下载" onClick={() => downloadNodeMedia(node)}>下载</button>
                          <button type="button" title="放大" onClick={() => openNodeMedia(node)}>放大</button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Inner visual container — clips content to border-radius */}
                  <div
                    className={styles.nodeVisual}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      const target = e.target as HTMLElement;
                      if (["TEXTAREA", "VIDEO", "INPUT", "BUTTON", "A"].includes(target.tagName)) return;
                      e.stopPropagation();
                      const cur = new Set(selectedNodeIds);
                      if (!cur.has(node.id)) { if (!e.shiftKey) cur.clear(); cur.add(node.id); setSelectedNodeIds(cur); setSelectedConnectionId(null); }
                      startNodeDrag(node.id, e, cur);
                    }}
                  >
                    {/* Content fills full card */}
                    {node.type === "text" ? (
                      <textarea
                        className={styles.textNodeInput}
                        value={node.metadata?.text ?? ""}
                        placeholder="输入文本、提示词或分镜备注"
                        onChange={(e) => updateNodeMetadata(node.id, "text", e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    ) : node.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <div className={styles.imageFrame}>{node.metadata?.imageUrl && <img src={node.metadata.imageUrl} alt={node.title} draggable={false} />}</div>
                    ) : node.type === "video" ? (
                      <div className={styles.imageFrame}>{node.metadata?.videoUrl && <video src={node.metadata.videoUrl} controls className={styles.videoMedia} onPointerDown={(e) => e.stopPropagation()} />}</div>
                    ) : node.type === "imageGen" || node.type === "videoGen" ? (
                      <div className={styles.generatorBody}>
                        <textarea
                          className={styles.generatorPrompt}
                          value={node.metadata?.prompt ?? ""}
                          placeholder={node.type === "imageGen" ? "输入生图提示词" : "输入生视频提示词"}
                          onChange={(e) => updateNodeMetadata(node.id, "prompt", e.target.value)}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                        <span className={styles.generatorBadge}>{node.type === "imageGen" ? "生图节点" : "生视频节点"}</span>
                      </div>
                    ) : null}
                  </div>{/* end nodeVisual */}

                  {/* Left + Right connection ports — outside nodeVisual so not clipped */}
                  {!isGroup && (() => {
                    const isFromNode = connectionDraft?.fromNodeId === node.id;
                    const snapLeft  = connectionDraft?.targetNodeId === node.id && connectionDraft.targetSide === "left";
                    const snapRight = connectionDraft?.targetNodeId === node.id && connectionDraft.targetSide === "right";
                    return (
                      <>
                        <button type="button" aria-label="左侧连线端口"
                          className={[styles.connPort, styles.connPortLeft, (isFromNode && connectionDraft?.fromSide === "left") || snapLeft ? styles.connPortSnap : ""].filter(Boolean).join(" ")}
                          onPointerDown={(e) => startConnectionDrag(node.id, "left", e)} />
                        <button type="button" aria-label="右侧连线端口"
                          className={[styles.connPort, styles.connPortRight, (isFromNode && connectionDraft?.fromSide === "right") || snapRight ? styles.connPortSnap : ""].filter(Boolean).join(" ")}
                          onPointerDown={(e) => startConnectionDrag(node.id, "right", e)} />
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
              {canGroup && <button type="button" onClick={() => { groupSelected(); setMenu(null); }}>🗂️ 打组选中 (Ctrl+G)</button>}
              {canUngroup && <button type="button" onClick={() => { for (const id of selectedNodeIds) { if (nodeMap.get(id)?.type === "group") { ungroupNode(id); break; } } setMenu(null); }}>✂️ 解散组 (Ctrl+⇧+G)</button>}
              {hasSelection && <button type="button" onClick={() => { const s = nodesRef.current.filter(n => selectedNodeIds.has(n.id)); if (s.length) { nodeClipboardRef.current = s; setHasClipboard(true); } setMenu(null); }}>📋 复制选中 (Ctrl+C)</button>}
              {hasSelection && <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteSelected(); setMenu(null); }}>🗑️ 删除选中 (Del)</button>}
              {(canGroup || canUngroup || hasSelection) && <div className={styles.uploadMenuDivider} />}
              <button type="button" disabled={!hasClipboard} onClick={() => { pasteNodes(menu.world); setMenu(null); }}>📋 粘贴节点 (Ctrl+V)</button>
              <button type="button" onClick={() => { setSelectedNodeIds(new Set(nodesRef.current.map(n => n.id))); setSelectedConnectionId(null); setMenu(null); }}>全选 (Ctrl+A)</button>
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
              <div className={styles.uploadMenuDivider} />
              <button type="button" onClick={() => { appendNode(makeTextNode(menu.world)); setMenu(null); }}>新建文本节点</button>
              <button type="button" onClick={() => { menuWorldRef.current = menu.world; setMenu(null); imageInputRef.current?.click(); }}>上传图片</button>
              <button type="button" onClick={() => { menuWorldRef.current = menu.world; setMenu(null); videoInputRef.current?.click(); }}>上传视频</button>
              <button type="button" onClick={() => { openAssetDrawer(menu.world); setMenu(null); }}>打开素材库</button>
              <div className={styles.uploadMenuDivider} />
              <button type="button" onClick={() => { appendNode(makeGenerationNode("imageGen", menu.world)); setMenu(null); }}>生图节点</button>
              <button type="button" onClick={() => { appendNode(makeGenerationNode("videoGen", menu.world)); setMenu(null); }}>生视频节点</button>
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
                  <button type="button" onClick={() => { ungroupNode(nodeId); setMenu(null); }}>✂️ 解散组（保留内容）</button>
                  <button type="button" onClick={() => { duplicateNodes(new Set([nodeId])); setMenu(null); }}>📋 复制节点 (Ctrl+D)</button>
                  <div className={styles.uploadMenuDivider} />
                  <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteGroupWithChildren(nodeId); setMenu(null); }}>🗑️ 删除组和全部内容</button>
                </div>
              );
            }
            return (
              <div className={styles.uploadMenu} style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                {multiSelected && canGroup && <button type="button" onClick={() => { groupSelected(); setMenu(null); }}>🗂️ 打组选中 (Ctrl+G)</button>}
                {multiSelected && canGroup && <div className={styles.uploadMenuDivider} />}
                <button type="button" onClick={() => { setEditingNodeTitleId(nodeId); setMenu(null); }}>✏️ 重命名</button>
                <button type="button" onClick={() => { duplicateNodes(new Set([nodeId])); setMenu(null); }}>📋 复制节点 (Ctrl+D)</button>
                <div className={styles.uploadMenuDivider} />
                {multiSelected
                  ? <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteSelected(); setMenu(null); }}>🗑️ 删除选中 ({selectedNodeIds.size} 个)</button>
                  : <button type="button" className={styles.uploadMenuDanger} onClick={() => { deleteNodeById(nodeId); setMenu(null); }}>🗑️ 删除节点</button>
                }
              </div>
            );
          })()}

          {/* ── Bottom toolbar ── */}
          <div className={styles.toolbar} onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className={styles.toolbarIconBtn} onClick={undoLast} title="撤销 (Ctrl+Z)">↶</button>
            <button type="button" className={styles.toolbarIconBtn} onClick={redoLast} title="重做 (Ctrl+Y)">↷</button>
            <div className={styles.toolbarDivider} />
            <button type="button" className={[styles.toolbarTextBtn, minimapVisible ? styles.toolbarBtnActive : ""].join(" ")} onClick={() => setMinimapVisible((v) => !v)} title="小地图">小地图</button>
            <button type="button" className={styles.toolbarIconBtn} onClick={() => zoomBy(-0.15)} title="缩小 (Ctrl+−)">−</button>
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
            <button type="button" className={styles.toolbarIconBtn} onClick={() => zoomBy(0.15)} title="放大 (Ctrl+=)">+</button>
            <div className={styles.toolbarDivider} />
            <button type="button" className={[styles.toolbarTextBtn, snapToGrid ? styles.toolbarBtnActive : ""].join(" ")} onClick={toggleSnapToGrid} title="自动对齐">对齐</button>
            <button type="button" className={styles.toolbarIconBtn} onClick={() => setShortcutsOpen(true)} title="快捷键帮助">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/></svg>
            </button>
          </div>

          {minimapVisible && (
            <div className={styles.minimap} onPointerDown={(e) => {
              e.stopPropagation();
              moveViewportFromMinimap(e.clientX, e.clientY);
              e.currentTarget.setPointerCapture(e.pointerId);
            }} onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              moveViewportFromMinimap(e.clientX, e.clientY);
            }}>
              <div ref={minimapRef} className={styles.minimapCanvas} style={{ width: minimap.width, height: minimap.height }}>
                {nodes.map((node) => {
                  const r = minimap.mapRect({ x: node.position.x, y: node.position.y, width: node.width, height: node.height });
                  return <span key={node.id} className={styles.minimapNode} style={{ left: r.left, top: r.top, width: r.width, height: r.height, backgroundColor: nodeTypeColor(node.type) }} />;
                })}
                {(() => {
                  const r = minimap.mapRect(minimap.viewportWorld);
                  return <span className={styles.minimapViewport} style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />;
                })()}
              </div>
            </div>
          )}

          {assetDrawer.open && (
            <aside className={styles.assetDrawer} onPointerDown={(e) => e.stopPropagation()}>
              <div className={styles.assetDrawerHeader}>
                <div>
                  <div className={styles.assetDrawerTitle}>素材库</div>
                  <div className={styles.assetDrawerMeta}>{assetItems.length} 个可插入素材</div>
                </div>
                <button type="button" className={styles.toolbarIconBtn} onClick={closeAssetDrawer} aria-label="关闭素材库">×</button>
              </div>
              <input
                className={styles.assetSearch}
                value={assetQuery}
                onChange={(e) => setAssetQuery(e.target.value)}
                placeholder="搜索标题或模式名"
              />
              {assetNotice && <div className={styles.assetNotice}>{assetNotice}</div>}
              {assetError && <div className={styles.assetNotice}>{assetError}</div>}
              <div className={styles.assetList}>
                {assetLoading ? <div className={styles.assetEmpty}>正在加载素材...</div> : assetItems.length ? assetItems.map((asset) => (
                  <button key={asset.id} type="button" className={styles.assetItem} onClick={() => insertAsset(asset)}>
                    <span className={styles.assetThumb}>
                      {asset.kind === "image" && asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.url} alt={asset.title} />
                      ) : asset.kind === "video" && asset.url ? (
                        <video src={asset.url} muted playsInline />
                      ) : (
                        <span className={styles.assetTextThumb}>文</span>
                      )}
                    </span>
                    <span className={styles.assetInfo}>
                      <span className={styles.assetTitle}>{asset.title}</span>
                      <span className={styles.assetSubtitle}>{asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : "文本"} · {asset.subtitle}</span>
                    </span>
                  </button>
                )) : <div className={styles.assetEmpty}>暂无匹配素材</div>}
              </div>
            </aside>
          )}

          {shortcutsOpen && (
            <div className={styles.shortcutModalBackdrop} onPointerDown={(e) => { e.stopPropagation(); setShortcutsOpen(false); }}>
              <div className={styles.shortcutModal} onPointerDown={(e) => e.stopPropagation()}>
                <div className={styles.assetDrawerHeader}>
                  <div className={styles.assetDrawerTitle}>快捷键</div>
                  <button type="button" className={styles.toolbarIconBtn} onClick={() => setShortcutsOpen(false)} aria-label="关闭快捷键">×</button>
                </div>
                <div className={styles.shortcutGrid}>
                  <span>Ctrl / Cmd + 滚轮</span><strong>缩放</strong>
                  <span>滚轮 / 触控板滑动</span><strong>平移画布</strong>
                  <span>Space + 拖拽 / 鼠标中键</span><strong>平移画布</strong>
                  <span>双击空白</span><strong>快速添加</strong>
                  <span>拖拽节点端口</span><strong>连线</strong>
                  <span>Ctrl / Cmd + Z / Y</span><strong>撤销 / 重做</strong>
                  <span>Ctrl / Cmd + C / V / D</span><strong>复制 / 粘贴 / 复制节点</strong>
                  <span>Delete / Backspace</span><strong>删除选中</strong>
                </div>
              </div>
            </div>
          )}

          {/* Status hint */}
          <div className={styles.statusPanel}>
            <div className={styles.statusText}>
              {connectionDraft ? "拖到另一个节点松开完成连线 · Esc 取消"
                : selectedNodeIds.size > 1 ? `已选 ${selectedNodeIds.size} 个 · 右键菜单进行打组/删除等操作 · Ctrl+G 打组`
                : spacePanMode ? "Space 平移模式 — 拖拽移动画布"
                : "拖拽框选 · 双击添加节点 · 右键菜单 · Ctrl+Z 撤销"}
            </div>
          </div>

          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => void uploadMedia(e.target.files?.[0])} />
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => void uploadMedia(e.target.files?.[0])} />
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" hidden onChange={(e) => void uploadMedia(e.target.files?.[0])} />
          <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importCanvasFile(e.target.files?.[0])} />
        </div>
      </section>
    </main>
  );
}
