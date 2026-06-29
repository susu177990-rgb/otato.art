"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./video-page.module.css";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import { InlineVideoPlayer } from "@/components/media/InlineVideoPlayer";
import { PromptPresetLibraryDialog } from "@/components/prompt-presets/PromptPresetLibraryDialog";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import { ProjectAssetPickerDialog, type ProjectAssetMediaKind } from "@/components/project-assets/ProjectAssetPickerDialog";
import { useOptionalWorkspaceProject } from "@/components/workspace/WorkspaceProjectContext";
import { WorkspaceModeDock } from "@/components/workspace/WorkspaceModeDock";
import type { ProjectAsset } from "@/lib/project-assets";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { mediaContentType, mediaFileExtension, mediaFileMatchesKind } from "@/lib/media-file";
import {
  fetchVideoGalleryRecords,
  fetchWorkspaceSnapshot,
  prependVideoGalleryRecordApi,
} from "@/lib/workspace-api";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { fetchSitePromptPresets } from "@/lib/prompt-preset-api-client";
import { AssetMentionEditor } from "@/components/AssetMentionEditor";
import { resolveAssetMentions, type AssetMentionCandidate } from "@/lib/asset-mentions";
import { formatGenerationErrorForDisplay } from "@/lib/generation-error-classifier";
import {
  VIDEO_MODE_LABELS,
  VIDEO_MODES,
  buildVideoPromptFromSlots,
  composerSlotCountForTemplate,
  extractPromptPlaceholderOccurrences,
  getVideoCapabilities,
  getVideoModelDefinition,
  getVideoParameterCapabilities,
  isVideoDurationSupported,
  modelSupportsUiMode,
  normalizeVideoDuration,
  placeholderInnerHint,
  videoModelsForUiMode,
  type UnifiedVideoReference,
  type VideoAspectRatio,
  type VideoDurationCapability,
  type VideoGenerationModeId,
  type VideoGrokImagineMode,
  type VideoModelId,
  type VideoModelSettings,
  type VideoResolution,
  type UiVideoModeId,
  UI_VIDEO_MODES as UI_MODES,
  inferEffectiveVideoMode,
  VideoWorkspaceSettings,
} from "@/lib/video-workspace";

const OPEN_VIDEO_PROMPT_PRESETS_EVENT = "otato:open-video-prompt-presets";

