"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildImagePromptFromSlots,
  composerSlotCountForTemplate,
  DEFAULT_IMAGE_SETTINGS,
  extractPromptPlaceholderOccurrences,
  GPT_IMAGE_QUALITY_LABELS,
  GPT_IMAGE_QUALITY_ORDER,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  IMAGE_REF_SLOT_COUNT,
  imageReferenceLimitForContext,
  imageAspectRatiosForContext,
  imagePromptMaxLengthForContext,
  normalizeImageAspectRatioForContext,
  imageSupportsAspectRatioForContext,
  placeholderInnerHint,
  type GptImageBackground,
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageGalleryRecord,
  type ImageGalleryReferenceImage,
  type ImageModelId,
  type ImageModelProvider,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import { AssetMentionEditor } from "@/components/AssetMentionEditor";
import { PromptPresetLibraryDialog } from "@/components/prompt-presets/PromptPresetLibraryDialog";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import { ProjectAssetPickerDialog } from "@/components/project-assets/ProjectAssetPickerDialog";
import { useOptionalWorkspaceProject } from "@/components/workspace/WorkspaceProjectContext";
import { WorkspaceModeDock } from "@/components/workspace/WorkspaceModeDock";
import { resolveAssetMentions, type AssetMentionCandidate } from "@/lib/asset-mentions";
import type { ProjectAsset } from "@/lib/project-assets";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import {
  mergeCachedImageUrls,
  saveImageResultForRecord,
} from "@/lib/image-gallery-client-cache";
import {
  fetchGalleryRecords,
  fetchWorkspaceSnapshot,
  prependGalleryRecordApi,
} from "@/lib/workspace-api";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { fetchSitePromptPresets } from "@/lib/prompt-preset-api-client";
import { formatGenerationErrorForDisplay } from "@/lib/generation-error-classifier";
import shellStyles from "../shared/shell.module.css";
import styles from "./image-page.module.css";

const IMAGE_SIZES: ImageSizeTier[] = ["1K", "2K", "4K"];
const RESULT_ASPECT_RATIO_BY_VALUE: Partial<Record<ImageAspectRatio, string>> = {
  "1:1": "1 / 1",
  "2:3": "2 / 3",
  "3:2": "3 / 2",
  "5:4": "5 / 4",
  "4:5": "4 / 5",
  "3:4": "3 / 4",
  "4:3": "4 / 3",
  "9:16": "9 / 16",
  "16:9": "16 / 9",
  "21:9": "21 / 9",
  "9:21": "9 / 21",
};
const RESULT_ASPECT_RATIO_NUMBER_BY_VALUE: Partial<Record<ImageAspectRatio, number>> = {
  "1:1": 1,
  "2:3": 2 / 3,
  "3:2": 3 / 2,
  "5:4": 5 / 4,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "4:3": 4 / 3,
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "21:9": 21 / 9,
  "9:21": 9 / 21,
};

function ratioPreviewAspect(value: string): string | undefined {
  if (value === "auto") return undefined;
  const match = value.match(/^(\d+):(\d+)$/);
  return match ? `${match[1]} / ${match[2]}` : undefined;
}

