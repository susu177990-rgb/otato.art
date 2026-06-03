"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  placeholderInnerHint,
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageGalleryRecord,
  type ImageGalleryReferenceImage,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import {
  mergeCachedImageUrls,
  saveImageResultForRecord,
} from "@/lib/image-gallery-client-cache";
import {
  fetchGalleryRecords,
  fetchWorkspaceSnapshot,
  prependGalleryRecordApi,
  saveWorkspaceSnapshot,
} from "@/lib/workspace-api";
import shellStyles from "../shared/shell.module.css";
import styles from "./image-page.module.css";

const ASPECT_RATIOS: ImageAspectRatio[] = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
const IMAGE_SIZES: ImageSizeTier[] = ["1K", "2K", "4K"];
const IMAGE_GENERATION_RUNTIME_STORAGE_KEY = "script-agent-image-generation-runtime-v1";
const IMAGE_GENERATION_RUNTIME_EVENT = "script-agent-image-generation-runtime-change";
const IMAGE_REFERENCE_CACHE_STORAGE_KEY = "script-agent-image-reference-cache-v1";

type RefSlot = { previewUrl: string; file: File } | null;
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
  slotInputs: string[];
  finalPrompt: string;
  referenceImages: ImageGalleryReferenceImage[];
  imageUrl?: string;
  error?: string;
};

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
    if (parsed.modelId !== "gpt-image-2" && parsed.modelId !== "nano-banana-2" && parsed.modelId !== "nano-banana-pro") {
      return null;
    }
    return {
      taskId: parsed.taskId,
      status: parsed.status,
      startedAt: parsed.startedAt,
      updatedAt: parsed.updatedAt || parsed.startedAt,
      modeId: String(parsed.modeId || "real-character-asset"),
      modelId: parsed.modelId,
      aspectRatio: parsed.aspectRatio || "4:3",
      imageSize: parsed.imageSize || "1K",
      gptImageQuality: parsed.gptImageQuality,
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

/** 原生 select 的固有宽度往往按「最宽的 option」计算，短文案也会显得很空；按当前选中项测宽收紧 pill。 */
function measuredWidthForNativeSelect(select: HTMLSelectElement): number {
  const opt = select.options[select.selectedIndex];
  const text = opt?.text ?? "";
  const cs = getComputedStyle(select);
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.top = "0";
  span.style.visibility = "hidden";
  span.style.whiteSpace = "nowrap";
  span.style.font = cs.font;
  span.style.letterSpacing = cs.letterSpacing;
  span.textContent = text;
  document.body.appendChild(span);
  const textWidth = span.getBoundingClientRect().width;
  document.body.removeChild(span);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const borderL = parseFloat(cs.borderLeftWidth) || 0;
  const borderR = parseFloat(cs.borderRightWidth) || 0;
  const minWidthPx = parseFloat(cs.minWidth) || 0;
  const maxWidthPx = parseFloat(cs.maxWidth);
  let widthPx = Math.max(minWidthPx, Math.ceil(textWidth + padL + padR + borderL + borderR));
  if (Number.isFinite(maxWidthPx) && maxWidthPx > 0) {
    widthPx = Math.min(widthPx, Math.ceil(maxWidthPx));
  }
  return widthPx;
}

function normalizeSlotInputsToLength(slots: string[] | undefined, len: number): string[] {
  return Array.from({ length: len }, (_, i) => slots?.[i] ?? "");
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
    const res = await fetch(url);
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
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function ImagePage() {
  const { settings: llmSettings, imageWorkspace, videoWorkspace, workspaceReady, refreshWorkspace } = useApiSettings();
  const [settings, setSettings] = useState(DEFAULT_IMAGE_SETTINGS);
  const [records, setRecords] = useState<ImageGalleryRecord[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string>("real-character-asset");
  const [selectedModelId, setSelectedModelId] = useState<ImageModelId>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("4:3");
  const [imageSize, setImageSize] = useState<ImageSizeTier>("1K");
  const [slotInputs, setSlotInputs] = useState<string[]>([""]);
  const [refSlots, setRefSlots] = useState<RefSlot[]>(createEmptyRefSlots);
  const [resultUrl, setResultUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
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
    if (!previewOpen && !promptPreviewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
      if (e.key === "Escape") setPromptPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen, promptPreviewOpen]);

  useEffect(() => {
    if (!promptPreviewOpen) setPromptCopied(false);
  }, [promptPreviewOpen]);

  useEffect(() => {
    if (!previewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [previewOpen]);

  const ratioSelectRef = useRef<HTMLSelectElement>(null);
  const sizeSelectRef = useRef<HTMLSelectElement>(null);
  const qualitySelectRef = useRef<HTMLSelectElement>(null);

  useLayoutEffect(() => {
    function applyComposerSelectWidths() {
      const ratioEl = ratioSelectRef.current;
      const sizeEl = sizeSelectRef.current;
      const qualityEl = qualitySelectRef.current;
      if (ratioEl) ratioEl.style.width = `${measuredWidthForNativeSelect(ratioEl)}px`;
      if (sizeEl) sizeEl.style.width = `${measuredWidthForNativeSelect(sizeEl)}px`;
      if (qualityEl) qualityEl.style.width = `${measuredWidthForNativeSelect(qualityEl)}px`;
    }
    applyComposerSelectWidths();
    window.addEventListener("resize", applyComposerSelectWidths);
    void document.fonts?.ready.then(applyComposerSelectWidths);
    return () => window.removeEventListener("resize", applyComposerSelectWidths);
  }, [aspectRatio, imageSize, settings.gptImageQuality, selectedModelId]);

  useEffect(() => {
    if (workspaceReady) setSettings(imageWorkspace);
  }, [imageWorkspace, workspaceReady]);

  useEffect(() => {
    async function refreshGallery() {
      try {
        const records = await fetchGalleryRecords();
        setRecords(mergeCachedImageUrls(mergeCachedReferenceImages(records)));
      } catch (e) {
        console.warn("[image] gallery load failed", e);
      }
    }
    if (workspaceReady) void refreshGallery();

    function onVisibility() {
      if (document.visibilityState === "visible" && workspaceReady) {
        void refreshWorkspace();
        void refreshGallery();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [workspaceReady, refreshWorkspace]);

  const modes = useMemo(
    () => [...IMAGE_MODES, ...(settings.customModes ?? [])].reverse(),
    [settings.customModes],
  );

  const selectedModel = settings.models[selectedModelId];
  const promptTemplate = settings.prompts[selectedModeId] ?? "";
  const placeholderOccurrences = useMemo(
    () => extractPromptPlaceholderOccurrences(promptTemplate),
    [promptTemplate],
  );
  const composerSlotCount = composerSlotCountForTemplate(promptTemplate, selectedModeId);

  useEffect(() => {
    setSlotInputs((prev) => normalizeSlotInputsToLength(prev, composerSlotCount));
  }, [selectedModeId, promptTemplate, composerSlotCount]);

  useEffect(() => {
    if (modes.some((m) => m.id === selectedModeId)) return;
    const fallback =
      modes.find((m) => m.id === "real-character-asset")?.id ?? modes[0]?.id ?? "free";
    setSelectedModeId(fallback);
  }, [modes, selectedModeId]);

  const finalPrompt = useMemo(
    () => buildImagePromptFromSlots(promptTemplate, slotInputs),
    [promptTemplate, slotInputs],
  );
  const refSlotHintsLines = settings.refSlotHintsByMode[selectedModeId] ?? [];
  const modelReady = Boolean(selectedModel.endpointUrl.trim() && selectedModel.apiKey.trim() && selectedModel.modelName.trim());
  const filledRefFileCount = useMemo(() => refSlots.filter(Boolean).length, [refSlots]);
  const sidebarHistoryRecords = useMemo(() => {
    const success = records.filter((r) => r.status === "success" && Boolean(r.imageUrl)).slice(0, 24);
    return success.slice().reverse();
  }, [records]);

  function persistGptImageQuality(q: GptImageQuality) {
    setSettings((prev) => {
      const next = { ...prev, gptImageQuality: q };
      void saveWorkspaceSnapshot({ llm: llmSettings, imageWorkspace: next, videoWorkspace }).then(() => refreshWorkspace());
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

  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el || sidebarHistoryRecords.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [sidebarHistoryRecords]);

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
  }, []);

  function markRefSlotsUserEdited() {
    refSlotsUserEditedRef.current = true;
  }

  function addRefImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    markRefSlotsUserEdited();
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
  }

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

  function clearRefImage(index: number) {
    markRefSlotsUserEdited();
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      revokeRefPreview(next[index]);
      next[index] = null;
      return next;
    });
  }

  const restoreReferenceImages = useCallback((referenceImages: ImageGalleryReferenceImage[] | undefined) => {
    if (!referenceImages) return;
    setRefSlots((prev) => {
      for (const slot of prev) revokeRefPreview(slot);
      const next = createEmptyRefSlots();
      for (const image of referenceImages) {
        if (image.slotIndex < 0 || image.slotIndex >= next.length || !image.dataUrl) continue;
        const type = image.type || image.dataUrl.match(/^data:([^;]+);base64,/)?.[1] || "image/png";
        const file = dataUrlToFile(image.dataUrl, image.name || `reference-${image.slotIndex + 1}.png`, type);
        next[image.slotIndex] = {
          file,
          previewUrl: image.dataUrl,
        };
      }
      return next;
    });
  }, []);

  function restoreReferenceImagesFromRecord(record: ImageGalleryRecord) {
    refSlotsUserEditedRef.current = false;
    restoreReferenceImages(record.referenceImages);
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
        restoreReferenceImages(state.referenceImages);
      }
      setIsGenerating(state.status === "running");
      if (state.status === "success") {
        setResultUrl(state.imageUrl || "");
        setError("");
      } else if (state.status === "error") {
        setError(state.error || "生图失败");
      }
      if (state.gptImageQuality) {
        setSettings((prev) => ({ ...prev, gptImageQuality: state.gptImageQuality! }));
      }
    },
    [restoreReferenceImages],
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
  ) {
    const resolvedPrompt = promptSnapshot ?? finalPrompt;
    const record: ImageGalleryRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modeId: selectedModeId,
      modeName: modes.find((m) => m.id === selectedModeId)?.label ?? selectedModeId,
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
      refImageCount: referenceImages?.length ?? filledRefFileCount,
      referenceImages,
      status,
      error: message,
    };
    saveReferenceImagesForRecord(record.id, referenceImages ?? []);
    if (imageUrl?.trim()) saveImageResultForRecord(record.id, imageUrl);
    try {
      const next = await prependGalleryRecordApi(record);
      if (mountedRef.current) setRecords(mergeCachedImageUrls(mergeCachedReferenceImages(next)));
    } catch (e) {
      console.warn("[image] gallery save failed", e);
      if (mountedRef.current) setRecords((prev) => [record, ...prev]);
    }
    return record;
  }

  async function handleGenerate() {
    setError("");

    if (selectedModeId === "free" && !(slotInputs[0] ?? "").trim()) {
      setError("自由模式请填写完整提示词（无内置模版）。");
      return;
    }

    /** 提交前强制与云端对齐 */
    const liveSnapshot = await fetchWorkspaceSnapshot();
    const liveSettings = liveSnapshot.imageWorkspace;
    setSettings(liveSettings);
    const liveModel = liveSettings.models[selectedModelId];
    const liveTemplate = liveSettings.prompts[selectedModeId] ?? "";
    const promptForRequest = buildImagePromptFromSlots(liveTemplate, slotInputs);
    const liveReady = Boolean(
      liveModel.endpointUrl && liveModel.apiKey && liveModel.modelName,
    );

    if (!liveReady) {
      setError(
        `「${liveModel.label}」（槽位 ${liveModel.id}）缺少 Endpoint / API Key / 模型名。请在「设置 → 生图 API」里填写对应卡片并保存；作图页选中哪个模型就用哪一套配置。`,
      );
      return;
    }

    setIsGenerating(true);
    let referenceImages: ImageGalleryReferenceImage[] = [];
    let runtimeState: ImageGenerationRuntimeState | null = null;
    try {
      const refSlotsSnapshot = normalizeRefSlots(refSlots);
      referenceImages = await snapshotReferenceImages(refSlotsSnapshot);
      refSlotsUserEditedRef.current = false;
      runtimeState = {
        taskId: crypto.randomUUID(),
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modeId: selectedModeId,
        modelId: selectedModelId,
        aspectRatio,
        imageSize,
        gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
        slotInputs: [...slotInputs],
        finalPrompt: promptForRequest,
        referenceImages,
      };
      writeGenerationRuntimeState(runtimeState);
      const fd = new FormData();
      fd.append(
        "meta",
        JSON.stringify({
          prompt: promptForRequest,
          model: liveModel,
          aspectRatio,
          imageSize,
          gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
        }),
      );
      for (const slot of refSlotsSnapshot) {
        if (slot?.file) fd.append("ref", slot.file, slot.file.name || "reference.png");
      }

      const res = await fetch("/api/image/generate", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "生图失败");
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
      if (!imageUrl) throw new Error(typeof data.error === "string" && data.error ? data.error : "服务器未返回图片地址");
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
      try {
        void writeRecord("success", imageUrl, undefined, promptForRequest, referenceImages);
      } catch (persistErr) {
        console.warn("本地画廊写入失败（多与浏览器存储配额有关）:", persistErr);
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
        void writeRecord("error", undefined, message, promptForRequest, referenceImages);
      } catch (persistErr) {
        console.warn("写入失败记录到本地画廊时出错:", persistErr);
      }
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <Link href="/image/gallery" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            画廊
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>模式化生图工作台</p>
          </div>
        </div>
      </header>

      <section className={styles.stage}>
        <aside className={[styles.modePanel, styles.modePanelImage].join(" ")}>
          <div className={styles.modeColumn}>
            <div className={styles.modeRail}>
              <div className={styles.modeRailFrame}>
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
                      {modes.map((mode) => {
                        const active = selectedModeId === mode.id;
                        const coverUrl = settings.coverImageUrlByMode?.[mode.id]?.trim() ?? "";
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
                                <span className={styles.modeMeta}>{mode.label}</span>
                              </>
                            ) : (
                              <span className={styles.modeCoverFallback}>{mode.label}</span>
                            )}
                          </button>
                        );
                      })}
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
              <div className={styles.resultClip}>
                {resultUrl ? (
                  <div className={styles.resultMedia}>
                    <div className={styles.resultImageStack}>
                      <button
                        type="button"
                        className={styles.resultPreviewHit}
                        onClick={() => setPreviewOpen(true)}
                        aria-label="全屏预览生成图"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resultUrl} alt="生成结果" className={styles.resultImage} />
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
                <span className={styles.statusLabel}>生成中</span>
              </div>
            ) : null}
          </div>
        </div>

        <aside className={styles.historyPanel}>
          <div className={styles.historyColumn}>
            <div className={styles.historyRail}>
              <div className={styles.historyRailFrame}>
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
                        sidebarHistoryRecords.map((record) => (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => {
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
                                  void saveWorkspaceSnapshot({
                                    llm: llmSettings,
                                    imageWorkspace: next,
                                    videoWorkspace,
                                  }).then(() => refreshWorkspace());
                                  return next;
                                });
                              }
                              restoreReferenceImagesFromRecord(record);
                            }}
                            className={styles.historyItem}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={record.imageUrl!} alt={record.modeName} />
                            <span className={styles.historyMeta}>
                              {record.aspectRatio} · {record.imageSize}
                              {record.gptImageQuality
                                ? ` · 细节程度：${GPT_IMAGE_QUALITY_LABELS[record.gptImageQuality]}`
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

          <div className={styles.referenceStrip}>
            {refSlots.map((slot, index) => (
              <div
                key={index}
                className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  fillRefImagesFromIndex(index, e.dataTransfer.files);
                }}
              >
                <label
                  aria-label={`图${index + 1}${refSlotHintsLines[index]?.trim() ? ` ${refSlotHintsLines[index].trim()}` : ""}，点击上传参考图`}
                >
                  <input
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      fillRefImagesFromIndex(index, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
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
                </label>
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

          <div className={styles.composer}>
            <div
              className={styles.promptSlotGrid}
              style={{ gridTemplateColumns: `repeat(${slotInputs.length}, minmax(0, 1fr))` }}
              role="group"
              aria-label="作图输入"
            >
              {slotInputs.map((val, i) => (
                <div key={i} className={styles.promptSlotPane}>
                  <textarea
                    value={val}
                    onChange={(e) =>
                      setSlotInputs((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={composerPlaceholder(selectedModeId, placeholderOccurrences, i)}
                    aria-label={`作图输入槽位 ${i + 1}`}
                    className={styles.promptInput}
                  />
                </div>
              ))}
            </div>
            <div className={styles.toolbar}>
              <div className={[shellStyles.segmented, shellStyles.segmentedComposer].join(" ")}>
                {IMAGE_MODEL_ORDER.map((id) => {
                  const model = settings.models[id];
                  const active = selectedModelId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedModelId(id)}
                      className={[shellStyles.segmentedItem, active ? shellStyles.segmentedItemActive : ""].join(" ")}
                    >
                      {model.label}
                    </button>
                  );
                })}
              </div>

              <select
                ref={ratioSelectRef}
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}
                className={[styles.composerSelect, styles.composerSelectRatio].join(" ")}
                aria-label="比例"
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio === "auto" ? "自适应" : ratio}
                  </option>
                ))}
              </select>

              <select
                ref={sizeSelectRef}
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value as ImageSizeTier)}
                className={[styles.composerSelect, styles.composerSelectSize].join(" ")}
                aria-label="清晰度"
              >
                {IMAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>

              {selectedModel.provider === "gpt-image" ? (
                <select
                  ref={qualitySelectRef}
                  value={settings.gptImageQuality}
                  onChange={(e) => persistGptImageQuality(e.target.value as GptImageQuality)}
                  className={[styles.composerSelect, styles.composerSelectQuality].join(" ")}
                  aria-label="细节程度"
                >
                  {GPT_IMAGE_QUALITY_ORDER.map((q) => (
                    <option key={q} value={q}>{`细节程度：${GPT_IMAGE_QUALITY_LABELS[q]}`}</option>
                  ))}
                </select>
              ) : null}

              {!modelReady ? <span className={styles.warning}>当前模型未配置</span> : null}
              <button
                type="button"
                onClick={() => setPromptPreviewOpen(true)}
                className={styles.viewPrompt}
              >
                查看提示词
              </button>
              <button type="button" onClick={handleGenerate} disabled={isGenerating} className={styles.generate} title="生成">
                {isGenerating ? "生成中" : "生成"}
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
                    <p className={styles.promptPreviewEyebrow}>当前模式提示词</p>
                    <h2 className={styles.promptPreviewTitle}>
                      {modes.find((m) => m.id === selectedModeId)?.label ?? selectedModeId}
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
                <pre className={styles.promptPreviewText}>{finalPrompt || "（当前提示词为空）"}</pre>
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
    </main>
  );
}