function ratioPreviewAspect(value: string): string | undefined {
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

function durationProgressStyle(value: number, capability: VideoDurationCapability): CSSProperties {
  const values = capability.type === "range" ? [capability.min, capability.max] : capability.values;
  const min = Math.min(...values, value);
  const max = Math.max(...values, value);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 100;
  return { "--duration-progress": `${Math.min(100, Math.max(18, progress))}%` } as CSSProperties;
}

function durationPresets(capability: VideoDurationCapability): number[] {
  if (capability.type === "range") return [];
  return Array.from(new Set(capability.values)).sort((a, b) => a - b);
}

type ReferenceKind = "image" | "video" | "audio";
type ReferenceSlot = { kind: ReferenceKind; url: string; previewUrl: string; label: string; mimeType: string; file?: File; durationSeconds?: number } | null;
type ReferenceCollections = Record<ReferenceKind, NonNullable<ReferenceSlot>[]>;
type PendingVideoGeneration = {
  id: string;
  createdAt: string;
  modelId: VideoModelId;
  modelName: string;
  modeId: VideoGenerationModeId;
  modeName: string;
  finalPrompt: string;
  durationSeconds: number;
  resolution: VideoResolution;
  previewUrl?: string;
};
type VideoSidebarHistoryItem =
  | { kind: "pending"; pending: PendingVideoGeneration }
  | { kind: "record"; record: VideoGalleryRecord };

function isHappyHorseVideoModel(modelId: VideoModelId): boolean {
  return modelId === "happyhorse-1.1" || modelId === "happyhorse-1.0";
}

function isGrokImagineVideoModel(modelId: VideoModelId): boolean {
  return modelId === "grok-imagine";
}

function isVeo31VideoModel(modelId: VideoModelId): boolean {
  return modelId === "veo-3.1" || modelId === "veo-3.1-fast" || modelId === "veo-3.1-lite";
}

function referenceKindsForUiMode(uiModeId: UiVideoModeId, modelId: VideoModelId): ReferenceKind[] {
  if (uiModeId === "motion_control") return ["image", "video"];
  if (uiModeId === "video_edit") return ["video", "image"];
  if (isHappyHorseVideoModel(modelId) || isGrokImagineVideoModel(modelId) || isVeo31VideoModel(modelId)) return ["image"];
  if (modelId === "kling-3.0") return ["image"];
  return REFERENCE_KINDS;
}

function isVideoModelConfiguredForMode(
  model: VideoModelSettings | undefined,
  modeId: VideoGenerationModeId,
): boolean {
  if (!model?.baseUrl.trim()) return false;
  if (!model.apiModelNameByMode?.[modeId]?.trim()) return false;
  return true;
}

function missingVideoConfigMessage(label: string, modeId: VideoGenerationModeId): string {
  return `网站内部视频 API 暂未配置完整（${label} / ${VIDEO_MODE_LABELS[modeId]}），请联系管理员。`;
}
type ReferenceState = {
  frames: [ReferenceSlot, ReferenceSlot];
  allPurpose: ReferenceCollections;
};
type MenuAnchor = { left: number; top: number; width: number; height: number };
type ReferenceUploadMenuState = {
  kind: ReferenceKind;
  index: number;
  inputKey: string;
  projectAssetKind: ProjectAssetMediaKind | null;
  anchor: MenuAnchor;
} | null;
type ToolbarPickerKind = "mode" | "model" | "ratio" | "duration" | "resolution" | "grokMode";
type ToolbarPickerMenuState = { kind: ToolbarPickerKind; anchor: MenuAnchor } | null;
type ProjectAssetPickerState = { kind: Extract<ReferenceKind, "image" | "video">; index: number } | null;
type CreditQuoteState = {
  loading: boolean;
  credits?: number;
  availableCredits?: number;
  reservedCredits?: number;
  enough?: boolean;
  error?: string;
};
type PresetRailItem = {
  id: string;
  label: string;
  promptTemplate: string;
  coverUrl: string;
};

const FREE_PRESET: PresetRailItem = { id: "free", label: "自由模式", promptTemplate: "", coverUrl: "" };
const GROK_IMAGINE_MODES: ReadonlyArray<{ id: VideoGrokImagineMode; label: string }> = [
  { id: "normal", label: "普通" },
  { id: "fun", label: "有趣" },
  { id: "spicy", label: "热辣" },
];

const REFERENCE_KINDS: ReferenceKind[] = ["image", "video", "audio"];

function createEmptyReferences(): ReferenceState {
  return {
    frames: [null, null],
    allPurpose: {
      image: [],
      video: [],
      audio: [],
    },
  };
}

function compactReferenceList(slots: Array<ReferenceSlot | null | undefined>): NonNullable<ReferenceSlot>[] {
  return slots.filter((slot): slot is NonNullable<ReferenceSlot> => Boolean(slot));
}

function kindAccept(kind: ReferenceKind): string {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  return "audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav";
}

function fileMatchesKind(file: File, kind: ReferenceKind): boolean {
  return mediaFileMatchesKind(file, kind);
}

function kindSlotLabel(kind: ReferenceKind, index: number): string {
  if (kind === "image") return `图${index + 1}`;
  if (kind === "video") return `视频${index + 1}`;
  return `音频${index + 1}`;
}

function kindGroupLabel(kind: ReferenceKind): string {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  return "音频";
}

function assetPickerKindsForReference(kind: ReferenceKind): ProjectAssetMediaKind[] {
  if (kind === "image") return ["image"];
  if (kind === "video") return ["video"];
  return [];
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

function mimeTypeFromAssetUrl(url: string, kind: Extract<ReferenceKind, "image" | "video">): string {
  if (/^data:([^;,]+)/i.test(url)) return url.match(/^data:([^;,]+)/i)?.[1] || (kind === "video" ? "video/mp4" : "image/png");
  if (kind === "video") {
    if (/\.webm(?:[?#]|$)/i.test(url)) return "video/webm";
    if (/\.(mov|quicktime)(?:[?#]|$)/i.test(url)) return "video/quicktime";
    return "video/mp4";
  }
  if (/\.jpe?g(?:[?#]|$)/i.test(url)) return "image/jpeg";
  if (/\.webp(?:[?#]|$)/i.test(url)) return "image/webp";
  if (/\.gif(?:[?#]|$)/i.test(url)) return "image/gif";
  return "image/png";
}

function normalizeSlotInputsToLength(slots: string[] | undefined, len: number): string[] {
  return Array.from({ length: len }, (_, i) => slots?.[i] ?? "");
}

function composerPlaceholder(tokenList: string[], slotIndex: number): string {
  const token = tokenList[slotIndex];
  if (token) {
    const hint = placeholderInnerHint(token);
    if (hint) return hint;
  }
  return slotIndex === 0 ? "输入视频描述" : `输入槽位 ${slotIndex + 1}`;
}

function uiModeFromRecord(modeId: VideoGenerationModeId): UiVideoModeId {
  if (modeId === "multi_image_reference") return "multi_image_reference";
  if (modeId === "video_edit") return "video_edit";
  return "start_end_frame";
}

function effectiveModeFromUi(
  uiModeId: UiVideoModeId,
  references: ReferenceState,
): { modeId: VideoGenerationModeId; error?: string } {
  return inferEffectiveVideoMode(uiModeId, Boolean(references.frames[0]), Boolean(references.frames[1]));
}

function slotLabel(uiModeId: UiVideoModeId, index: number): string {
  if (uiModeId === "start_end_frame") return index === 0 ? "首帧" : "尾帧";
  if (uiModeId === "video_edit") return index === 0 ? "原视频" : `参考图${index}`;
  if (uiModeId === "motion_control") return index === 0 ? "主体图" : "动作视频";
  return `图${index + 1}`;
}

function referenceRoleForKind(kind: ReferenceKind): UnifiedVideoReference["role"] {
  if (kind === "image") return "image_reference";
  if (kind === "video") return "video_reference";
  return "audio_reference";
}

function buildReferences(uiModeId: UiVideoModeId, references: ReferenceState): UnifiedVideoReference[] {
  if (uiModeId === "motion_control") {
    return [
      ...references.allPurpose.image.slice(0, 1).map((slot) => ({
        role: "start_frame" as const,
        url: slot.url,
        label: "主体图",
        mimeType: slot.mimeType,
      })),
      ...references.allPurpose.video.slice(0, 1).map((slot) => ({
        role: "motion_source_video" as const,
        url: slot.url,
        label: "动作视频",
        mimeType: slot.mimeType,
        durationSeconds: slot.durationSeconds,
      })),
    ];
  }
  if (uiModeId === "video_edit") {
    return [
      ...references.allPurpose.video.slice(0, 1).map((slot, index) => ({
        role: "video_reference" as const,
        url: slot.url,
        label: index === 0 ? "原视频" : kindSlotLabel("video", index),
        mimeType: slot.mimeType,
        durationSeconds: slot.durationSeconds,
      })),
      ...references.allPurpose.image.map((slot, index) => ({
        role: "image_reference" as const,
        url: slot.url,
        label: `参考图${index + 1}`,
        mimeType: slot.mimeType,
      })),
    ];
  }
  if (uiModeId === "multi_image_reference") {
    return REFERENCE_KINDS.flatMap((kind) =>
      references.allPurpose[kind].map((slot, index) => ({
        role: referenceRoleForKind(kind),
        url: slot.url,
        label: kindSlotLabel(kind, index),
        mimeType: slot.mimeType,
        durationSeconds: kind === "video" ? slot.durationSeconds : undefined,
      })),
    );
  }

  const refs: UnifiedVideoReference[] = [];
  if (references.frames[0]) {
    refs.push({
      role: "start_frame",
      url: references.frames[0].url,
      label: "首帧",
      mimeType: references.frames[0].mimeType,
    });
  }
  if (references.frames[1]) {
    refs.push({
      role: "end_frame",
      url: references.frames[1].url,
      label: "尾帧",
      mimeType: references.frames[1].mimeType,
    });
  }
  return refs;
}

function readVideoDuration(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    };
    video.onerror = () => resolve(undefined);
    video.src = url;
  });
}

function billableVideoSecondsForMode(
  modeId: VideoGenerationModeId,
  durationSeconds: number,
  references: UnifiedVideoReference[],
): number {
  if (modeId === "video_edit") {
    return references.find((ref) => ref.role === "video_reference" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  if (modeId === "motion_control") {
    return references.find((ref) => ref.role === "motion_source_video" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  return durationSeconds;
}

function historySlotKey(modeId: VideoGenerationModeId, role: UnifiedVideoReference["role"], index: number): { kind: "frame"; index: 0 | 1 } | { kind: ReferenceKind; index: number } | null {
  if (modeId === "multi_image_reference" || modeId === "video_edit" || modeId === "motion_control") {
    if (role === "image_reference") return { kind: "image", index };
    if (role === "video_reference" || role === "motion_source_video") return { kind: "video", index };
    if (role === "audio_reference") return { kind: "audio", index };
    return null;
  }
  if (role === "start_frame") return { kind: "frame", index: 0 };
  if (role === "end_frame") return { kind: "frame", index: 1 };
  return null;
}

function workspaceModeToPromptPreset(
  mode: { id: string; label: string },
  videoWorkspace: VideoWorkspaceSettings,
  favoriteOverlay?: SitePromptPreset,
): SitePromptPreset {
  return {
    id: mode.id,
    kind: "video",
    title: favoriteOverlay?.title || mode.label,
    promptTemplate: videoWorkspace.prompts[mode.id] ?? favoriteOverlay?.promptTemplate ?? "",
    coverImageUrl: videoWorkspace.coverImageUrlByMode?.[mode.id]?.trim() || favoriteOverlay?.coverImageUrl || "",
    refSlotHints: favoriteOverlay?.refSlotHints ?? [],
    tags: videoWorkspace.promptTagsByMode?.[mode.id] ?? favoriteOverlay?.tags ?? [],
    description: videoWorkspace.promptDescriptionsByMode?.[mode.id] ?? favoriteOverlay?.description,
    isFavorite: Boolean(favoriteOverlay?.isFavorite),
  };
}

export default function VideoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const workspaceProject = useOptionalWorkspaceProject();
  const projectId = workspaceProject?.projectId;
  useEffect(() => {
    if (pathname === "/video") router.replace("/projects");
  }, [pathname, router]);

  const { videoWorkspace, workspaceReady } = useApiSettings();
  const [records, setRecords] = useState<VideoGalleryRecord[]>([]);
  const [selectedUiModeId, setSelectedUiModeId] = useState<UiVideoModeId>("start_end_frame");
  const [selectedPresetId, setSelectedPresetId] = useState("free");
  const [selectedModelId, setSelectedModelId] = useState<VideoModelId>(videoWorkspace.uiDefaults.defaultModelId);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<VideoAspectRatio>(videoWorkspace.uiDefaults.defaultAspectRatio);
  const [selectedDuration, setSelectedDuration] = useState<number>(videoWorkspace.uiDefaults.defaultDurationSeconds);
  const [selectedResolution, setSelectedResolution] = useState<VideoResolution>(videoWorkspace.uiDefaults.defaultResolution);
  const [selectedSoundEnabled, setSelectedSoundEnabled] = useState(false);
  const [selectedGrokMode, setSelectedGrokMode] = useState<VideoGrokImagineMode>("normal");
  const [slotInputs, setSlotInputs] = useState<string[]>([""]);
  const [references, setReferences] = useState<ReferenceState>(createEmptyReferences);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [pendingGenerations, setPendingGenerations] = useState<PendingVideoGeneration[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [creditQuote, setCreditQuote] = useState<CreditQuoteState>({ loading: true });
  const isGenerating = pendingGenerations.length > 0;
  const [referenceUploadMenu, setReferenceUploadMenu] = useState<ReferenceUploadMenuState>(null);
  const [toolbarPickerMenu, setToolbarPickerMenu] = useState<ToolbarPickerMenuState>(null);
  const [projectAssetPicker, setProjectAssetPicker] = useState<ProjectAssetPickerState>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [promptPresets, setPromptPresets] = useState<SitePromptPreset[]>([]);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());

  const selectableModelIds = useMemo(() => videoModelsForUiMode(selectedUiModeId), [selectedUiModeId]);
  const safeModelId = selectableModelIds.includes(selectedModelId)
    ? selectedModelId
    : selectableModelIds[0] ?? videoWorkspace.uiDefaults.defaultModelId;
  const capabilities = useMemo(() => getVideoCapabilities(safeModelId), [safeModelId]);
  const { modeId: effectiveModeId, error: modeError } = useMemo(
    () => effectiveModeFromUi(selectedUiModeId, references),
    [selectedUiModeId, references],
  );
  const currentParameterReferences = useMemo(
    () => buildReferences(selectedUiModeId, references),
    [references, selectedUiModeId],
  );
  const parameterCapabilities = useMemo(
    () => getVideoParameterCapabilities(safeModelId, effectiveModeId, currentParameterReferences),
    [currentParameterReferences, effectiveModeId, safeModelId],
  );
  const durationCapability = parameterCapabilities.durationCapability;
  const soundControl = parameterCapabilities.soundControl;

  const allModes = useMemo(
    () => [...VIDEO_MODES, ...(videoWorkspace.customModes ?? [])].reverse(),
    [videoWorkspace.customModes],
  );
  const promptPresetById = useMemo(() => new Map(promptPresets.map((preset) => [preset.id, preset])), [promptPresets]);
  const displayedPromptPresets = useMemo(
    () => {
      const workspacePresets = allModes
        .filter((mode) => !VIDEO_MODES.some((base) => base.id === mode.id))
        .map((mode) => workspaceModeToPromptPreset(mode, videoWorkspace, promptPresetById.get(mode.id)));
      const workspacePresetIds = new Set(workspacePresets.map((preset) => preset.id));
      const libraryOnlyFavorites = promptPresets.filter(
        (preset) => preset.kind === "video" && preset.isFavorite && !workspacePresetIds.has(preset.id),
      );
      return [...workspacePresets, ...libraryOnlyFavorites];
    },
    [allModes, promptPresetById, promptPresets, videoWorkspace],
  );

  const presetRailItems = useMemo<PresetRailItem[]>(
    () =>
      displayedPromptPresets
        .filter((preset) => preset.isFavorite)
        .map((preset) => ({
          id: preset.id,
          label: preset.title,
          promptTemplate: preset.promptTemplate,
          coverUrl: preset.coverImageUrl,
        })),
    [displayedPromptPresets],
  );

  const selectedPreset = selectedPresetId === "free" ? FREE_PRESET : presetRailItems.find((item) => item.id === selectedPresetId) ?? FREE_PRESET;
  const isFreeMode = selectedPreset.id === "free";
  const placeholderOccurrences = useMemo(
    () => extractPromptPlaceholderOccurrences(selectedPreset.promptTemplate),
    [selectedPreset.promptTemplate],
  );
  const composerSlotCount = composerSlotCountForTemplate(selectedPreset.promptTemplate);
  const modelReady = isVideoModelConfiguredForMode(videoWorkspace.models[safeModelId], effectiveModeId);
  const currentBillableSeconds = parameterCapabilities.supportsDuration
    ? selectedDuration
    : billableVideoSecondsForMode(effectiveModeId, selectedDuration, currentParameterReferences);
  const creditBlocked = creditQuote.loading || Boolean(creditQuote.error) || creditQuote.enough === false;
  const sidebarHistoryRecords = useMemo<VideoSidebarHistoryItem[]>(() => {
    const success = records.filter((item) => item.status === "success" && Boolean(item.videoUrl)).slice(0, 24);
    return [
      ...success.slice().reverse().map((record) => ({ kind: "record" as const, record })),
      ...pendingGenerations.map((pending) => ({ kind: "pending" as const, pending })),
    ];
  }, [pendingGenerations, records]);
  const presetRailVisibleCount = Math.min(Math.max(presetRailItems.length, 1), 5);
  const historyRailVisibleCount = Math.min(Math.max(sidebarHistoryRecords.length, 1), 5);
  const presetRailStyle = { "--rail-visible-count": presetRailVisibleCount } as CSSProperties;
  const historyRailStyle = { "--rail-visible-count": historyRailVisibleCount } as CSSProperties;

  useEffect(() => {
    if (!workspaceReady) return;
    void fetchVideoGalleryRecords(projectId)
      .then((rows) => setRecords(rows))
      .catch((e) => console.warn("[video] gallery load failed", e));
  }, [workspaceReady, projectId]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const localPreviewUrls = localPreviewUrlsRef.current;
    return () => {
      for (const url of localPreviewUrls) {
        URL.revokeObjectURL(url);
      }
      localPreviewUrls.clear();
    };
  }, []);

  useEffect(() => {
    function openPromptPresetLibrary() {
      setPresetLibraryOpen(true);
    }
    window.addEventListener(OPEN_VIDEO_PROMPT_PRESETS_EVENT, openPromptPresetLibrary);
    return () => window.removeEventListener(OPEN_VIDEO_PROMPT_PRESETS_EVENT, openPromptPresetLibrary);
  }, []);

  useEffect(() => {
    if (!presetLibraryOpen && !promptPreviewOpen && !toolbarPickerMenu) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPresetLibraryOpen(false);
      if (e.key === "Escape") setPromptPreviewOpen(false);
      if (e.key === "Escape") setToolbarPickerMenu(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presetLibraryOpen, promptPreviewOpen, toolbarPickerMenu]);

  useEffect(() => {
    if (!promptPreviewOpen) setPromptCopied(false);
  }, [promptPreviewOpen]);

  useEffect(() => {
    if (!presetLibraryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presetLibraryOpen]);

  const loadVideoPromptPresets = useCallback(() => {
    void fetchSitePromptPresets("video")
      .then((presets) => {
        setPromptPresets(presets);
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "无法加载提示词预设";
        setError(message);
      });
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    loadVideoPromptPresets();
  }, [loadVideoPromptPresets, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || !selectedResolution) return;
    const controller = new AbortController();
    setCreditQuote((current) => ({ ...current, loading: true, error: undefined }));
    void fetch("/api/credits/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "video",
        modelId: safeModelId,
        modeId: effectiveModeId,
        resolution: selectedResolution,
        durationSeconds: currentBillableSeconds,
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
  }, [currentBillableSeconds, effectiveModeId, safeModelId, selectedResolution, workspaceReady]);

  async function copyPromptToClipboard() {
    const text = buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs) || "";
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
    if (preset.kind !== "video") return;
    setError("");
    setSelectedPresetId(preset.id);
  }

  const mentionCandidates = useMemo<AssetMentionCandidate[]>(() => {
    const candidates: AssetMentionCandidate[] = [];
    if (selectedUiModeId === "start_end_frame") {
      references.frames.forEach((slot, index) => {
        if (!slot) return;
        candidates.push({
          id: String(index),
          label: slotLabel(selectedUiModeId, index),
          type: "slot",
          role: index === 0 ? "start_frame" : "end_frame",
          groupLabel: "当前参考图",
          description: slot.label,
          thumbnailUrl: slot.previewUrl,
          url: slot.url,
        });
      });
      return candidates;
    }
    referenceKindsForUiMode(selectedUiModeId, safeModelId).forEach((kind) => {
      references.allPurpose[kind].forEach((slot, index) => {
        candidates.push({
          id: `${kind}:${index}`,
          label: kindSlotLabel(kind, index),
          type: "slot",
          role: referenceRoleForKind(kind),
          groupLabel: `当前${kindGroupLabel(kind)}`,
          description: slot.label,
          thumbnailUrl: kind === "image" ? slot.previewUrl : undefined,
          url: slot.url,
          durationSeconds: slot.durationSeconds,
        });
      });
    });
    return candidates;
  }, [references, safeModelId, selectedUiModeId]);

  useEffect(() => {
    setSelectedModelId((current) =>
      selectableModelIds.includes(current) ? current : selectableModelIds[0] ?? videoWorkspace.uiDefaults.defaultModelId,
    );
  }, [selectableModelIds, videoWorkspace.uiDefaults.defaultModelId]);

  useEffect(() => {
    setSelectedAspectRatio((current) =>
      parameterCapabilities.supportsAspectRatio && parameterCapabilities.aspectRatios.includes(current)
        ? current
        : parameterCapabilities.aspectRatios[0] ?? videoWorkspace.uiDefaults.defaultAspectRatio,
    );
    if (parameterCapabilities.supportsDuration && durationCapability) {
      setSelectedDuration((current) => normalizeVideoDuration(current, durationCapability));
    } else {
      setSelectedDuration(0);
    }
    setSelectedResolution((current) =>
      parameterCapabilities.resolutions.includes(current) ? current : parameterCapabilities.resolutions[0],
    );
    setSelectedSoundEnabled(soundControl?.defaultEnabled ?? false);
    setSelectedGrokMode("normal");
    if (!capabilities.supportsFirstLastFrames) {
      setReferences((current) => {
        if (!current.frames[1]) return current;
        revokeLocalPreviewUrl(current.frames[1].previewUrl);
        return { ...current, frames: [current.frames[0], null] };
      });
    }
    setToolbarPickerMenu(null);
  }, [capabilities, durationCapability, effectiveModeId, parameterCapabilities, safeModelId, selectedUiModeId, soundControl, videoWorkspace.uiDefaults.defaultAspectRatio]);

  function createLocalPreviewUrl(file: File): string {
    const url = URL.createObjectURL(file);
    localPreviewUrlsRef.current.add(url);
    return url;
  }

  function revokeLocalPreviewUrl(url: string | undefined) {
    if (!url || !url.startsWith("blob:") || !localPreviewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    localPreviewUrlsRef.current.delete(url);
  }

  function revokeReferencePreviews(state: ReferenceState) {
    state.frames.forEach((slot) => revokeLocalPreviewUrl(slot?.previewUrl));
    REFERENCE_KINDS.forEach((kind) => {
      state.allPurpose[kind].forEach((slot) => revokeLocalPreviewUrl(slot.previewUrl));
    });
  }

  async function localReferenceSlotFromFile(kind: ReferenceKind, file: File): Promise<NonNullable<ReferenceSlot>> {
    const previewUrl = createLocalPreviewUrl(file);
    const durationSeconds = kind === "video" ? await readVideoDuration(previewUrl) : undefined;
    return {
      kind,
      url: previewUrl,
      previewUrl,
      label: file.name,
      mimeType: mediaContentType(file, kind),
      file,
      durationSeconds,
    };
  }

  function findReferenceSlotByUrl(url: string): NonNullable<ReferenceSlot> | null {
    for (const slot of references.frames) {
      if (slot?.url === url || slot?.previewUrl === url) return slot;
    }
    for (const kind of REFERENCE_KINDS) {
      for (const slot of references.allPurpose[kind]) {
        if (slot.url === url || slot.previewUrl === url) return slot;
      }
    }
    return null;
  }

  function replaceLocalReferenceUrls(uploadedUrlByPreviewUrl: Map<string, string>) {
    if (uploadedUrlByPreviewUrl.size === 0) return;
    setReferences((prev) => ({
      frames: prev.frames.map((slot) =>
        slot && uploadedUrlByPreviewUrl.has(slot.previewUrl)
          ? { ...slot, url: uploadedUrlByPreviewUrl.get(slot.previewUrl)!, file: undefined }
          : slot,
      ) as [ReferenceSlot, ReferenceSlot],
      allPurpose: {
        image: prev.allPurpose.image.map((slot) =>
          uploadedUrlByPreviewUrl.has(slot.previewUrl)
            ? { ...slot, url: uploadedUrlByPreviewUrl.get(slot.previewUrl)!, file: undefined }
            : slot,
        ),
        video: prev.allPurpose.video.map((slot) =>
          uploadedUrlByPreviewUrl.has(slot.previewUrl)
            ? { ...slot, url: uploadedUrlByPreviewUrl.get(slot.previewUrl)!, file: undefined }
            : slot,
        ),
        audio: prev.allPurpose.audio.map((slot) =>
          uploadedUrlByPreviewUrl.has(slot.previewUrl)
            ? { ...slot, url: uploadedUrlByPreviewUrl.get(slot.previewUrl)!, file: undefined }
            : slot,
        ),
      },
    }));
  }

  useEffect(() => {
    if (selectedPresetId === "free") return;
    if (presetRailItems.some((item) => item.id === selectedPresetId)) return;
    setSelectedPresetId("free");
  }, [presetRailItems, selectedPresetId]);

  useEffect(() => {
    setSlotInputs((prev) => normalizeSlotInputsToLength(prev, composerSlotCount));
  }, [composerSlotCount, selectedPreset.promptTemplate]);

  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el || sidebarHistoryRecords.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [sidebarHistoryRecords]);

  async function uploadReferenceFiles(kind: ReferenceKind, index: number, files: FileList | File[] | null | undefined) {
    if (!files) return;
    const accepted = Array.from(files).filter((file) => fileMatchesKind(file, kind));
    if (accepted.length === 0) {
      setError(`请选择${kindGroupLabel(kind)}素材。`);
      return;
    }
    try {
      const staged = await Promise.all(accepted.map((file) => localReferenceSlotFromFile(kind, file)));

      setReferences((prev) => {
        if (selectedUiModeId === "start_end_frame") {
          const frames: [ReferenceSlot, ReferenceSlot] = [...prev.frames];
          staged.slice(0, 2 - index).forEach((slot, offset) => {
            const slotIndex = index + offset;
            if (slotIndex === 0 || slotIndex === 1) {
              revokeLocalPreviewUrl(frames[slotIndex]?.previewUrl);
              frames[slotIndex] = slot;
            }
          });
          return { ...prev, frames };
        }
        const current = [...prev.allPurpose[kind]];
        staged.forEach((slot, offset) => {
          revokeLocalPreviewUrl(current[index + offset]?.previewUrl);
          current[index + offset] = slot;
        });
        return {
          ...prev,
          allPurpose: {
            ...prev.allPurpose,
            [kind]: compactReferenceList(current),
          },
        };
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : `${kindGroupLabel(kind)}素材读取失败`);
    } finally {
      for (const key of Object.keys(fileInputRefs.current)) {
        if (fileInputRefs.current[key]) fileInputRefs.current[key]!.value = "";
      }
    }
  }

  async function ensureReferenceUrlsForGenerate(inputReferences: UnifiedVideoReference[]): Promise<UnifiedVideoReference[]> {
    const localRefs = inputReferences
      .map((ref) => ({ ref, slot: findReferenceSlotByUrl(ref.url) }))
      .filter((item): item is { ref: UnifiedVideoReference; slot: NonNullable<ReferenceSlot> } =>
        Boolean(item.slot?.file && item.ref.url.startsWith("blob:")),
      );
    if (localRefs.length === 0) return inputReferences;

    setIsUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("请先登录");

      const uploadedUrlByPreviewUrl = new Map<string, string>();
      const uniqueLocalSlots = Array.from(
        new Map(localRefs.map(({ slot }) => [slot.previewUrl, slot])).values(),
      );
      await Promise.all(
        uniqueLocalSlots.map(async (slot) => {
          if (!slot.file) return;
          const path = `ephemeral/${user.id}/video-inputs/${safeModelId}/${slot.kind}/${crypto.randomUUID()}.${mediaFileExtension(slot.file, slot.kind)}`;
          const form = new FormData();
          form.append("file", slot.file, slot.file.name || "reference");
          form.append("key", path);
          form.append("contentType", slot.mimeType);
          const response = await fetch("/api/media/upload", {
            method: "POST",
            body: form,
          });
          const data = (await response.json().catch(() => ({}))) as { publicUrl?: string; error?: string };
          if (!response.ok || !data.publicUrl) throw new Error(data.error || "素材上传失败");
          uploadedUrlByPreviewUrl.set(slot.previewUrl, data.publicUrl);
        }),
      );
      replaceLocalReferenceUrls(uploadedUrlByPreviewUrl);
      return inputReferences.map((ref) => {
        const uploadedUrl = uploadedUrlByPreviewUrl.get(ref.url);
        if (uploadedUrl) return { ...ref, url: uploadedUrl };
        const slot = findReferenceSlotByUrl(ref.url);
        const slotUploadedUrl = slot ? uploadedUrlByPreviewUrl.get(slot.previewUrl) : undefined;
        return slotUploadedUrl ? { ...ref, url: slotUploadedUrl } : ref;
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function applyProjectAssetAsReference(kind: Extract<ReferenceKind, "image" | "video">, index: number, asset: ProjectAsset) {
    const durationSeconds = kind === "video" ? await readVideoDuration(asset.primaryImageUrl) : undefined;
    const slot: NonNullable<ReferenceSlot> = {
      kind,
      url: asset.primaryImageUrl,
      previewUrl: asset.primaryImageUrl,
      label: asset.name,
      mimeType: mimeTypeFromAssetUrl(asset.primaryImageUrl, kind),
      durationSeconds,
    };
    setReferences((prev) => {
      if (selectedUiModeId === "start_end_frame") {
        const frames: [ReferenceSlot, ReferenceSlot] = [...prev.frames];
        if (index === 0 || index === 1) {
          revokeLocalPreviewUrl(frames[index]?.previewUrl);
          frames[index] = slot;
        }
        return { ...prev, frames };
      }
      const current = [...prev.allPurpose[kind]];
      revokeLocalPreviewUrl(current[index]?.previewUrl);
      current[index] = slot;
      return {
        ...prev,
        allPurpose: {
          ...prev.allPurpose,
          [kind]: compactReferenceList(current),
        },
      };
    });
    setProjectAssetPicker(null);
  }

  function clearReference(kind: ReferenceKind, index: number) {
    setReferences((prev) => {
      if (selectedUiModeId === "start_end_frame") {
        const frames: [ReferenceSlot, ReferenceSlot] = [...prev.frames];
        if (index === 0 || index === 1) {
          revokeLocalPreviewUrl(frames[index]?.previewUrl);
          frames[index] = null;
        }
        return { ...prev, frames };
      }
      revokeLocalPreviewUrl(prev.allPurpose[kind][index]?.previewUrl);
      return {
        ...prev,
        allPurpose: {
          ...prev.allPurpose,
          [kind]: prev.allPurpose[kind].filter((_, slotIndex) => slotIndex !== index),
        },
      };
    });
  }

  async function writeRecord(
    status: "success" | "error",
    finalPrompt: string,
    providerTaskId?: string,
    videoUrl?: string,
    message?: string,
    overrideModeId?: VideoGenerationModeId,
    overrideReferences?: UnifiedVideoReference[],
  ) {
    const targetModeId = overrideModeId ?? effectiveModeId;
    const record: VideoGalleryRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modelId: safeModelId,
      modelName: getVideoModelDefinition(safeModelId).label,
      modeId: targetModeId,
      modeName: VIDEO_MODE_LABELS[targetModeId],
      finalPrompt,
      userSlotInputs: [...slotInputs],
      aspectRatio: selectedAspectRatio,
      durationSeconds: selectedDuration,
      resolution: selectedResolution,
      providerTaskId,
      referencesSummary: (overrideReferences ?? buildReferences(selectedUiModeId, references)).map((item) => ({
        role: item.role,
        label: item.label || item.role,
        url: item.url,
      })),
      videoUrl,
      status,
      error: message,
    };
    try {
      const next = await prependVideoGalleryRecordApi(record, projectId);
      setRecords(next);
    } catch (e) {
      console.warn("[video] gallery save failed", e);
      setRecords((prev) => [record, ...prev]);
    }
  }

  async function handleGenerate() {
    setError("");

    if (selectableModelIds.length === 0 || !modelSupportsUiMode(safeModelId, selectedUiModeId)) {
      setError("当前模式暂无可用模型。");
      return;
    }

    const prompt = buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs).trim();
    if (!prompt) {
      setError("提示词不能为空。");
      return;
    }

    const mentionResolution = resolveAssetMentions(prompt, mentionCandidates);
    if (mentionResolution.missingMentions.length > 0) {
      setError(`素材引用失效：${mentionResolution.missingMentions.map((item) => `@${item.label}`).join("、")}。请重新选择或删除这些标签。`);
      return;
    }
    const cleanedPrompt = mentionResolution.prompt;

    const mentionedReferences: UnifiedVideoReference[] = mentionResolution.mentions
      .map((mention) => mention.candidate)
      .filter((candidate): candidate is AssetMentionCandidate => Boolean(candidate))
      .filter((candidate) => Boolean(candidate.url))
      .map((candidate) => ({
        role:
          candidate.role === "start_frame" || candidate.role === "end_frame" || candidate.role === "video_reference" || candidate.role === "motion_source_video"
            ? candidate.role
            : candidate.role === "audio_reference"
              ? "audio_reference"
            : "image_reference",
        url: candidate.url!,
        label: candidate.label,
        mimeType:
          candidate.role === "video_reference" || candidate.role === "motion_source_video"
            ? "video/mp4"
            : candidate.role === "audio_reference"
              ? "audio/mpeg"
              : "image/png",
        durationSeconds:
          candidate.role === "video_reference" || candidate.role === "motion_source_video"
            ? candidate.durationSeconds
            : undefined,
      }));
    let allReferences = mentionResolution.hasMentions ? mentionedReferences : buildReferences(selectedUiModeId, references);
    if (modeError && !mentionResolution.hasMentions) {
      setError(modeError);
      return;
    }
    if (selectedUiModeId === "multi_image_reference" && allReferences.length === 0) {
      setError("全能参考模式至少需要上传或 @ 引用一个图片、视频或音频素材。");
      return;
    }
    if (selectedUiModeId === "video_edit" && !allReferences.some((ref) => ref.role === "video_reference")) {
      setError("视频编辑模式需要上传或 @ 引用一个原视频素材。");
      return;
    }
    if (selectedUiModeId === "motion_control" && (!allReferences.some((ref) => ref.role === "start_frame") || !allReferences.some((ref) => ref.role === "motion_source_video"))) {
      setError("动作迁移模式需要上传或 @ 引用 1 张主体图和 1 个动作参考视频。");
      return;
    }
    const hasStartFrame = allReferences.some((ref) => ref.role === "start_frame");
    const hasEndFrame = allReferences.some((ref) => ref.role === "end_frame");
    const hasImageReferences = allReferences.some((ref) => ref.role === "image_reference");
    const hasVideoReferences = allReferences.some((ref) => ref.role === "video_reference");
    const hasAudioReferences = allReferences.some((ref) => ref.role === "audio_reference");
    const hasMotionSourceVideo = allReferences.some((ref) => ref.role === "motion_source_video");
    const imageReferenceCount = allReferences.filter((ref) => ref.role === "image_reference").length;

    let finalEffectiveModeId = effectiveModeId;
    if (mentionResolution.hasMentions && hasMotionSourceVideo) {
      finalEffectiveModeId = "motion_control";
    } else if (mentionResolution.hasMentions && (hasImageReferences || hasVideoReferences || hasAudioReferences)) {
      finalEffectiveModeId = "multi_image_reference";
    } else if (selectedUiModeId === "video_edit") {
      finalEffectiveModeId = "video_edit";
    } else if (selectedUiModeId === "motion_control") {
      finalEffectiveModeId = "motion_control";
    } else if (selectedUiModeId === "start_end_frame") {
      const { modeId: inferredMode } = inferEffectiveVideoMode(selectedUiModeId, hasStartFrame, hasEndFrame);
      finalEffectiveModeId = inferredMode;
    }

    if (finalEffectiveModeId === "start_end_frame" && !capabilities.supportedModes.includes("start_end_frame")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持首尾帧模式。`);
      return;
    }
    if (finalEffectiveModeId === "multi_image_reference" && !capabilities.supportedModes.includes("multi_image_reference")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持全能参考模式。`);
      return;
    }
    if (isHappyHorseVideoModel(safeModelId) && finalEffectiveModeId === "multi_image_reference" && (!hasImageReferences || hasVideoReferences || hasAudioReferences)) {
      setError("HappyHorse 全能参考只支持 1~9 张图片参考，不支持视频或音频参考。");
      return;
    }
    if (safeModelId === "kling-3.0" && finalEffectiveModeId === "multi_image_reference" && (!hasImageReferences || hasVideoReferences || hasAudioReferences)) {
      setError("Kling 3.0 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。");
      return;
    }
    if (isVeo31VideoModel(safeModelId) && finalEffectiveModeId === "multi_image_reference" && (!hasImageReferences || hasVideoReferences || hasAudioReferences)) {
      setError("Veo 3.1 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。");
      return;
    }
    if (finalEffectiveModeId === "video_edit" && !capabilities.supportedModes.includes("video_edit")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持视频编辑模式。`);
      return;
    }
    if (finalEffectiveModeId === "motion_control" && !capabilities.supportedModes.includes("motion_control")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持动作迁移模式。`);
      return;
    }
    const finalParameterCapabilities = getVideoParameterCapabilities(safeModelId, finalEffectiveModeId, allReferences);
    const finalDurationCapability = finalParameterCapabilities.durationCapability;
    const requestDuration = finalParameterCapabilities.supportsDuration && finalDurationCapability
      ? selectedDuration
      : 0;
    const requestAspectRatio = finalParameterCapabilities.supportsAspectRatio
      ? selectedAspectRatio
      : undefined;
    if (finalParameterCapabilities.supportsDuration && finalDurationCapability && !isVideoDurationSupported(selectedDuration, finalDurationCapability)) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持 ${selectedDuration}s 时长。`);
      setSelectedDuration(normalizeVideoDuration(selectedDuration, finalDurationCapability));
      return;
    }
    if (finalParameterCapabilities.supportsAspectRatio && requestAspectRatio && !finalParameterCapabilities.aspectRatios.includes(requestAspectRatio)) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持 ${requestAspectRatio} 比例。`);
      setSelectedAspectRatio(finalParameterCapabilities.aspectRatios[0] ?? videoWorkspace.uiDefaults.defaultAspectRatio);
      return;
    }
    if (safeModelId === "happyhorse-1.0" && finalEffectiveModeId === "video_edit" && imageReferenceCount > 5) {
      setError("HappyHorse 1.0 视频编辑最多支持 5 张参考图。");
      return;
    }

    const liveSnapshot = await fetchWorkspaceSnapshot();
    const liveModel = liveSnapshot.videoWorkspace.models[safeModelId];
    if (!isVideoModelConfiguredForMode(liveModel, finalEffectiveModeId)) {
      setError(missingVideoConfigMessage(liveModel.label || safeModelId, finalEffectiveModeId));
      return;
    }

    const requestId = crypto.randomUUID();
    setPendingGenerations((prev) => [
      ...prev,
      {
        id: requestId,
        createdAt: new Date().toISOString(),
        modelId: safeModelId,
        modelName: getVideoModelDefinition(safeModelId).label,
        modeId: finalEffectiveModeId,
        modeName: VIDEO_MODE_LABELS[finalEffectiveModeId],
        finalPrompt: cleanedPrompt,
        durationSeconds: selectedDuration,
        resolution: selectedResolution,
        previewUrl: allReferences.find((ref) => ref.role === "start_frame" || ref.role === "image_reference" || ref.role === "video_reference" || ref.role === "motion_source_video")?.url,
      },
    ]);
    try {
      allReferences = await ensureReferenceUrlsForGenerate(allReferences);
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          modelId: safeModelId,
          modeId: finalEffectiveModeId,
          prompt: cleanedPrompt,
          duration: requestDuration,
          aspectRatio: requestAspectRatio,
          resolution: selectedResolution,
          soundEnabled: finalParameterCapabilities.soundControl ? selectedSoundEnabled : undefined,
          grokImagineMode: isGrokImagineVideoModel(safeModelId) ? selectedGrokMode : undefined,
          references: allReferences,
          projectId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        reasonCode?: string;
        userMessage?: string;
        providerTaskId?: string;
        videoUrl?: string;
      };
      if (!res.ok) {
        throw new Error(formatGenerationErrorForDisplay({
          code: data.code,
          reasonCode: data.reasonCode,
          userMessage: data.userMessage,
          fallbackCode: `HTTP_${res.status}`,
        }));
      }
      const videoUrl = typeof data.videoUrl === "string" ? data.videoUrl.trim() : "";
      if (!videoUrl) throw new Error("服务器未返回视频地址");
      setResultUrl(videoUrl);
      await writeRecord("success", cleanedPrompt, data.providerTaskId, videoUrl, undefined, finalEffectiveModeId, allReferences);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "生视频失败";
      setError(message);
    } finally {
      setPendingGenerations((prev) => prev.filter((item) => item.id !== requestId));
    }
  }

  function applyHistoryRecord(record: VideoGalleryRecord) {
    setError("");
    const nextUiModeId = uiModeFromRecord(record.modeId);
    setSelectedUiModeId(nextUiModeId);
    setSelectedModelId(modelSupportsUiMode(record.modelId, nextUiModeId) ? record.modelId : videoModelsForUiMode(nextUiModeId)[0] ?? videoWorkspace.uiDefaults.defaultModelId);
    if (record.aspectRatio) setSelectedAspectRatio(record.aspectRatio);
    if (record.durationSeconds) setSelectedDuration(record.durationSeconds);
    if (record.resolution) setSelectedResolution(record.resolution);
    setResultUrl(record.videoUrl || "");
    const nextReferences = createEmptyReferences();
    (record.referencesSummary ?? []).forEach((item, index) => {
      const slotIndex = historySlotKey(record.modeId, item.role, index);
      if (slotIndex === null || !item.url) return;
      const slot: NonNullable<ReferenceSlot> = {
        kind: slotIndex.kind === "frame" ? "image" : slotIndex.kind,
        url: item.url,
        previewUrl: item.url,
        label: item.label,
        mimeType:
          item.role === "video_reference" || item.role === "motion_source_video"
            ? "video/mp4"
            : item.role === "audio_reference"
              ? "audio/mpeg"
              : "image/png",
      };
      if (slotIndex.kind === "frame") nextReferences.frames[slotIndex.index] = slot;
      else nextReferences.allPurpose[slotIndex.kind][slotIndex.index] = slot;
    });
    setReferences((prev) => {
      revokeReferencePreviews(prev);
      return {
        ...nextReferences,
        allPurpose: {
          image: compactReferenceList(nextReferences.allPurpose.image),
          video: compactReferenceList(nextReferences.allPurpose.video),
          audio: compactReferenceList(nextReferences.allPurpose.audio),
        },
      };
    });
    const template = selectedPreset.promptTemplate;
    const n = composerSlotCountForTemplate(template);
    const slots =
      record.userSlotInputs && record.userSlotInputs.length > 0
        ? normalizeSlotInputsToLength(record.userSlotInputs, n)
        : normalizeSlotInputsToLength([record.finalPrompt], n);
    setSlotInputs(slots);
  }

  const toolbarPickerOptions = toolbarPickerMenu
    ? toolbarPickerMenu.kind === "mode"
      ? UI_MODES.map((mode) => ({
          id: mode.id,
          label: mode.label,
          active: selectedUiModeId === mode.id,
          disabled: false,
          title: undefined,
          onSelect: () => setSelectedUiModeId(mode.id),
        }))
        : toolbarPickerMenu.kind === "model"
          ? (selectableModelIds.length > 0 ? selectableModelIds.map((id) => ({
            id,
            label: getVideoModelDefinition(id).label,
            active: safeModelId === id,
            disabled: false,
            title: undefined,
            onSelect: () => setSelectedModelId(id),
          })) : [{
            id: "no-model",
            label: "当前模式暂无可用模型",
            active: false,
            disabled: true,
            title: undefined,
            onSelect: () => {},
          }])
        : toolbarPickerMenu.kind === "grokMode"
          ? GROK_IMAGINE_MODES.map((mode) => ({
              id: mode.id,
              label: mode.label,
              active: selectedGrokMode === mode.id,
              disabled: false,
              title: undefined,
              onSelect: () => setSelectedGrokMode(mode.id),
            }))
        : toolbarPickerMenu.kind === "ratio"
          ? parameterCapabilities.aspectRatios.map((ratio) => ({
              id: ratio,
              label: ratio,
              previewAspectRatio: ratioPreviewAspect(ratio),
              previewStyle: ratioPreviewStyle(ratio),
              active: selectedAspectRatio === ratio,
              disabled: false,
              title: undefined,
              onSelect: () => setSelectedAspectRatio(ratio),
            }))
          : toolbarPickerMenu.kind === "duration"
            ? durationCapability ? durationPresets(durationCapability).map((duration) => ({
                id: String(duration),
                label: `${duration}s`,
                progressStyle: durationProgressStyle(duration, durationCapability),
                active: selectedDuration === duration,
                disabled: durationCapability.type === "range" ? !isVideoDurationSupported(duration, durationCapability) : false,
                title: durationCapability.type === "recommended" ? "推荐时长" : undefined,
                onSelect: () => setSelectedDuration(duration),
              })) : []
            : parameterCapabilities.resolutions.map((resolution) => ({
                id: resolution,
                label: resolution,
                active: selectedResolution === resolution,
                disabled: false,
                title: undefined,
                onSelect: () => setSelectedResolution(resolution),
              }))
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
        <aside className={styles.modePanel} style={presetRailStyle}>
          <div className={styles.modeColumn}>
            <div className={styles.rail}>
              <div className={styles.railFrame}>
                <div className={styles.railLabel}>收藏的预设</div>
                <div className={styles.scrollWrap}>
                  <div className={styles.scroll}>
                    <div className={styles.list}>
                      {presetRailItems.length === 0 ? (
                        <div className={styles.emptyRail}>暂无预设</div>
                      ) : (
                        presetRailItems.map((preset) => {
                          const active = selectedPresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setSelectedPresetId(preset.id)}
                              className={[styles.modeItem, active ? styles.modeItemActive : ""].filter(Boolean).join(" ")}
                              aria-label={preset.label}
                            >
                              {preset.coverUrl ? (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={preset.coverUrl} alt="" className={styles.modeCoverImage} />
                                  <span className={[styles.modeMeta, active ? styles.modeMetaActive : ""].filter(Boolean).join(" ")}>
                                    {preset.label}
                                  </span>
                                </>
                              ) : (
                                <span className={styles.modeCoverFallback}>{preset.label}</span>
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
              <div className={styles.resultClip}>
                {resultUrl ? (
                  <InlineVideoPlayer
                    src={resultUrl}
                    title="生成结果视频"
                    suggestedFileName="生成视频.mp4"
                    videoClassName={styles.resultVideo}
                  />
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
            <div className={styles.rail}>
              <div className={styles.railFrame}>
                <div className={styles.railLabel}>生成记录</div>
                <div className={[styles.scrollWrap, sidebarHistoryRecords.length > 7 ? styles.scrollWrapFaded : ""].filter(Boolean).join(" ")}>
                  <div ref={historyScrollRef} className={styles.scroll}>
                    <div className={styles.list}>
                      {sidebarHistoryRecords.length === 0 ? (
                        <div className={styles.emptyRail}>暂无记录</div>
                      ) : (
                        sidebarHistoryRecords.map((item) => item.kind === "pending" ? (
                          <div key={item.pending.id} className={[styles.historyItem, styles.historyItemPending].join(" ")} role="status" aria-live="polite">
                            {item.pending.previewUrl ? <video src={item.pending.previewUrl} muted playsInline preload="metadata" /> : null}
                            {!item.pending.previewUrl ? <span className={styles.historyPendingBlank} aria-hidden /> : null}
                            <span className={styles.historyPendingSpinner} aria-hidden />
                            <span className={styles.historyMeta}>
                              {item.pending.modeName} · {item.pending.durationSeconds}s
                            </span>
                          </div>
                        ) : (
                          <button key={item.record.id} type="button" onClick={() => applyHistoryRecord(item.record)} className={styles.historyItem}>
                            {item.record.videoUrl ? <video src={item.record.videoUrl} muted playsInline preload="metadata" /> : null}
                            <span className={styles.historyMeta}>
                              {item.record.modeName} · {item.record.durationSeconds}s
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
              {selectedUiModeId === "start_end_frame" ? (
                references.frames.slice(0, capabilities.supportsFirstLastFrames ? 2 : 1).map((slot, index) => (
                  <div
                    key={`frame-${index}`}
                    className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void uploadReferenceFiles("image", index, e.dataTransfer.files);
                    }}
                  >
                    <input
                      ref={(node) => {
                        fileInputRefs.current[`frame:${index}`] = node;
                      }}
                      className={styles.hiddenInput}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        void uploadReferenceFiles("image", index, e.target.files);
                      }}
                    />
                    <button
                      type="button"
                      className={styles.refSlotButton}
                      aria-label={`${slotLabel(selectedUiModeId, index)}，选择参考图来源`}
                      onClick={(event) => {
                        const anchor = menuAnchorFromElement(event.currentTarget);
                        setReferenceUploadMenu((current) =>
                          current?.kind === "image" && current.index === index && current.inputKey === `frame:${index}`
                            ? null
                            : {
                                kind: "image",
                                index,
                                inputKey: `frame:${index}`,
                                projectAssetKind: "image",
                                anchor,
                              },
                        );
                      }}
                    >
                      {slot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.previewUrl} alt={slot.label} />
                      ) : (
                        <span className={styles.refEmptyContent}>
                          <span className={styles.refSlotIndex}>{slotLabel(selectedUiModeId, index)}</span>
                        </span>
                      )}
                    </button>
                    {slot ? (
                      <button type="button" onClick={() => clearReference("image", index)} className={styles.deleteRef} aria-label="移除参考图">
                        ×
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                referenceKindsForUiMode(selectedUiModeId, safeModelId).map((kind) => (
                  <div key={kind} className={styles.refGroup} aria-label={`${kindGroupLabel(kind)}素材`}>
                    {[...references.allPurpose[kind], null].map((slot, index) => (
                      <div
                        key={`${kind}-${index}`}
                        className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          void uploadReferenceFiles(kind, index, e.dataTransfer.files);
                        }}
                      >
                        <input
                          ref={(node) => {
                            fileInputRefs.current[`${kind}:${index}`] = node;
                          }}
                          className={styles.hiddenInput}
                          type="file"
                          accept={kindAccept(kind)}
                          multiple
                          onChange={(e) => {
                            void uploadReferenceFiles(kind, index, e.target.files);
                          }}
                        />
                        <button
                          type="button"
                          className={styles.refSlotButton}
                          aria-label={`${kindSlotLabel(kind, index)}，选择${kindGroupLabel(kind)}素材来源`}
                          onClick={(event) => {
                            const anchor = menuAnchorFromElement(event.currentTarget);
                            const [projectAssetKind] = assetPickerKindsForReference(kind);
                            const inputKey = `${kind}:${index}`;
                            setReferenceUploadMenu((current) =>
                              current?.kind === kind && current.index === index && current.inputKey === inputKey
                                ? null
                                : {
                                    kind,
                                    index,
                                    inputKey,
                                    projectAssetKind: projectAssetKind ?? null,
                                    anchor,
                                  },
                            );
                          }}
                        >
                          {slot ? (
                            kind === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slot.previewUrl} alt={slot.label} />
                            ) : kind === "video" ? (
                              <video src={slot.previewUrl} muted playsInline preload="metadata" />
                            ) : (
                              <span className={styles.refMediaGlyph}>音频</span>
                            )
                          ) : (
                            <span className={styles.refEmptyContent}>
                              <span className={styles.refSlotIndex}>{selectedUiModeId === "video_edit" && kind === "video" && index === 0 ? "原视频" : selectedUiModeId === "motion_control" && kind === "image" ? "主体图" : selectedUiModeId === "motion_control" && kind === "video" ? "动作视频" : kindSlotLabel(kind, index)}</span>
                            </span>
                          )}
                        </button>
                        {slot ? (
                          <button type="button" onClick={() => clearReference(kind, index)} className={styles.deleteRef} aria-label={`移除${kindGroupLabel(kind)}素材`}>
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            <WorkspaceModeDock />
          </div>

          <div className={styles.composer}>
            <div
              className={styles.promptSlotGrid}
              style={{ gridTemplateColumns: `repeat(${slotInputs.length}, minmax(0, 1fr))` }}
            >
              {slotInputs.map((value, index) => (
                <div key={index} className={styles.promptSlotPane}>
                  <AssetMentionEditor
                    value={value}
                    onValueChange={(newVal) =>
                      setSlotInputs((prev) => {
                        const next = [...prev];
                        next[index] = newVal;
                        return next;
                      })
                    }
                    candidates={mentionCandidates}
                    placeholder={composerPlaceholder(placeholderOccurrences, index)}
                    placeholderClassName={styles.promptPlaceholder}
                    className={styles.promptInput}
                  />
                </div>
              ))}
            </div>

            <div className={styles.toolbar}>
              <button
                type="button"
                className={[styles.composerPickerButton, styles.composerPickerMode].join(" ")}
                aria-haspopup="menu"
                aria-expanded={toolbarPickerMenu?.kind === "mode"}
                onClick={(event) => {
                  const anchor = menuAnchorFromElement(event.currentTarget);
                  setToolbarPickerMenu((current) => current?.kind === "mode" ? null : { kind: "mode", anchor });
                }}
              >
                <span className={styles.composerPickerLabel}>{UI_MODES.find((mode) => mode.id === selectedUiModeId)?.label ?? "首尾帧"}</span>
              </button>

              <button
                type="button"
                className={[styles.composerPickerButton, styles.composerPickerModel].join(" ")}
                aria-haspopup="menu"
                aria-expanded={toolbarPickerMenu?.kind === "model"}
                onClick={(event) => {
                  const anchor = menuAnchorFromElement(event.currentTarget);
                  setToolbarPickerMenu((current) => current?.kind === "model" ? null : { kind: "model", anchor });
                }}
              >
                <span className={styles.composerPickerLabel}>{getVideoModelDefinition(safeModelId).label}</span>
              </button>

              {isGrokImagineVideoModel(safeModelId) ? (
                <button
                  type="button"
                  className={[styles.composerPickerButton, styles.composerPickerMode].join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={toolbarPickerMenu?.kind === "grokMode"}
                  title="Grok Imagine 生成风格"
                  onClick={(event) => {
                    const anchor = menuAnchorFromElement(event.currentTarget);
                    setToolbarPickerMenu((current) => current?.kind === "grokMode" ? null : { kind: "grokMode", anchor });
                  }}
                >
                  <span className={styles.composerPickerLabel}>{GROK_IMAGINE_MODES.find((mode) => mode.id === selectedGrokMode)?.label ?? "普通"}</span>
                </button>
              ) : null}

              {parameterCapabilities.supportsAspectRatio ? (
                <button
                  type="button"
                  className={[styles.composerPickerButton, styles.composerPickerRatio].join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={toolbarPickerMenu?.kind === "ratio"}
                  onClick={(event) => {
                    const anchor = menuAnchorFromElement(event.currentTarget);
                    setToolbarPickerMenu((current) => current?.kind === "ratio" ? null : { kind: "ratio", anchor });
                  }}
                >
                  <span className={styles.composerPickerLabel}>{selectedAspectRatio}</span>
                </button>
              ) : null}

              {parameterCapabilities.supportsDuration && durationCapability ? (
                <button
                  type="button"
                  className={[styles.composerPickerButton, styles.composerPickerDuration].join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={toolbarPickerMenu?.kind === "duration"}
                  onClick={(event) => {
                    const anchor = menuAnchorFromElement(event.currentTarget);
                    setToolbarPickerMenu((current) => current?.kind === "duration" ? null : { kind: "duration", anchor });
                  }}
                >
                  <span className={styles.composerPickerLabel}>{selectedDuration}s</span>
                </button>
              ) : null}

              <button
                type="button"
                className={[styles.composerPickerButton, styles.composerPickerResolution].join(" ")}
                aria-haspopup="menu"
                aria-expanded={toolbarPickerMenu?.kind === "resolution"}
                onClick={(event) => {
                  const anchor = menuAnchorFromElement(event.currentTarget);
                  setToolbarPickerMenu((current) => current?.kind === "resolution" ? null : { kind: "resolution", anchor });
                }}
              >
                <span className={styles.composerPickerLabel}>{selectedResolution}</span>
              </button>

              <div className={styles.toolbarActions}>
                {soundControl ? (
                  <button
                    type="button"
                    className={[styles.freeModeToggle, selectedSoundEnabled ? styles.freeModeToggleActive : ""].filter(Boolean).join(" ")}
                    aria-pressed={selectedSoundEnabled}
                    title={soundControl.costHint}
                    onClick={() => setSelectedSoundEnabled((value) => !value)}
                  >
                    <span className={styles.freeSwitchTrack} aria-hidden>
                      <span className={styles.freeSwitchThumb} />
                    </span>
                    <span>{soundControl.label}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={[styles.freeModeToggle, !isFreeMode ? styles.freeModeToggleActive : ""].filter(Boolean).join(" ")}
                  aria-pressed={!isFreeMode}
                  title="启用预设提示词"
                  onClick={() => {
                    setSelectedPresetId(isFreeMode ? presetRailItems[0]?.id ?? "free" : "free");
                  }}
                >
                  <span className={styles.freeSwitchTrack} aria-hidden>
                    <span className={styles.freeSwitchThumb} />
                  </span>
                  <span>预设</span>
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isUploading || creditBlocked}
                  className={styles.generate}
                  title={creditQuote.error || (creditQuote.enough === false ? "积分余额不足" : "生成")}
                >
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
          </div>
        </section>
      </section>

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
                      {allModes.find((m) => m.id === selectedPresetId)?.label ?? selectedPresetId}
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
                  {buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs) || "（当前提示词为空）"}
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
        activePresetId={selectedPresetId}
        allowedApplyKinds={["video"]}
        onApplyPreset={selectPromptPreset}
        onFavoriteChange={(preset) => {
          if (preset.kind === "video") loadVideoPromptPresets();
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
                  toolbarPickerMenu.kind === "duration" ? styles.toolbarPickerMenuDuration : "",
                ].filter(Boolean).join(" ")}
                style={{
                  left: toolbarPickerMenu.anchor.left + toolbarPickerMenu.anchor.width / 2,
                  top: toolbarPickerMenu.anchor.top,
                } as CSSProperties}
                role="menu"
              >
                {toolbarPickerMenu.kind === "duration" && durationCapability?.type === "range" ? (
                  <div className={styles.toolbarDurationRange} role="presentation">
                    <div className={styles.toolbarDurationRangeHead}>
                      <span>{durationCapability.min}s</span>
                      <strong>{selectedDuration}s</strong>
                      <span>{durationCapability.max}s</span>
                    </div>
                    <input
                      type="range"
                      min={durationCapability.min}
                      max={durationCapability.max}
                      step={durationCapability.step}
                      value={selectedDuration}
                      aria-label="视频时长"
                      className={styles.toolbarDurationSlider}
                      onChange={(event) => {
                        setSelectedDuration(normalizeVideoDuration(Number(event.currentTarget.value), durationCapability));
                      }}
                    />
                  </div>
                ) : null}
                {toolbarPickerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={[
                      styles.toolbarPickerOption,
                      toolbarPickerMenu.kind === "ratio" ? styles.toolbarPickerOptionRatio : "",
                      toolbarPickerMenu.kind === "duration" ? styles.toolbarPickerOptionDuration : "",
                      option.active ? styles.toolbarPickerOptionActive : "",
                    ].filter(Boolean).join(" ")}
                    role="menuitemradio"
                    aria-checked={option.active}
                    disabled={option.disabled}
                    title={option.title}
                    onClick={() => {
                      if (option.disabled) return;
                      option.onSelect();
                      setToolbarPickerMenu(null);
                    }}
                  >
                    {toolbarPickerMenu.kind === "ratio" ? (
                      <>
                        <span
                          className={styles.toolbarRatioPreview}
                          style={"previewStyle" in option ? (option.previewStyle as CSSProperties) : undefined}
                          aria-hidden
                        />
                        <span className={styles.toolbarRatioLabel}>{option.label}</span>
                      </>
                    ) : toolbarPickerMenu.kind === "duration" ? (
                      <>
                        <span
                          className={styles.toolbarDurationBar}
                          style={"progressStyle" in option ? (option.progressStyle as CSSProperties) : undefined}
                          aria-hidden
                        />
                        <span className={styles.toolbarDurationLabel}>{option.label}</span>
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
      {portalMounted && referenceUploadMenu
        ? createPortal(
            <div
              className={styles.refUploadMenu}
              style={{
                left: referenceUploadMenu.anchor.left + referenceUploadMenu.anchor.width / 2,
                top: referenceUploadMenu.anchor.top,
              } as CSSProperties}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  const { inputKey } = referenceUploadMenu;
                  setReferenceUploadMenu(null);
                  fileInputRefs.current[inputKey]?.click();
                }}
              >
                本地上传
              </button>
              <button
                type="button"
                disabled={!projectId || !referenceUploadMenu.projectAssetKind}
                onClick={() => {
                  const { projectAssetKind, index } = referenceUploadMenu;
                  if (!projectAssetKind) return;
                  setReferenceUploadMenu(null);
                  setProjectAssetPicker({ kind: projectAssetKind, index });
                }}
              >
                项目素材
              </button>
            </div>,
            document.body,
          )
        : null}
      {portalMounted && projectId && projectAssetPicker
        ? createPortal(
            <ProjectAssetPickerDialog
              projectId={projectId}
              allowedKinds={[projectAssetPicker.kind]}
              onClose={() => setProjectAssetPicker(null)}
              onSelect={(asset) => void applyProjectAssetAsReference(projectAssetPicker.kind, projectAssetPicker.index, asset)}
            />,
            document.body,
          )
        : null}
    </main>
  );
}