function ratioPreviewStyle(value: string): CSSProperties | undefined {
  const match = value.match(/^(\d+):(\d+)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const maxWidth = 38;
  const maxHeight = 26;
  const ratio = width / height;
  const previewWidth = ratio >= maxWidth / maxHeight ? maxWidth : maxHeight * ratio;
  const previewHeight = ratio >= maxWidth / maxHeight ? maxWidth / ratio : maxHeight;
  return {
    aspectRatio: ratioPreviewAspect(value),
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
  };
}

const IMAGE_GENERATION_RUNTIME_STORAGE_KEY = "script-agent-image-generation-runtime-v1";
const IMAGE_GENERATION_RUNTIME_EVENT = "script-agent-image-generation-runtime-change";
const IMAGE_REFERENCE_CACHE_STORAGE_KEY = "script-agent-image-reference-cache-v1";
const OPEN_IMAGE_PROMPT_PRESETS_EVENT = "otato:open-image-prompt-presets";
const FREE_MODE = { id: "free", label: "自由模式" } as const;

type RefSlot = { previewUrl: string; file: File } | null;
type MenuAnchor = { left: number; top: number; width: number; height: number };
type RefUploadMenuState = { index: number; anchor: MenuAnchor } | null;
type ToolbarPickerKind = "model" | "ratio" | "size" | "quality";
type ToolbarPickerMenuState = { kind: ToolbarPickerKind; anchor: MenuAnchor } | null;
type ImagePromptPresetCard = SitePromptPreset & {
  promptModelProviders: ImageModelProvider[];
};
type PendingImageGeneration = {
  id: string;
  createdAt: string;
  modeId: string;
  modeName: string;
  modelId: ImageModelId;
  modelName: string;
  finalPrompt: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  gptImageBackground?: GptImageBackground;
  previewUrl?: string;
};
type ImageSidebarHistoryItem =
  | { kind: "pending"; pending: PendingImageGeneration }
  | { kind: "record"; record: ImageGalleryRecord };

function isImageModelId(value: unknown): value is ImageModelId {
  return typeof value === "string" && IMAGE_MODEL_ORDER.includes(value as ImageModelId);
}

type ImageGenerationRuntimeState = {
  taskId: string;
  status: "running" | "success" | "error";
  startedAt: string;
  updatedAt: string;
  modeId: string;
  modelId: ImageModelId;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  gptImageBackground?: GptImageBackground;
  slotInputs: string[];
  finalPrompt: string;
  referenceImages: ImageGalleryReferenceImage[];
  imageUrl?: string;
  error?: string;
};

type ImageGenerateFailureDetails = {
  stage?: string;
  routeKind?: string;
  endpoint?: string;
  status?: number;
  taskId?: string;
  modelId?: string;
  upstreamBody?: string;
  stack?: string;
};

type ImageGenerateFailurePayload = {
  error?: string;
  code?: string;
  reasonCode?: string;
  userMessage?: string;
  traceId?: string;
  details?: ImageGenerateFailureDetails;
};

type CreditQuoteState = {
  loading: boolean;
  credits?: number;
  availableCredits?: number;
  reservedCredits?: number;
  enough?: boolean;
  error?: string;
};

function formatImageGenerateFailure(data: ImageGenerateFailurePayload, fallback = "生图失败"): string {
  const display = formatGenerationErrorForDisplay({
    code: data.code,
    reasonCode: data.reasonCode,
    userMessage: data.userMessage,
    fallbackCode: data.details?.stage ? `IMAGE_${data.details.stage.toUpperCase()}` : undefined,
    fallbackMessage: fallback === "服务器未返回图片地址" ? "IMAGE_RESPONSE_MISSING_URL" : "IMAGE_UNKNOWN",
  });
  const raw = data.error?.trim();
  const stack = data.details?.stack?.trim().split("\n").slice(0, 3).join("\n");
  const details = [raw && !display.includes(raw) ? raw : "", stack && stack !== raw ? stack : ""]
    .filter(Boolean)
    .join("\n");
  return details ? `${display}\n${details}` : display;
}

function createEmptyRefSlots(): RefSlot[] {
  return Array.from({ length: IMAGE_REF_SLOT_COUNT }, () => null);
}

function normalizeRefSlots(slots: Array<RefSlot | null | undefined>): RefSlot[] {
  return Array.from({ length: IMAGE_REF_SLOT_COUNT }, (_, index) => slots[index] ?? null);
}

function revokeRefPreview(slot: RefSlot | null) {
  if (slot?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(slot.previewUrl);
}

function refSlotFromFile(file: File): NonNullable<RefSlot> {
  return { file, previewUrl: URL.createObjectURL(file) };
}

function menuAnchorFromElement(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function mediaFileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "").trim();
    return name || fallback;
  } catch {
    return decodeURIComponent(url.split(/[?#]/)[0]?.split("/").filter(Boolean).at(-1) ?? "").trim() || fallback;
  }
}

async function refSlotFromProjectAsset(asset: ProjectAsset): Promise<NonNullable<RefSlot>> {
  const response = await fetch(asset.primaryImageUrl);
  if (!response.ok) throw new Error("项目素材读取失败");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("请选择图片素材");
  const file = new File(
    [blob],
    mediaFileNameFromUrl(asset.primaryImageUrl, `${asset.name || "project-asset"}.png`),
    { type: blob.type || "image/png" },
  );
  return { file, previewUrl: asset.primaryImageUrl };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("参考图读取失败"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("参考图读取失败"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const [header, body = ""] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+);base64$/)?.[1] || type || "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name || "reference.png", { type: mime });
}

async function fetchReferenceImageBlob(url: string): Promise<Blob | null> {
  const viaProxy = await fetch(`/api/media/object?url=${encodeURIComponent(url)}`).catch(() => null);
  if (viaProxy?.ok) return viaProxy.blob();
  const direct = await fetch(url).catch(() => null);
  if (!direct?.ok) return null;
  return direct.blob();
}

async function referenceImageToFile(image: ImageGalleryReferenceImage): Promise<{ file: File; previewUrl: string } | null> {
  if (!image.dataUrl) return null;
  const type = image.type || image.dataUrl.match(/^data:([^;]+);base64,/)?.[1] || "image/png";
  const name = image.name || `reference-${image.slotIndex + 1}.png`;
  if (image.dataUrl.startsWith("data:")) {
    return {
      file: dataUrlToFile(image.dataUrl, name, type),
      previewUrl: image.dataUrl,
    };
  }
  if (/^https?:\/\//i.test(image.dataUrl)) {
    const blob = await fetchReferenceImageBlob(image.dataUrl);
    if (!blob) return null;
    return {
      file: new File([blob], name, { type: blob.type || type }),
      previewUrl: image.dataUrl,
    };
  }
  return null;
}

async function snapshotReferenceImages(slots: RefSlot[]): Promise<ImageGalleryReferenceImage[]> {
  const entries = await Promise.all(
    slots.map(async (slot, slotIndex): Promise<ImageGalleryReferenceImage | null> => {
      if (!slot?.file) return null;
      return {
        slotIndex,
        dataUrl: await fileToDataUrl(slot.file),
        name: slot.file.name,
        type: slot.file.type,
      };
    }),
  );
  return entries.filter((entry): entry is ImageGalleryReferenceImage => entry !== null);
}

function readGenerationRuntimeState(): ImageGenerationRuntimeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IMAGE_GENERATION_RUNTIME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImageGenerationRuntimeState>;
    if (!parsed.taskId || !parsed.status || !parsed.startedAt) return null;
    if (parsed.status !== "running" && parsed.status !== "success" && parsed.status !== "error") return null;
    if (!isImageModelId(parsed.modelId)) {
      return null;
    }
    return {
      taskId: parsed.taskId,
      status: parsed.status,
      startedAt: parsed.startedAt,
      updatedAt: parsed.updatedAt || parsed.startedAt,
      modeId: String(parsed.modeId || "free"),
      modelId: parsed.modelId,
      aspectRatio: parsed.aspectRatio || "4:3",
      imageSize: parsed.imageSize || "1K",
      gptImageQuality: parsed.gptImageQuality,
      gptImageBackground: parsed.gptImageBackground,
      slotInputs: Array.isArray(parsed.slotInputs) ? parsed.slotInputs.map((x) => String(x ?? "")) : [""],
      finalPrompt: String(parsed.finalPrompt || ""),
      referenceImages: Array.isArray(parsed.referenceImages) ? parsed.referenceImages : [],
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return null;
  }
}

function writeGenerationRuntimeState(next: ImageGenerationRuntimeState) {
  if (typeof window === "undefined") return;
  try {
    const lean =
      next.imageUrl && next.imageUrl.startsWith("data:") && next.imageUrl.length > 200_000
        ? { ...next, imageUrl: undefined }
        : next;
    window.localStorage.setItem(IMAGE_GENERATION_RUNTIME_STORAGE_KEY, JSON.stringify(lean));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent<ImageGenerationRuntimeState>(IMAGE_GENERATION_RUNTIME_EVENT, { detail: next }));
}

function readReferenceImageCache(): Record<string, ImageGalleryReferenceImage[]> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMAGE_REFERENCE_CACHE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveReferenceImagesForRecord(recordId: string, referenceImages: ImageGalleryReferenceImage[]) {
  if (typeof window === "undefined" || referenceImages.length === 0) return;
  try {
    const cache = readReferenceImageCache();
    cache[recordId] = referenceImages;
    const entries = Object.entries(cache).slice(-24);
    window.localStorage.setItem(IMAGE_REFERENCE_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage 配额满时跳过，避免未捕获异常拖垮页面
  }
}

function mergeCachedReferenceImages(records: ImageGalleryRecord[]): ImageGalleryRecord[] {
  const cache = readReferenceImageCache();
  return records.map((record) => {
    if (record.referenceImages?.length) return record;
    const cached = cache[record.id];
    return cached?.length ? { ...record, referenceImages: cached } : record;
  });
}

function normalizeSlotInputsToLength(slots: string[] | undefined, len: number): string[] {
  return Array.from({ length: len }, (_, i) => slots?.[i] ?? "");
}

function workspaceModeToPromptPreset(
  mode: { id: string; label: string },
  settings: typeof DEFAULT_IMAGE_SETTINGS,
  favoriteOverlay?: SitePromptPreset,
): ImagePromptPresetCard {
  const promptModelProviders = settings.promptModelProvidersByMode?.[mode.id] ?? ["gpt-image", "nano-banana"];
  return {
    id: mode.id,
    kind: "image",
    title: favoriteOverlay?.title || mode.label,
    promptTemplate: settings.prompts[mode.id] ?? favoriteOverlay?.promptTemplate ?? "",
    coverImageUrl: settings.coverImageUrlByMode?.[mode.id]?.trim() || favoriteOverlay?.coverImageUrl || "",
    refSlotHints: settings.refSlotHintsByMode?.[mode.id] ?? favoriteOverlay?.refSlotHints ?? [],
    tags: settings.promptTagsByMode?.[mode.id] ?? favoriteOverlay?.tags ?? [],
    description: settings.promptDescriptionsByMode?.[mode.id] ?? favoriteOverlay?.description,
    isFavorite: Boolean(favoriteOverlay?.isFavorite),
    promptModelProviders,
  };
}

/** 作曲器每一栏的 placeholder：优先用模版里对应 `{{提示文案}}` 括号内文字 */
function composerPlaceholder(modeId: string, occ: string[], slotIndex: number): string {
  const tok = occ[slotIndex];
  if (tok) {
    const hint = placeholderInnerHint(tok);
    if (hint) return hint;
    return `槽位 ${slotIndex + 1}（请在模版 {{}} 内写好提示文字）`;
  }
  if (modeId === "free") return "直接输入完整提示词（自由模式无固定模版）";
  if (modeId === "storyboard-continuation") {
    return "输入本分镜脚本（将接续参考图1的上一拍，写入连续性推演模版）";
  }
  if (modeId === "prop-asset") {
    return "输入道具资产设定（材质、结构、用途、磨损特征等），写入模版「## 5. 资产设定」";
  }
  return "当前模版无 {{}} 占位符时的补充说明（可在设置里为模版添加 {{提示文字}}）";
}

async function downloadGeneratedImage(url: string): Promise<void> {
  try {
    const proxyUrl = `/api/media/object?url=${encodeURIComponent(url)}`;
    const viaProxy = await fetch(proxyUrl).catch(() => null);
    const res = viaProxy?.ok ? viaProxy : await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const type = blob.type || "";
    const ext = type.includes("png")
      ? "png"
      : type.includes("jpeg") || type.includes("jpg")
        ? "jpg"
        : type.includes("webp")
          ? "webp"
          : "png";
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `generated-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("[image download]", error);
  }
}

export default function ImagePage() {
  const router = useRouter();
  const pathname = usePathname();
  const workspaceProject = useOptionalWorkspaceProject();
  const projectId = workspaceProject?.projectId;
  useEffect(() => {
    if (pathname === "/image") router.replace("/projects");
  }, [pathname, router]);

  const { imageWorkspace, workspaceReady } = useApiSettings();
  const [settings, setSettings] = useState(DEFAULT_IMAGE_SETTINGS);
  const [records, setRecords] = useState<ImageGalleryRecord[]>([]);
  const [promptPresets, setPromptPresets] = useState<SitePromptPreset[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string>("free");
  const [selectedModelId, setSelectedModelId] = useState<ImageModelId>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("4:3");
  const [imageSize, setImageSize] = useState<ImageSizeTier>("1K");
  const [slotInputs, setSlotInputs] = useState<string[]>([""]);
  const [refSlots, setRefSlots] = useState<RefSlot[]>(createEmptyRefSlots);
  const [resultUrl, setResultUrl] = useState("");
  const [resultNaturalAspectRatio, setResultNaturalAspectRatio] = useState("");
  const [resultNaturalAspectRatioValue, setResultNaturalAspectRatioValue] = useState(0);
  const [resultBoxSize, setResultBoxSize] = useState({ width: 0, height: 0 });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [refUploadMenu, setRefUploadMenu] = useState<RefUploadMenuState>(null);
  const [toolbarPickerMenu, setToolbarPickerMenu] = useState<ToolbarPickerMenuState>(null);
  const [assetPickerSlot, setAssetPickerSlot] = useState<number | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [error, setError] = useState("");
  const [pendingGenerations, setPendingGenerations] = useState<PendingImageGeneration[]>([]);
  const [creditQuote, setCreditQuote] = useState<CreditQuoteState>({ loading: true });
  const isGenerating = pendingGenerations.length > 0;
  const resultAspectRatio = resultNaturalAspectRatio || RESULT_ASPECT_RATIO_BY_VALUE[aspectRatio];
  const resultAspectRatioValue = resultNaturalAspectRatioValue || RESULT_ASPECT_RATIO_NUMBER_BY_VALUE[aspectRatio] || 0;
  const resultImageStackStyle = resultAspectRatio
    ? ({
        "--result-aspect-ratio": resultAspectRatio,
        ...(resultAspectRatioValue > 0 && resultBoxSize.width > 0 && resultBoxSize.height > 0
          ? (() => {
              const width = Math.min(resultBoxSize.width, resultBoxSize.height * resultAspectRatioValue);
              const height = width / resultAspectRatioValue;
              return {
                width: `${Math.round(width)}px`,
                height: `${Math.round(height)}px`,
              };
            })()
          : {}),
      } as CSSProperties)
    : undefined;
  const referenceLimit = imageReferenceLimitForContext(selectedModelId);
  const visibleRefSlots = useMemo(() => refSlots.slice(0, referenceLimit), [refSlots, referenceLimit]);
  const mentionCandidates = useMemo<AssetMentionCandidate[]>(() => {
    const candidates: AssetMentionCandidate[] = [];
    visibleRefSlots.forEach((slot, index) => {
      if (slot?.previewUrl) {
        candidates.push({
          id: String(index),
          label: `图${index + 1}`,
          type: "slot",
          role: "image_reference",
          groupLabel: "当前参考图",
          description: slot.file?.name || "当前素材",
          thumbnailUrl: slot.previewUrl,
        });
      }
    });
    return candidates;
  }, [visibleRefSlots]);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const resultClipRef = useRef<HTMLDivElement>(null);
  const refFileInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const refSlotsRef = useRef<RefSlot[]>(refSlots);
  const mountedRef = useRef(false);
  /** 用户已手动改过参考图槽时，勿用 localStorage 里的旧 runtime 覆盖 */
  const refSlotsUserEditedRef = useRef(false);
  const promptsRef = useRef(settings.prompts);
  refSlotsRef.current = refSlots;
  promptsRef.current = settings.prompts;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const s of refSlotsRef.current) revokeRefPreview(s);
    };
  }, []);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    function openPromptPresetLibrary() {
      setPresetLibraryOpen(true);
    }
    window.addEventListener(OPEN_IMAGE_PROMPT_PRESETS_EVENT, openPromptPresetLibrary);
    return () => window.removeEventListener(OPEN_IMAGE_PROMPT_PRESETS_EVENT, openPromptPresetLibrary);
  }, []);

  useEffect(() => {
    setResultNaturalAspectRatio("");
    setResultNaturalAspectRatioValue(0);
  }, [resultUrl]);

  useLayoutEffect(() => {
    const el = resultClipRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setResultBoxSize({
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!previewOpen && !promptPreviewOpen && !presetLibraryOpen && !toolbarPickerMenu) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
      if (e.key === "Escape") setPromptPreviewOpen(false);
      if (e.key === "Escape") setPresetLibraryOpen(false);
      if (e.key === "Escape") setToolbarPickerMenu(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen, promptPreviewOpen, presetLibraryOpen, toolbarPickerMenu]);

  useEffect(() => {
    if (!promptPreviewOpen) setPromptCopied(false);
  }, [promptPreviewOpen]);

  useEffect(() => {
    if (!previewOpen && !presetLibraryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [previewOpen, presetLibraryOpen]);

  useEffect(() => {
    if (workspaceReady) setSettings(imageWorkspace);
  }, [imageWorkspace, workspaceReady]);

  useEffect(() => {
    async function refreshGallery() {
      try {
        const records = await fetchGalleryRecords(projectId);
        setRecords(mergeCachedImageUrls(mergeCachedReferenceImages(records)));
      } catch (e) {
        console.warn("[image] gallery load failed", e);
      }
    }
    if (workspaceReady) void refreshGallery();

    function onVisibility() {
      if (document.visibilityState === "visible" && workspaceReady) {
        void refreshGallery();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [workspaceReady, projectId]);

  const loadImagePromptPresets = useCallback(() => {
    void fetchSitePromptPresets("image")
      .then((presets) => {
        if (process.env.NODE_ENV !== "production") {
          console.log("[image] prompt presets fetched", presets.map((preset) => ({
            id: preset.id,
            title: preset.title,
            isFavorite: preset.isFavorite,
          })));
        }
        setPromptPresets(presets);
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "无法加载提示词预设";
        setError(message);
      });
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    loadImagePromptPresets();
  }, [loadImagePromptPresets, workspaceReady]);

  const allModes = useMemo(
    () => [...IMAGE_MODES, ...(settings.customModes ?? [])].reverse(),
    [settings.customModes],
  );
  const promptPresetById = useMemo(() => new Map(promptPresets.map((preset) => [preset.id, preset])), [promptPresets]);
  const displayedPromptPresets = useMemo(
    () => {
      const workspacePresets = allModes
        .filter((mode) => !IMAGE_MODES.some((base) => base.id === mode.id))
        .map((mode) => workspaceModeToPromptPreset(mode, settings, promptPresetById.get(mode.id)));
      const workspacePresetIds = new Set(workspacePresets.map((preset) => preset.id));
      const libraryOnlyFavorites = promptPresets.filter(
        (preset) => preset.kind === "image" && preset.isFavorite && !workspacePresetIds.has(preset.id),
      );
      return [...workspacePresets, ...libraryOnlyFavorites];
    },
    [allModes, promptPresetById, promptPresets, settings],
  );
  const displayedPromptPresetById = useMemo(
    () => new Map(displayedPromptPresets.map((preset) => [preset.id, preset])),
    [displayedPromptPresets],
  );
  const modes = useMemo(
    () => displayedPromptPresets.filter((preset) => preset.isFavorite).map((preset) => ({ id: preset.id, label: preset.title })),
    [displayedPromptPresets],
  );
  const isFreeMode = selectedModeId === "free";

  const selectedModel = settings.models[selectedModelId];
  const promptTemplate = settings.prompts[selectedModeId] ?? displayedPromptPresetById.get(selectedModeId)?.promptTemplate ?? "";
  const placeholderOccurrences = useMemo(
    () => extractPromptPlaceholderOccurrences(promptTemplate),
    [promptTemplate],
  );
  const composerSlotCount = composerSlotCountForTemplate(promptTemplate, selectedModeId);

  useEffect(() => {
    if (selectedModel.provider !== "gpt-image" && toolbarPickerMenu?.kind === "quality") {
      setToolbarPickerMenu(null);
    }
  }, [selectedModel.provider, toolbarPickerMenu]);

  useEffect(() => {
    setSlotInputs((prev) => normalizeSlotInputsToLength(prev, composerSlotCount));
  }, [selectedModeId, promptTemplate, composerSlotCount]);

  useEffect(() => {
    if (selectedModeId === "free") return;
    if (allModes.some((m) => m.id === selectedModeId)) return;
    if (displayedPromptPresetById.has(selectedModeId)) return;
    setSelectedModeId("free");
  }, [allModes, displayedPromptPresetById, selectedModeId]);

  const finalPrompt = useMemo(
    () => buildImagePromptFromSlots(promptTemplate, slotInputs),
    [promptTemplate, slotInputs],
  );
  const refSlotHintsLines = settings.refSlotHintsByMode[selectedModeId] ?? displayedPromptPresetById.get(selectedModeId)?.refSlotHints ?? [];
  const modelReady = Boolean(
    selectedModel.endpointUrl.trim() &&
      selectedModel.modelName.trim(),
  );
  const filledRefFileCount = useMemo(() => visibleRefSlots.filter(Boolean).length, [visibleRefSlots]);
  const availableAspectRatios = useMemo(
    () => imageAspectRatiosForContext(selectedModelId, filledRefFileCount),
    [filledRefFileCount, selectedModelId],
  );
  const supportsAspectRatio = imageSupportsAspectRatioForContext(selectedModelId, filledRefFileCount);
  const promptMaxLength = imagePromptMaxLengthForContext(selectedModelId, filledRefFileCount);
  const promptCharCount = finalPrompt.length;
  const promptOverLimit = typeof promptMaxLength === "number" && promptCharCount > promptMaxLength;
  const creditBlocked = creditQuote.loading || Boolean(creditQuote.error) || creditQuote.enough === false;
  const generateDisabled = promptOverLimit || creditBlocked;
  const generateTitle = promptOverLimit
    ? `提示词超过 ${promptMaxLength} 字符上限`
    : creditQuote.error
      ? creditQuote.error
      : creditQuote.enough === false
        ? "积分余额不足"
        : "生成";
  const sidebarHistoryRecords = useMemo<ImageSidebarHistoryItem[]>(() => {
    const success = records.filter((r) => r.status === "success" && Boolean(r.imageUrl)).slice(0, 24);
    return [
      ...success.slice().reverse().map((record) => ({ kind: "record" as const, record })),
      ...pendingGenerations.map((pending) => ({ kind: "pending" as const, pending })),
    ];
  }, [pendingGenerations, records]);

  useEffect(() => {
    setAspectRatio((current) => normalizeImageAspectRatioForContext(current, selectedModelId, filledRefFileCount));
  }, [filledRefFileCount, selectedModelId]);

  useEffect(() => {
    if (supportsAspectRatio) return;
    setToolbarPickerMenu((current) => current?.kind === "ratio" ? null : current);
  }, [supportsAspectRatio]);

  useEffect(() => {
    setRefSlots((prev) => {
      if (prev.every((slot, index) => index < referenceLimit || !slot)) return prev;
      return prev.map((slot, index) => {
        if (index < referenceLimit) return slot;
        if (slot) revokeRefPreview(slot);
        return null;
      });
    });
  }, [referenceLimit]);

  useEffect(() => {
    if (!workspaceReady) return;
    const controller = new AbortController();
    setCreditQuote((current) => ({ ...current, loading: true, error: undefined }));
    void fetch("/api/credits/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "image",
        modelId: selectedModelId,
        imageSize,
        gptImageQuality: selectedModel.provider === "gpt-image" ? settings.gptImageQuality : undefined,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          quote?: { credits?: number };
          balance?: { availableCredits?: number; reservedCredits?: number; enough?: boolean };
        };
        if (!response.ok) throw new Error(payload.error || "无法获取积分价格");
        setCreditQuote({
          loading: false,
          credits: Number(payload.quote?.credits ?? 0),
          availableCredits: Number(payload.balance?.availableCredits ?? 0),
          reservedCredits: Number(payload.balance?.reservedCredits ?? 0),
          enough: Boolean(payload.balance?.enough),
        });
      })
      .catch((quoteError) => {
        if (controller.signal.aborted) return;
        setCreditQuote({
          loading: false,
          error: quoteError instanceof Error ? quoteError.message : "无法获取积分价格",
        });
      });
    return () => controller.abort();
  }, [imageSize, selectedModel.provider, selectedModelId, settings.gptImageQuality, workspaceReady]);

  function persistGptImageQuality(q: GptImageQuality) {
    setSettings((prev) => {
      const next = { ...prev, gptImageQuality: q };
      return next;
    });
  }

  async function copyPromptToClipboard() {
    const text = finalPrompt || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1500);
  }

  function selectPromptPreset(preset: SitePromptPreset) {
    if (preset.kind !== "image") return;
    setError("");
    setSelectedModeId(preset.id);
  }

  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el || sidebarHistoryRecords.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [sidebarHistoryRecords]);

  function markRefSlotsUserEdited() {
    refSlotsUserEditedRef.current = true;
  }

  const addRefImages = useCallback((files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    refSlotsUserEditedRef.current = true;
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      let imageIndex = 0;
      for (let slotIndex = 0; slotIndex < next.length && imageIndex < images.length; slotIndex += 1) {
        if (!next[slotIndex]) {
          next[slotIndex] = refSlotFromFile(images[imageIndex]);
          imageIndex += 1;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file != null);

      if (files.length === 0) return;
      e.preventDefault();
      void addRefImages(files);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addRefImages]);

  function fillRefImagesFromIndex(index: number, files: FileList | File[] | null | undefined) {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    markRefSlotsUserEdited();
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      images.forEach((file, offset) => {
        const slotIndex = index + offset;
        if (slotIndex < next.length) {
          revokeRefPreview(next[slotIndex]);
          next[slotIndex] = refSlotFromFile(file);
        }
      });
      return next;
    });
  }

  async function fillRefImageFromProjectAsset(index: number, asset: ProjectAsset) {
    setError("");
    try {
      const slot = await refSlotFromProjectAsset(asset);
      markRefSlotsUserEdited();
      setRefSlots((prev) => {
        const next = normalizeRefSlots(prev);
        revokeRefPreview(next[index]);
        next[index] = slot;
        return next;
      });
      setAssetPickerSlot(null);
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : "项目素材载入失败");
    }
  }

  function clearRefImage(index: number) {
    markRefSlotsUserEdited();
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      revokeRefPreview(next[index]);
      next[index] = null;
      return next;
    });
  }

  const restoreReferenceImages = useCallback(async (referenceImages: ImageGalleryReferenceImage[] | undefined) => {
    if (!referenceImages) return;
    const restored = await Promise.all(
      referenceImages.map(async (image) => {
        if (image.slotIndex < 0 || image.slotIndex >= IMAGE_REF_SLOT_COUNT) return null;
        const file = await referenceImageToFile(image).catch(() => null);
        return file ? { slotIndex: image.slotIndex, ...file } : null;
      }),
    );
    setRefSlots((prev) => {
      for (const slot of prev) revokeRefPreview(slot);
      const next = createEmptyRefSlots();
      for (const image of restored) {
        if (!image) continue;
        next[image.slotIndex] = {
          file: image.file,
          previewUrl: image.previewUrl,
        };
      }
      return next;
    });
  }, []);

  function restoreReferenceImagesFromRecord(record: ImageGalleryRecord) {
    refSlotsUserEditedRef.current = false;
    void restoreReferenceImages(record.referenceImages);
  }

  const applyGenerationRuntimeState = useCallback(
    (state: ImageGenerationRuntimeState | null, options?: { restoreReferenceImages?: boolean }) => {
      if (!state) return;
      const shouldRestoreRefs = options?.restoreReferenceImages === true && !refSlotsUserEditedRef.current;

      setSelectedModelId(state.modelId);
      setSelectedModeId(state.modeId);
      setAspectRatio(state.aspectRatio);
      setImageSize(state.imageSize);
      const tpl = promptsRef.current[state.modeId] ?? "";
      const n = composerSlotCountForTemplate(tpl, state.modeId);
      setSlotInputs(normalizeSlotInputsToLength(state.slotInputs, n));
      if (shouldRestoreRefs) {
        void restoreReferenceImages(state.referenceImages);
      }
      if (state.status === "running") {
        setPendingGenerations((prev) => {
          if (prev.some((item) => item.id === state.taskId)) return prev;
          return [
            ...prev,
            {
              id: state.taskId,
              createdAt: state.startedAt,
              modeId: state.modeId,
              modeName: allModes.find((mode) => mode.id === state.modeId)?.label ?? displayedPromptPresetById.get(state.modeId)?.title ?? state.modeId,
              modelId: state.modelId,
              modelName: settings.models[state.modelId]?.modelName ?? state.modelId,
              finalPrompt: state.finalPrompt,
              aspectRatio: state.aspectRatio,
              imageSize: state.imageSize,
              gptImageQuality: state.gptImageQuality,
              gptImageBackground: state.gptImageBackground,
              previewUrl: state.referenceImages[0]?.dataUrl,
            },
          ];
        });
      } else {
        setPendingGenerations((prev) => prev.filter((item) => item.id !== state.taskId));
      }
      if (state.status === "success") {
        setResultUrl(state.imageUrl || "");
        setError("");
      } else if (state.status === "error") {
        setError(state.error || "生图失败");
      }
      if (state.gptImageQuality) {
        setSettings((prev) => ({ ...prev, gptImageQuality: state.gptImageQuality! }));
      }
      if (state.gptImageBackground) {
        setSettings((prev) => ({ ...prev, gptImageBackground: state.gptImageBackground! }));
      }
    },
    [allModes, displayedPromptPresetById, restoreReferenceImages, settings.models],
  );

  useEffect(() => {
    if (!workspaceReady) return;

    const initial = readGenerationRuntimeState();
    if (initial?.status === "running") {
      refSlotsUserEditedRef.current = false;
      applyGenerationRuntimeState(initial, { restoreReferenceImages: true });
    }

    function onRuntimeChange(e: Event) {
      const detail = e instanceof CustomEvent ? (e.detail as ImageGenerationRuntimeState | undefined) : undefined;
      const next = detail ?? readGenerationRuntimeState();
      if (!next) return;
      if (next.status === "running") {
        refSlotsUserEditedRef.current = false;
      }
      applyGenerationRuntimeState(next, { restoreReferenceImages: next.status === "running" });
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const next = readGenerationRuntimeState();
      if (next?.status !== "running") return;
      refSlotsUserEditedRef.current = false;
      applyGenerationRuntimeState(next, { restoreReferenceImages: true });
    }

    window.addEventListener(IMAGE_GENERATION_RUNTIME_EVENT, onRuntimeChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(IMAGE_GENERATION_RUNTIME_EVENT, onRuntimeChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceReady, applyGenerationRuntimeState]);

  async function writeRecord(
    status: "success" | "error",
    imageUrl?: string,
    message?: string,
    promptSnapshot?: string,
    referenceImages?: ImageGalleryReferenceImage[],
    thumbnailUrl?: string,
  ) {
    const resolvedPrompt = promptSnapshot ?? finalPrompt;
    const record: ImageGalleryRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modeId: selectedModeId,
      modeName: allModes.find((m) => m.id === selectedModeId)?.label ?? displayedPromptPresetById.get(selectedModeId)?.title ?? selectedModeId,
      modelId: selectedModelId,
      modelName: selectedModel.modelName,
      finalPrompt: resolvedPrompt,
      userInput: slotInputs[0] ?? "",
      userInputSecondary: slotInputs.length >= 2 ? slotInputs[1] : undefined,
      userSlotInputs: [...slotInputs],
      aspectRatio,
      imageSize,
      gptImageQuality: selectedModel.provider === "gpt-image" ? settings.gptImageQuality : undefined,
      imageUrl,
      thumbnailUrl,
      refImageCount: referenceImages?.length ?? filledRefFileCount,
      referenceImages,
      status,
      error: message,
    };
    if (status !== "success" || !imageUrl?.trim()) return record;
    saveReferenceImagesForRecord(record.id, referenceImages ?? []);
    if (imageUrl?.trim()) saveImageResultForRecord(record.id, imageUrl);
    try {
      const next = await prependGalleryRecordApi(record, projectId);
      if (mountedRef.current) setRecords(mergeCachedImageUrls(mergeCachedReferenceImages(next)));
    } catch (e) {
      console.warn("[image] gallery save failed", e);
      if (mountedRef.current) setRecords((prev) => [record, ...prev].slice(0, 24));
    }
    return record;
  }

  async function handleGenerate() {
    setError("");

    if (selectedModeId === "free" && !(slotInputs[0] ?? "").trim()) {
      setError("自由模式请填写完整提示词（无内置模版）。");
      return;
    }
    if (promptOverLimit) {
      setError(`提示词超过 ${promptMaxLength} 字符上限，请缩短后再生成。`);
      return;
    }

    /** 提交前强制与云端对齐 */
    const liveSnapshot = await fetchWorkspaceSnapshot();
    const liveSettings = liveSnapshot.imageWorkspace;
    setSettings(liveSettings);
    const liveModel = liveSettings.models[selectedModelId];
    const liveTemplate = liveSettings.prompts[selectedModeId] ?? displayedPromptPresetById.get(selectedModeId)?.promptTemplate ?? "";
    const promptForRequest = buildImagePromptFromSlots(liveTemplate, slotInputs);
    const mentionResolution = resolveAssetMentions(promptForRequest, mentionCandidates);
    if (mentionResolution.missingMentions.length > 0) {
      setError(`素材引用失效：${mentionResolution.missingMentions.map((item) => `@${item.label}`).join("、")}。请重新选择或删除这些标签。`);
      return;
    }
    const cleanedPrompt = mentionResolution.prompt;

    const liveReady = Boolean(
      liveModel.endpointUrl &&
        liveModel.modelName,
    );

    if (!liveReady) {
      setError(
        `网站内部图片 API 暂未配置完整（${liveModel.label || liveModel.id}），请联系管理员。`,
      );
      return;
    }

    let referenceImages: ImageGalleryReferenceImage[] = [];
    let runtimeState: ImageGenerationRuntimeState | null = null;
    let pendingId = "";
    try {
      const refSlotsSnapshot = normalizeRefSlots(refSlots).slice(0, referenceLimit);
      const recordRefSlotsSnapshot = refSlotsSnapshot;
      const mentionedSlots = new Set(
        mentionResolution.mentions
          .filter((mention) => mention.candidate?.type === "slot")
          .map((mention) => mention.candidate!.id),
      );
      const requestSlots = mentionResolution.hasMentions
        ? refSlotsSnapshot.map((slot, index) => (mentionedSlots.has(String(index)) ? slot : null))
        : refSlotsSnapshot;
      const modelRefSlotIndexes = requestSlots
        .map((slot, index) => (slot?.file ? index : null))
        .filter((index): index is number => index !== null);
      const fileRefs = await snapshotReferenceImages(requestSlots);
      referenceImages = fileRefs;
      refSlotsUserEditedRef.current = false;
      pendingId = crypto.randomUUID();
      runtimeState = {
        taskId: pendingId,
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modeId: selectedModeId,
        modelId: selectedModelId,
        aspectRatio,
        imageSize,
        gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
        slotInputs: [...slotInputs],
        finalPrompt: cleanedPrompt,
        referenceImages,
      };
      setPendingGenerations((prev) => [
        ...prev,
        {
          id: pendingId,
          createdAt: runtimeState!.startedAt,
          modeId: selectedModeId,
          modeName: allModes.find((m) => m.id === selectedModeId)?.label ?? displayedPromptPresetById.get(selectedModeId)?.title ?? selectedModeId,
          modelId: selectedModelId,
          modelName: liveModel.modelName,
          finalPrompt: cleanedPrompt,
          aspectRatio,
          imageSize,
          gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
          previewUrl: referenceImages[0]?.dataUrl,
        },
      ]);
      writeGenerationRuntimeState(runtimeState);
      const fd = new FormData();
      fd.append(
        "meta",
        JSON.stringify({
          requestId: runtimeState.taskId,
          prompt: cleanedPrompt,
          modeId: selectedModeId,
          modeName: allModes.find((m) => m.id === selectedModeId)?.label ?? displayedPromptPresetById.get(selectedModeId)?.title ?? selectedModeId,
          slotInputs: [...slotInputs],
          modelId: selectedModelId,
          aspectRatio,
          imageSize,
          gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
          refImages: [],
          refSlotIndexes: recordRefSlotsSnapshot
            .map((slot, index) => (slot?.file ? index : null))
            .filter((index): index is number => index !== null),
          modelRefSlotIndexes,
          projectId,
        }),
      );
      for (const slot of recordRefSlotsSnapshot) {
        if (slot?.file) fd.append("ref", slot.file, slot.file.name || "reference.png");
      }

      const res = await fetch("/api/image/generate", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as ImageGenerateFailurePayload & {
        imageUrl?: string;
        thumbnailUrl?: string;
        galleryRecord?: ImageGalleryRecord;
        galleryRecords?: ImageGalleryRecord[];
      };
      if (!res.ok) throw new Error(formatImageGenerateFailure(data));
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
      const thumbnailUrl = typeof data.thumbnailUrl === "string" ? data.thumbnailUrl.trim() : "";
      if (!imageUrl) throw new Error(formatImageGenerateFailure(data, "服务器未返回图片地址"));
      if (runtimeState) {
        writeGenerationRuntimeState({
          ...runtimeState,
          status: "success",
          updatedAt: new Date().toISOString(),
          imageUrl,
          error: undefined,
        });
      }
      if (mountedRef.current) setResultUrl(imageUrl);
      if (Array.isArray(data.galleryRecords)) {
        const stableReferenceImages = data.galleryRecord?.referenceImages?.length
          ? data.galleryRecord.referenceImages
          : referenceImages;
        if (data.galleryRecord?.id) {
          saveReferenceImagesForRecord(data.galleryRecord.id, stableReferenceImages);
          saveImageResultForRecord(data.galleryRecord.id, imageUrl);
        }
        if (mountedRef.current) setRecords(mergeCachedImageUrls(mergeCachedReferenceImages(data.galleryRecords)));
      } else {
        try {
          void writeRecord("success", imageUrl, undefined, cleanedPrompt, referenceImages, thumbnailUrl || undefined);
        } catch (persistErr) {
          console.warn("本地画廊写入失败（多与浏览器存储配额有关）:", persistErr);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "生图失败";
      if (runtimeState) {
        writeGenerationRuntimeState({
          ...runtimeState,
          status: "error",
          updatedAt: new Date().toISOString(),
          error: message,
        });
      }
      if (mountedRef.current) setError(message);
      try {
        void writeRecord("error", undefined, message, cleanedPrompt, referenceImages);
      } catch (persistErr) {
        console.warn("写入失败记录到本地画廊时出错:", persistErr);
      }
    } finally {
      if (pendingId && mountedRef.current) {
        setPendingGenerations((prev) => prev.filter((item) => item.id !== pendingId));
      }
    }
  }

  const modeRailVisibleCount = Math.min(Math.max(modes.length, 1), 5);
  const historyRailVisibleCount = Math.min(Math.max(sidebarHistoryRecords.length, 1), 5);
  const modeRailStyle = { "--rail-visible-count": modeRailVisibleCount } as CSSProperties;
  const historyRailStyle = { "--rail-visible-count": historyRailVisibleCount } as CSSProperties;
  const toolbarPickerOptions = toolbarPickerMenu
    ? toolbarPickerMenu.kind === "model"
      ? IMAGE_MODEL_ORDER.map((id) => ({
          id,
          label: settings.models[id].label,
          active: selectedModelId === id,
          onSelect: () => setSelectedModelId(id),
        }))
      : toolbarPickerMenu.kind === "ratio"
        ? availableAspectRatios.map((ratio) => ({
            id: ratio,
            label: ratio === "auto" ? "自适应" : ratio,
            previewAspectRatio: ratioPreviewAspect(ratio),
            previewStyle: ratioPreviewStyle(ratio),
            active: aspectRatio === ratio,
            onSelect: () => setAspectRatio(ratio),
          }))
        : toolbarPickerMenu.kind === "size"
          ? IMAGE_SIZES.map((size) => ({
              id: size,
              label: size,
              active: imageSize === size,
              onSelect: () => setImageSize(size),
            }))
          : toolbarPickerMenu.kind === "quality"
          ? GPT_IMAGE_QUALITY_ORDER.map((quality) => ({
              id: quality,
              label: `细节程度：${GPT_IMAGE_QUALITY_LABELS[quality]}`,
              active: settings.gptImageQuality === quality,
              onSelect: () => persistGptImageQuality(quality),
            }))
          : []
    : [];

  return (
    <main className={[shellStyles.page, projectId ? styles.projectWorkspacePage : ""].filter(Boolean).join(" ")}>
      {!projectId ? <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={shellStyles.navLink}>
            返回首页
          </Link>
          <button
            type="button"
            className={shellStyles.navLink}
            onClick={() => setPresetLibraryOpen(true)}
          >
            提示词预设
          </button>
        </div>
        <div className={shellStyles.topnav}>
          <TopbarAccountActions />
        </div>
      </header> : null}

      <section className={styles.stage}>
        <aside className={[styles.modePanel, styles.modePanelImage].join(" ")} style={modeRailStyle}>
          <div className={styles.modeColumn}>
            <div className={styles.modeRail}>
              <div className={styles.modeRailFrame}>
                <div className={styles.railLabel}>收藏的预设</div>
                <div
                  className={[
                    styles.modeScrollWrap,
                    modes.length > 7 ? styles.modeScrollWrapFaded : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.modeScroll}>
                    <div className={styles.modeList}>
                      {modes.length === 0 ? (
                        <div className={styles.emptyRail}>暂无预设</div>
                      ) : (
                        modes.map((mode) => {
                          const active = selectedModeId === mode.id;
                          const coverUrl =
                            settings.coverImageUrlByMode?.[mode.id]?.trim() || displayedPromptPresetById.get(mode.id)?.coverImageUrl || "";
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => setSelectedModeId(mode.id)}
                              className={[styles.modeButton, active ? styles.modeButtonActive : ""].filter(Boolean).join(" ")}
                              aria-label={mode.label}
                            >
                              {coverUrl ? (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={coverUrl} alt="" className={styles.modeCoverImage} />
                                  <span className={[styles.modeMeta, active ? styles.modeMetaActive : ""].filter(Boolean).join(" ")}>
                                    {mode.label}
                                  </span>
                                </>
                              ) : (
                                <span className={styles.modeCoverFallback}>{mode.label}</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className={styles.canvas}>
          <div className={styles.canvasInner}>
            <div className={styles.resultSafeFrame}>
              <div className={styles.resultClip} ref={resultClipRef}>
                {resultUrl ? (
                  <div className={styles.resultMedia}>
                    <div
                      className={styles.resultImageStack}
                      style={resultImageStackStyle}
                    >
                      <button
                        type="button"
                        className={styles.resultPreviewHit}
                        onClick={() => setPreviewOpen(true)}
                        aria-label="全屏预览生成图"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resultUrl}
                          alt="生成结果"
                          className={styles.resultImage}
                          onLoad={(event) => {
                            const { naturalWidth, naturalHeight } = event.currentTarget;
                            if (naturalWidth > 0 && naturalHeight > 0) {
                              setResultNaturalAspectRatio(`${naturalWidth} / ${naturalHeight}`);
                              setResultNaturalAspectRatioValue(naturalWidth / naturalHeight);
                            }
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        className={styles.resultDownloadBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadGeneratedImage(resultUrl);
                        }}
                        aria-label="下载生成图"
                      >
                        下载
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {isGenerating ? (
              <div className={styles.loadingOverlay} role="status" aria-live="polite">
                <span className={styles.bigSpinner} aria-hidden />
                <span className={styles.statusLabel}>
                  {pendingGenerations.length > 1 ? `生成中 · ${pendingGenerations.length}` : "生成中"}
                </span>
              </div>
            ) : null}
            {!isGenerating && !modelReady ? (
              <div className={styles.centerStatus} role="status" aria-live="polite">
                当前模型未配置
              </div>
            ) : null}
          </div>
        </div>

        <aside className={styles.historyPanel} style={historyRailStyle}>
          <div className={styles.historyColumn}>
            <div className={styles.historyRail}>
              <div className={styles.historyRailFrame}>
                <div className={styles.railLabel}>生成记录</div>
                <div
                  className={[
                    styles.historyScrollWrap,
                    sidebarHistoryRecords.length > 7 ? styles.historyScrollWrapFaded : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div ref={historyScrollRef} className={styles.historyScroll}>
                    <div className={styles.historyList}>
                      {sidebarHistoryRecords.length === 0 ? (
                        <div className={styles.emptyHistory}>暂无记录</div>
                      ) : (
                        sidebarHistoryRecords.map((item) => item.kind === "pending" ? (
                          <div key={item.pending.id} className={[styles.historyItem, styles.historyItemPending].join(" ")} role="status" aria-live="polite">
                            {item.pending.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.pending.previewUrl} alt={item.pending.modeName} />
                            ) : (
                              <span className={styles.historyPendingBlank} aria-hidden />
                            )}
                            <span className={styles.historyPendingSpinner} aria-hidden />
                            <span className={styles.historyMeta}>
                              {item.pending.aspectRatio} · {item.pending.imageSize}
                            </span>
                          </div>
                        ) : (
                          <button
                            key={item.record.id}
                            type="button"
                            onClick={() => {
                              const record = item.record;
                              setError("");
                              setResultUrl(record.imageUrl || "");
                              setSelectedModelId(record.modelId);
                              setSelectedModeId(record.modeId);
                              setAspectRatio(record.aspectRatio);
                              setImageSize(record.imageSize);
                              const tpl = settings.prompts[record.modeId] ?? "";
                              const n = composerSlotCountForTemplate(tpl, record.modeId);
                              let slots: string[];
                              if (record.userSlotInputs && record.userSlotInputs.length > 0) {
                                slots = normalizeSlotInputsToLength(record.userSlotInputs, n);
                              } else {
                                slots = Array.from({ length: n }, () => "");
                                slots[0] = record.userInput;
                                if (n >= 2) slots[1] = record.userInputSecondary ?? "";
                              }
                              setSlotInputs(slots);
                              if (record.gptImageQuality) {
                                setSettings((prev) => {
                                  const next = { ...prev, gptImageQuality: record.gptImageQuality! };
                                  return next;
                                });
                              }
                              restoreReferenceImagesFromRecord(record);
                            }}
                            className={styles.historyItem}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.record.thumbnailUrl || item.record.imageUrl || ""} alt={item.record.modeName} />
                            <span className={styles.historyMeta}>
                              {item.record.aspectRatio} · {item.record.imageSize}
                              {item.record.gptImageQuality
                                ? ` · 细节程度：${GPT_IMAGE_QUALITY_LABELS[item.record.gptImageQuality]}`
                                : ""}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className={styles.composerWrap}>
          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.composerDock}>
            <div className={styles.referenceStrip}>
              {visibleRefSlots.map((slot, index) => (
                <div
                  key={index}
                  className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    fillRefImagesFromIndex(index, e.dataTransfer.files);
                  }}
                >
                  <input
                    ref={(node) => {
                      refFileInputRefs.current[index] = node;
                    }}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      fillRefImagesFromIndex(index, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={styles.refSlotButton}
                    aria-label={`图${index + 1}${refSlotHintsLines[index]?.trim() ? ` ${refSlotHintsLines[index].trim()}` : ""}，选择参考图来源`}
                    onClick={(event) => {
                      const anchor = menuAnchorFromElement(event.currentTarget);
                      setRefUploadMenu((current) => current?.index === index ? null : { index, anchor });
                    }}
                  >
                    {slot ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slot.previewUrl} alt={`参考图 ${index + 1}`} />
                      </>
                    ) : (
                      <span className={styles.refEmptyContent}>
                        <span className={styles.refSlotIndex}>图{index + 1}</span>
                        {refSlotHintsLines[index]?.trim() ? (
                          <span className={styles.refSlotHintText}>{refSlotHintsLines[index].trim()}</span>
                        ) : null}
                      </span>
                    )}
                  </button>
                  {slot ? (
                    <button
                      type="button"
                      onClick={() => clearRefImage(index)}
                      className={styles.deleteRef}
                      aria-label="移除参考图"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <WorkspaceModeDock />
          </div>

          <div className={styles.composer}>
            <div
              className={styles.promptSlotGrid}
              style={{ gridTemplateColumns: `repeat(${slotInputs.length}, minmax(0, 1fr))` }}
              role="group"
              aria-label="作图输入"
            >
              {slotInputs.map((val, i) => (
                <div key={i} className={styles.promptSlotPane}>
                  <AssetMentionEditor
                    value={val}
                    onValueChange={(newVal) =>
                      setSlotInputs((prev) => {
                        const next = [...prev];
                        next[i] = newVal;
                        return next;
                      })
                    }
                    candidates={mentionCandidates}
                    placeholder={composerPlaceholder(selectedModeId, placeholderOccurrences, i)}
                    placeholderClassName={styles.promptPlaceholder}
                    aria-label={`作图输入槽位 ${i + 1}`}
                    className={styles.promptInput}
                  />
                </div>
              ))}
              {typeof promptMaxLength === "number" ? (
                <div className={[styles.promptLimitCounter, promptOverLimit ? styles.promptLimitCounterOver : ""].filter(Boolean).join(" ")}>
                  {promptCharCount}/{promptMaxLength}
                </div>
              ) : null}
            </div>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={[styles.composerPickerButton, styles.composerSelectModel].join(" ")}
                aria-haspopup="menu"
                aria-expanded={toolbarPickerMenu?.kind === "model"}
                onClick={(event) => {
                  const anchor = menuAnchorFromElement(event.currentTarget);
                  setToolbarPickerMenu((current) => current?.kind === "model" ? null : { kind: "model", anchor });
                }}
              >
                <span className={styles.composerPickerLabel}>{selectedModel.label}</span>
              </button>

              {supportsAspectRatio ? (
                <button
                  type="button"
                  className={[styles.composerPickerButton, styles.composerSelectRatio].join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={toolbarPickerMenu?.kind === "ratio"}
                  onClick={(event) => {
                    const anchor = menuAnchorFromElement(event.currentTarget);
                    setToolbarPickerMenu((current) => current?.kind === "ratio" ? null : { kind: "ratio", anchor });
                  }}
                >
                  <span className={styles.composerPickerLabel}>{aspectRatio === "auto" ? "自适应" : aspectRatio}</span>
                </button>
              ) : null}

              <button
                type="button"
                className={[styles.composerPickerButton, styles.composerSelectSize].join(" ")}
                aria-haspopup="menu"
                aria-expanded={toolbarPickerMenu?.kind === "size"}
                onClick={(event) => {
                  const anchor = menuAnchorFromElement(event.currentTarget);
                  setToolbarPickerMenu((current) => current?.kind === "size" ? null : { kind: "size", anchor });
                }}
              >
                <span className={styles.composerPickerLabel}>{imageSize}</span>
              </button>

              {selectedModel.provider === "gpt-image" ? (
                <>
                  <button
                    type="button"
                    className={[styles.composerPickerButton, styles.composerSelectQuality].join(" ")}
                    aria-haspopup="menu"
                    aria-expanded={toolbarPickerMenu?.kind === "quality"}
                    onClick={(event) => {
                      const anchor = menuAnchorFromElement(event.currentTarget);
                      setToolbarPickerMenu((current) => current?.kind === "quality" ? null : { kind: "quality", anchor });
                    }}
                  >
                    <span className={styles.composerPickerLabel}>
                      {`细节程度：${GPT_IMAGE_QUALITY_LABELS[settings.gptImageQuality]}`}
                    </span>
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className={[styles.freeModeToggle, !isFreeMode ? styles.freeModeToggleActive : ""].filter(Boolean).join(" ")}
                aria-pressed={!isFreeMode}
                title="启用预设提示词"
                onClick={() => {
                  setError("");
                  setSelectedModeId(isFreeMode ? modes[0]?.id ?? FREE_MODE.id : FREE_MODE.id);
                }}
              >
                <span className={styles.freeSwitchTrack} aria-hidden>
                  <span className={styles.freeSwitchThumb} />
                </span>
                <span>预设</span>
              </button>
              <button type="button" onClick={handleGenerate} disabled={generateDisabled} className={styles.generate} title={generateTitle}>
                <span className={styles.generateCost} data-state={creditQuote.error ? "error" : creditQuote.enough === false ? "insufficient" : "ready"}>
                  <span>{creditQuote.loading ? "计价中" : creditQuote.error ? "未计价" : creditQuote.credits ?? 0}</span>
                  <svg className={styles.generateCostIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M7.2 8.1c2.1-2.4 6.1-3.4 8.8-1.7 2.8 1.7 3.9 5.9 2.2 8.9-1.6 2.8-5.6 4.4-8.8 3.2-3.4-1.2-4.9-4.7-4-7.4.3-1.1.9-2.1 1.8-3Z" />
                    <path d="M14.7 6.2c.2-1.1.8-2 1.8-2.7" />
                    <path d="M16.4 5.1c1-.2 1.9.1 2.6.9" />
                    <path d="M9 11.1h.01" />
                    <path d="M13.2 9.7h.01" />
                    <path d="M14.8 14.2h.01" />
                    <path d="M10.4 15.3h.01" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </section>
      </section>
      {portalMounted && previewOpen && resultUrl
        ? createPortal(
            <div className={styles.imagePreviewRoot} role="dialog" aria-modal="true" aria-label="生成图预览">
              <button
                type="button"
                className={styles.imagePreviewBackdrop}
                onClick={() => setPreviewOpen(false)}
                aria-label="关闭预览"
              />
              <div className={styles.imagePreviewFrame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultUrl} alt="" className={styles.imagePreviewImg} />
              </div>
              <button
                type="button"
                className={styles.imagePreviewClose}
                onClick={() => setPreviewOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>,
            document.body,
          )
        : null}
      {portalMounted && promptPreviewOpen
        ? createPortal(
            <div className={styles.promptPreviewRoot} role="dialog" aria-modal="true" aria-label="查看提示词">
              <button
                type="button"
                className={styles.promptPreviewBackdrop}
                onClick={() => setPromptPreviewOpen(false)}
                aria-label="关闭提示词窗口"
              />
              <section className={styles.promptPreviewPanel}>
                <header className={styles.promptPreviewHead}>
                  <div>
                    <p className={styles.promptPreviewEyebrow}>
                      当前模式提示词
                    </p>
                    <h2 className={styles.promptPreviewTitle}>
                      {allModes.find((m) => m.id === selectedModeId)?.label ?? displayedPromptPresetById.get(selectedModeId)?.title ?? selectedModeId}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className={styles.promptPreviewClose}
                    onClick={() => setPromptPreviewOpen(false)}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </header>
                <pre className={styles.promptPreviewText}>
                  {finalPrompt || "（当前提示词为空）"}
                </pre>
                <footer className={styles.promptPreviewActions}>
                  <button
                    type="button"
                    className={styles.promptCopyButton}
                    onClick={() => void copyPromptToClipboard()}
                  >
                    {promptCopied ? "已复制" : "复制全部"}
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
      <PromptPresetLibraryDialog
        open={portalMounted && presetLibraryOpen}
        onClose={() => setPresetLibraryOpen(false)}
        activePresetId={selectedModeId}
        allowedApplyKinds={["image"]}
        onApplyPreset={selectPromptPreset}
        onFavoriteChange={(preset) => {
          if (preset.kind === "image") loadImagePromptPresets();
        }}
      />
      {portalMounted && toolbarPickerMenu
        ? createPortal(
            <>
              <button
                type="button"
                className={styles.toolbarPickerBackdrop}
                aria-label="关闭选项菜单"
                onClick={() => setToolbarPickerMenu(null)}
              />
              <div
                className={[
                  styles.toolbarPickerMenu,
                  toolbarPickerMenu.kind === "ratio" ? styles.toolbarPickerMenuRatio : "",
                ].filter(Boolean).join(" ")}
                style={{
                  left: toolbarPickerMenu.anchor.left + toolbarPickerMenu.anchor.width / 2,
                  top: toolbarPickerMenu.anchor.top,
                } as CSSProperties}
                role="menu"
              >
                {toolbarPickerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={[
                      styles.toolbarPickerOption,
                      toolbarPickerMenu.kind === "ratio" ? styles.toolbarPickerOptionRatio : "",
                      option.active ? styles.toolbarPickerOptionActive : "",
                    ].filter(Boolean).join(" ")}
                    role="menuitemradio"
                    aria-checked={option.active}
                    onClick={() => {
                      option.onSelect();
                      setToolbarPickerMenu(null);
                    }}
                  >
                    {toolbarPickerMenu.kind === "ratio" ? (
                      <>
                        <span
                          className={[
                            styles.toolbarRatioPreview,
                            option.id === "auto" ? styles.toolbarRatioPreviewAuto : "",
                          ].filter(Boolean).join(" ")}
                          style={"previewStyle" in option ? option.previewStyle : undefined}
                          aria-hidden
                        />
                        <span className={styles.toolbarRatioLabel}>{option.label}</span>
                      </>
                    ) : (
                      option.label
                    )}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
      {portalMounted && refUploadMenu && !refSlots[refUploadMenu.index]
        ? createPortal(
            <div
              className={styles.refUploadMenu}
              style={{
                left: refUploadMenu.anchor.left + refUploadMenu.anchor.width / 2,
                top: refUploadMenu.anchor.top,
              } as CSSProperties}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  const { index } = refUploadMenu;
                  setRefUploadMenu(null);
                  refFileInputRefs.current[index]?.click();
                }}
              >
                本地上传
              </button>
              <button
                type="button"
                disabled={!projectId}
                onClick={() => {
                  const { index } = refUploadMenu;
                  setRefUploadMenu(null);
                  setAssetPickerSlot(index);
                }}
              >
                项目素材
              </button>
            </div>,
            document.body,
          )
        : null}
      {portalMounted && projectId && assetPickerSlot !== null
        ? createPortal(
            <ProjectAssetPickerDialog
              projectId={projectId}
              allowedKinds={["image"]}
              onClose={() => setAssetPickerSlot(null)}
              onSelect={(asset) => void fillRefImageFromProjectAsset(assetPickerSlot, asset)}
            />,
            document.body,
          )
        : null}
    </main>
  );
}
