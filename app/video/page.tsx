"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./video-page.module.css";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { mediaContentType, mediaFileExtension, mediaFileMatchesKind } from "@/lib/media-file";
import {
  fetchVideoGalleryRecords,
  fetchWorkspaceSnapshot,
  prependVideoGalleryRecordApi,
} from "@/lib/workspace-api";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { fetchSitePromptPresets, setSitePromptPresetFavorite } from "@/lib/prompt-preset-api-client";
import { AssetMentionEditor } from "@/components/AssetMentionEditor";
import { resolveAssetMentions, type AssetMentionCandidate } from "@/lib/asset-mentions";
import {
  VIDEO_MODEL_ORDER,
  VIDEO_MODE_LABELS,
  VIDEO_MODES,
  buildVideoPromptFromSlots,
  composerSlotCountForTemplate,
  extractPromptPlaceholderOccurrences,
  getVideoCapabilities,
  getVideoModelDefinition,
  placeholderInnerHint,
  type UnifiedVideoReference,
  type VideoAspectRatio,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
  type UiVideoModeId,
  UI_VIDEO_MODES as UI_MODES,
  inferEffectiveVideoMode,
  VideoWorkspaceSettings,
} from "@/lib/video-workspace";

const MEDIA_BUCKET = "generated-images";

type ReferenceKind = "image" | "video" | "audio";
type ReferenceSlot = { kind: ReferenceKind; url: string; previewUrl: string; label: string; mimeType: string } | null;
type ReferenceCollections = Record<ReferenceKind, NonNullable<ReferenceSlot>[]>;
type ReferenceState = {
  frames: [ReferenceSlot, ReferenceSlot];
  allPurpose: ReferenceCollections;
};
type PresetRailItem = {
  id: string;
  label: string;
  promptTemplate: string;
  coverUrl: string;
};

const FREE_PRESET: PresetRailItem = { id: "free", label: "自由模式", promptTemplate: "", coverUrl: "" };
const VIDEO_UI_MODEL_ORDER: VideoModelId[] = VIDEO_MODEL_ORDER.filter((id) => id !== "kling-2.6-motion");

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
  return modeId === "multi_image_reference" ? "multi_image_reference" : "start_end_frame";
}

function effectiveModeFromUi(
  uiModeId: UiVideoModeId,
  references: ReferenceState,
): { modeId: VideoGenerationModeId; error?: string } {
  return inferEffectiveVideoMode(uiModeId, Boolean(references.frames[0]), Boolean(references.frames[1]));
}

function slotLabel(uiModeId: UiVideoModeId, index: number): string {
  if (uiModeId === "start_end_frame") return index === 0 ? "首帧" : "尾帧";
  return `图${index + 1}`;
}

function referenceRoleForKind(kind: ReferenceKind): UnifiedVideoReference["role"] {
  if (kind === "image") return "image_reference";
  if (kind === "video") return "video_reference";
  return "audio_reference";
}

function buildReferences(uiModeId: UiVideoModeId, references: ReferenceState): UnifiedVideoReference[] {
  if (uiModeId === "multi_image_reference") {
    return REFERENCE_KINDS.flatMap((kind) =>
      references.allPurpose[kind].map((slot, index) => ({
        role: referenceRoleForKind(kind),
        url: slot.url,
        label: kindSlotLabel(kind, index),
        mimeType: slot.mimeType,
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

function historySlotKey(modeId: VideoGenerationModeId, role: UnifiedVideoReference["role"], index: number): { kind: "frame"; index: 0 | 1 } | { kind: ReferenceKind; index: number } | null {
  if (modeId === "multi_image_reference") {
    if (role === "image_reference") return { kind: "image", index };
    if (role === "video_reference") return { kind: "video", index };
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
    description: favoriteOverlay?.description,
    isFavorite: Boolean(favoriteOverlay?.isFavorite),
  };
}

export default function VideoPage() {
  const { videoWorkspace, workspaceReady } = useApiSettings();
  const [records, setRecords] = useState<VideoGalleryRecord[]>([]);
  const [selectedUiModeId, setSelectedUiModeId] = useState<UiVideoModeId>("start_end_frame");
  const [selectedPresetId, setSelectedPresetId] = useState("free");
  const [selectedModelId, setSelectedModelId] = useState<VideoModelId>(videoWorkspace.uiDefaults.defaultModelId);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<VideoAspectRatio>(videoWorkspace.uiDefaults.defaultAspectRatio);
  const [selectedDuration, setSelectedDuration] = useState<number>(videoWorkspace.uiDefaults.defaultDurationSeconds);
  const [selectedResolution, setSelectedResolution] = useState<VideoResolution>(videoWorkspace.uiDefaults.defaultResolution);
  const [slotInputs, setSlotInputs] = useState<string[]>([""]);
  const [references, setReferences] = useState<ReferenceState>(createEmptyReferences);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [promptPresets, setPromptPresets] = useState<SitePromptPreset[]>([]);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [promptPreviewOpen, setPromptPreviewOpen] = useState(false);
  const [promptPreviewPreset, setPromptPreviewPreset] = useState<SitePromptPreset | null>(null);
  const [presetLibraryError, setPresetLibraryError] = useState("");
  const [favoriteSavingById, setFavoriteSavingById] = useState<Record<string, boolean>>({});
  const [promptCopied, setPromptCopied] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);

  const safeModelId = VIDEO_UI_MODEL_ORDER.includes(selectedModelId)
    ? selectedModelId
    : videoWorkspace.uiDefaults.defaultModelId;
  const capabilities = getVideoCapabilities(safeModelId);
  const { modeId: effectiveModeId, error: modeError } = useMemo(
    () => effectiveModeFromUi(selectedUiModeId, references),
    [selectedUiModeId, references],
  );

  const allModes = useMemo(
    () => [...VIDEO_MODES, ...(videoWorkspace.customModes ?? [])].reverse(),
    [videoWorkspace.customModes],
  );
  const promptPresetById = useMemo(() => new Map(promptPresets.map((preset) => [preset.id, preset])), [promptPresets]);
  const displayedPromptPresets = useMemo(
    () =>
      allModes
        .filter((mode) => !VIDEO_MODES.some((base) => base.id === mode.id))
        .map((mode) => workspaceModeToPromptPreset(mode, videoWorkspace, promptPresetById.get(mode.id))),
    [allModes, promptPresetById, videoWorkspace],
  );
  const favoritePresetIds = useMemo(
    () => new Set(displayedPromptPresets.filter((preset) => preset.isFavorite).map((preset) => preset.id)),
    [displayedPromptPresets],
  );

  const presetRailItems = useMemo<PresetRailItem[]>(
    () => {
      const customRows = (videoWorkspace.customModes ?? []).map((mode) => ({
        id: mode.id,
        label: mode.label,
      }));
      return customRows
        .filter((item) => favoritePresetIds.has(item.id))
        .reverse()
        .map((item) => ({
          id: item.id,
          label: item.label,
          promptTemplate: videoWorkspace.prompts[item.id] ?? "",
          coverUrl: videoWorkspace.coverImageUrlByMode?.[item.id]?.trim() ?? "",
        }));
    },
    [videoWorkspace.coverImageUrlByMode, videoWorkspace.customModes, videoWorkspace.prompts, favoritePresetIds],
  );

  const selectedPreset = selectedPresetId === "free" ? FREE_PRESET : presetRailItems.find((item) => item.id === selectedPresetId) ?? FREE_PRESET;
  const isFreeMode = selectedPreset.id === "free";
  const placeholderOccurrences = useMemo(
    () => extractPromptPlaceholderOccurrences(selectedPreset.promptTemplate),
    [selectedPreset.promptTemplate],
  );
  const composerSlotCount = composerSlotCountForTemplate(selectedPreset.promptTemplate);
  const modelReady = Boolean(
    videoWorkspace.models[safeModelId]?.baseUrl.trim() &&
      videoWorkspace.models[safeModelId]?.apiKey.trim() &&
      videoWorkspace.models[safeModelId]?.apiModelName.trim(),
  );
  const sidebarHistoryRecords = useMemo(() => {
    const success = records.filter((item) => item.status === "success" && Boolean(item.videoUrl)).slice(0, 24);
    return success.slice().reverse();
  }, [records]);

  useEffect(() => {
    if (!workspaceReady) return;
    void fetchVideoGalleryRecords()
      .then((rows) => setRecords(rows))
      .catch((e) => console.warn("[video] gallery load failed", e));
  }, [workspaceReady]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!presetLibraryOpen && !promptPreviewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPresetLibraryOpen(false);
      if (e.key === "Escape") setPromptPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presetLibraryOpen, promptPreviewOpen]);

  useEffect(() => {
    if (!promptPreviewOpen) setPromptCopied(false);
  }, [promptPreviewOpen]);

  useEffect(() => {
    if (!promptPreviewOpen) setPromptPreviewPreset(null);
  }, [promptPreviewOpen]);

  useEffect(() => {
    if (!presetLibraryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presetLibraryOpen]);

  useEffect(() => {
    if (!workspaceReady) return;
    void fetchSitePromptPresets("video")
      .then((presets) => {
        setPromptPresets(presets);
        setPresetLibraryError("");
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "无法加载提示词预设";
        setPresetLibraryError(message);
      });
  }, [workspaceReady]);

  async function copyPromptToClipboard() {
    const text = promptPreviewPreset?.promptTemplate || buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs) || "";
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

  function selectPromptPreset(presetId: string) {
    const mode = allModes.find((item) => item.id === presetId);
    if (!mode) {
      setPresetLibraryError("这个预设还没有同步到视频工作台，请刷新后再试。");
      return;
    }
    setError("");
    setSelectedPresetId(mode.id);
  }

  async function togglePromptPresetFavorite(preset: SitePromptPreset) {
    const nextFavorite = !preset.isFavorite;
    setFavoriteSavingById((prev) => ({ ...prev, [preset.id]: true }));
    setPromptPresets((prev) => {
      if (prev.some((item) => item.id === preset.id)) {
        return prev.map((item) => (item.id === preset.id ? { ...item, isFavorite: nextFavorite } : item));
      }
      return [{ ...preset, isFavorite: nextFavorite }, ...prev];
    });
    try {
      await setSitePromptPresetFavorite(preset.id, nextFavorite);
      const refreshed = await fetchSitePromptPresets("video");
      setPromptPresets(refreshed);
      setPresetLibraryError("");
    } catch (e) {
      setPromptPresets((prev) =>
        prev
          .map((item) => (item.id === preset.id ? { ...item, isFavorite: preset.isFavorite } : item))
          .filter((item) => item.id !== preset.id || promptPresetById.has(item.id)),
      );
      setPresetLibraryError(e instanceof Error ? e.message : "收藏更新失败");
    } finally {
      setFavoriteSavingById((prev) => {
        const next = { ...prev };
        delete next[preset.id];
        return next;
      });
    }
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
    REFERENCE_KINDS.forEach((kind) => {
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
        });
      });
    });
    return candidates;
  }, [references, selectedUiModeId]);

  useEffect(() => {
    setSelectedModelId((current) =>
      VIDEO_UI_MODEL_ORDER.includes(current) ? current : videoWorkspace.uiDefaults.defaultModelId,
    );
  }, [videoWorkspace.uiDefaults.defaultModelId]);

  useEffect(() => {
    setSelectedAspectRatio((current) =>
      capabilities.aspectRatios.includes(current) ? current : capabilities.aspectRatios[0],
    );
    setSelectedDuration((current) =>
      capabilities.durations.includes(current) ? current : capabilities.durations[0],
    );
    setSelectedResolution((current) =>
      capabilities.resolutions.includes(current) ? current : capabilities.resolutions[0],
    );
    if (selectedUiModeId === "multi_image_reference" && !capabilities.supportedModes.includes("multi_image_reference")) {
      setSelectedUiModeId("start_end_frame");
    }
  }, [capabilities, safeModelId, selectedUiModeId]);

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
    setIsUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("请先登录");

      const uploaded = await Promise.all(
        accepted.map(async (file) => {
          const contentType = mediaContentType(file, kind);
          const path = `${user.id}/video-inputs/${safeModelId}/${kind}/${crypto.randomUUID()}.${mediaFileExtension(file, kind)}`;
          const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
            contentType,
            upsert: false,
          });
          if (uploadError) throw uploadError;
          const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
          if (!data.publicUrl) throw new Error("无法生成素材地址");
          return { kind, url: data.publicUrl, previewUrl: data.publicUrl, label: file.name, mimeType: contentType } satisfies NonNullable<ReferenceSlot>;
        }),
      );

      setReferences((prev) => {
        if (selectedUiModeId === "start_end_frame") {
          const frames: [ReferenceSlot, ReferenceSlot] = [...prev.frames];
          uploaded.slice(0, 2 - index).forEach((slot, offset) => {
            const slotIndex = index + offset;
            if (slotIndex === 0 || slotIndex === 1) frames[slotIndex] = slot;
          });
          return { ...prev, frames };
        }
        const current = [...prev.allPurpose[kind]];
        uploaded.forEach((slot, offset) => {
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
      setError(uploadError instanceof Error ? uploadError.message : `${kindGroupLabel(kind)}素材上传失败`);
    } finally {
      setIsUploading(false);
      for (const key of Object.keys(fileInputRefs.current)) {
        if (fileInputRefs.current[key]) fileInputRefs.current[key]!.value = "";
      }
    }
  }

  function clearReference(kind: ReferenceKind, index: number) {
    setReferences((prev) => {
      if (selectedUiModeId === "start_end_frame") {
        const frames: [ReferenceSlot, ReferenceSlot] = [...prev.frames];
        if (index === 0 || index === 1) frames[index] = null;
        return { ...prev, frames };
      }
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
      const next = await prependVideoGalleryRecordApi(record);
      setRecords(next);
    } catch (e) {
      console.warn("[video] gallery save failed", e);
      setRecords((prev) => [record, ...prev]);
    }
  }

  async function handleGenerate() {
    setError("");

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
          candidate.role === "video_reference"
            ? "video/mp4"
            : candidate.role === "audio_reference"
              ? "audio/mpeg"
              : "image/png",
      }));
    const allReferences = mentionResolution.hasMentions ? mentionedReferences : buildReferences(selectedUiModeId, references);
    if (modeError && !mentionResolution.hasMentions) {
      setError(modeError);
      return;
    }
    if (selectedUiModeId === "multi_image_reference" && allReferences.length === 0) {
      setError("全能参考模式至少需要上传或 @ 引用一个图片、视频或音频素材。");
      return;
    }
    const hasStartFrame = allReferences.some((ref) => ref.role === "start_frame");
    const hasEndFrame = allReferences.some((ref) => ref.role === "end_frame");
    const hasImageReferences = allReferences.some((ref) => ref.role === "image_reference");
    const hasVideoReferences = allReferences.some((ref) => ref.role === "video_reference");
    const hasAudioReferences = allReferences.some((ref) => ref.role === "audio_reference");
    const hasMotionSourceVideo = allReferences.some((ref) => ref.role === "motion_source_video");

    let finalEffectiveModeId = effectiveModeId;
    if (mentionResolution.hasMentions && hasMotionSourceVideo) {
      finalEffectiveModeId = "motion_control";
    } else if (mentionResolution.hasMentions && (hasImageReferences || hasVideoReferences || hasAudioReferences)) {
      finalEffectiveModeId = "multi_image_reference";
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

    const liveSnapshot = await fetchWorkspaceSnapshot();
    const liveModel = liveSnapshot.videoWorkspace.models[safeModelId];
    if (!liveModel.baseUrl.trim() || !liveModel.apiKey.trim() || !liveModel.apiModelName.trim()) {
      setError(`模型「${liveModel.label}」未配置完整，请先到设置页填写 Base URL / API Key / API Model Name。`);
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: safeModelId,
          modeId: finalEffectiveModeId,
          prompt: cleanedPrompt,
          duration: selectedDuration,
          aspectRatio: selectedAspectRatio,
          resolution: selectedResolution,
          references: allReferences,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        providerTaskId?: string;
        videoUrl?: string;
      };
      if (!res.ok) throw new Error(data.error || "生视频失败");
      const videoUrl = typeof data.videoUrl === "string" ? data.videoUrl.trim() : "";
      if (!videoUrl) throw new Error("服务器未返回视频地址");
      setResultUrl(videoUrl);
      await writeRecord("success", cleanedPrompt, data.providerTaskId, videoUrl, undefined, finalEffectiveModeId, allReferences);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "生视频失败";
      setError(message);
      await writeRecord("error", cleanedPrompt, undefined, undefined, message, finalEffectiveModeId, allReferences);
    } finally {
      setIsGenerating(false);
    }
  }

  function applyHistoryRecord(record: VideoGalleryRecord) {
    setError("");
    setSelectedUiModeId(uiModeFromRecord(record.modeId));
    setSelectedModelId(VIDEO_UI_MODEL_ORDER.includes(record.modelId) ? record.modelId : videoWorkspace.uiDefaults.defaultModelId);
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
    setReferences({
      ...nextReferences,
      allPurpose: {
        image: compactReferenceList(nextReferences.allPurpose.image),
        video: compactReferenceList(nextReferences.allPurpose.video),
        audio: compactReferenceList(nextReferences.allPurpose.audio),
      },
    });
    const template = selectedPreset.promptTemplate;
    const n = composerSlotCountForTemplate(template);
    const slots =
      record.userSlotInputs && record.userSlotInputs.length > 0
        ? normalizeSlotInputsToLength(record.userSlotInputs, n)
        : normalizeSlotInputsToLength([record.finalPrompt], n);
    setSlotInputs(slots);
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
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
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>统一生视频工作台</p>
          </div>
        </div>
      </header>

      <section className={styles.stage}>
        <aside className={styles.modePanel}>
          <div className={styles.modeColumn}>
            <div className={styles.railFrame}>
              <div className={styles.scrollWrap}>
                <div className={styles.scroll}>
                  <div className={styles.list}>
                    {presetRailItems.length === 0 ? (
                      <div className={styles.emptyRail}>暂无预设</div>
                    ) : (
                      presetRailItems.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedPresetId(preset.id)}
                          className={[styles.modeItem, selectedPresetId === preset.id ? styles.modeItemActive : ""].filter(Boolean).join(" ")}
                          aria-label={preset.label}
                        >
                          {preset.coverUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={preset.coverUrl} alt="" className={styles.modeCoverImage} />
                              <span className={styles.modeMeta}>{preset.label}</span>
                            </>
                          ) : (
                            <span className={styles.modeCoverFallback}>{preset.label}</span>
                          )}
                        </button>
                      ))
                    )}
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
                {resultUrl ? <video className={styles.resultVideo} src={resultUrl} controls /> : null}
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
            <div className={styles.railFrame}>
              <div className={[styles.scrollWrap, sidebarHistoryRecords.length > 7 ? styles.scrollWrapFaded : ""].filter(Boolean).join(" ")}>
                <div ref={historyScrollRef} className={styles.scroll}>
                  <div className={styles.list}>
                    {sidebarHistoryRecords.length === 0 ? (
                      <div className={styles.emptyRail}>暂无记录</div>
                    ) : (
                      sidebarHistoryRecords.map((record) => (
                        <button key={record.id} type="button" onClick={() => applyHistoryRecord(record)} className={styles.historyItem}>
                          {record.videoUrl ? <video src={record.videoUrl} muted playsInline /> : null}
                          <span className={styles.historyMeta}>
                            {record.modeName} · {record.durationSeconds}s
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className={styles.composerWrap}>
          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.referenceStrip}>
            {selectedUiModeId === "start_end_frame" ? (
              references.frames.map((slot, index) => (
                <div
                  key={`frame-${index}`}
                  className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void uploadReferenceFiles("image", index, e.dataTransfer.files);
                  }}
                >
                  <label aria-label={`${slotLabel(selectedUiModeId, index)}，点击上传参考图`}>
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
                    {slot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slot.previewUrl} alt={slot.label} />
                    ) : (
                      <span className={styles.refEmptyContent}>
                        <span className={styles.refSlotIndex}>{slotLabel(selectedUiModeId, index)}</span>
                      </span>
                    )}
                  </label>
                  {slot ? (
                    <button type="button" onClick={() => clearReference("image", index)} className={styles.deleteRef} aria-label="移除参考图">
                      ×
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              REFERENCE_KINDS.map((kind) => (
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
                      <label aria-label={`${kindSlotLabel(kind, index)}，点击上传${kindGroupLabel(kind)}素材`}>
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
                        {slot ? (
                          kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={slot.previewUrl} alt={slot.label} />
                          ) : kind === "video" ? (
                            <video src={slot.previewUrl} muted playsInline />
                          ) : (
                            <span className={styles.refMediaGlyph}>音频</span>
                          )
                        ) : (
                          <span className={styles.refEmptyContent}>
                            <span className={styles.refSlotIndex}>{kindSlotLabel(kind, index)}</span>
                          </span>
                        )}
                      </label>
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
              <div className={[shellStyles.segmented, shellStyles.segmentedComposer].join(" ")}>
                {UI_MODES.map((mode) => (
                  (() => {
                    const unsupported = mode.id === "multi_image_reference" && !capabilities.supportedModes.includes("multi_image_reference");
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        disabled={unsupported}
                        title={unsupported ? "当前模型不支持全能参考" : undefined}
                        onClick={() => {
                          if (!unsupported) setSelectedUiModeId(mode.id);
                        }}
                        className={[shellStyles.segmentedItem, selectedUiModeId === mode.id ? shellStyles.segmentedItemActive : ""].join(" ")}
                      >
                        {mode.label}
                      </button>
                    );
                  })()
                ))}
              </div>

              <select
                value={safeModelId}
                onChange={(e) => setSelectedModelId(e.target.value as VideoModelId)}
                className={styles.composerSelect}
                aria-label="模型"
              >
                {VIDEO_UI_MODEL_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {getVideoModelDefinition(id).label}
                  </option>
                ))}
              </select>

              <select
                value={selectedAspectRatio}
                onChange={(e) => setSelectedAspectRatio(e.target.value as VideoAspectRatio)}
                className={styles.composerSelect}
                aria-label="比例"
              >
                {capabilities.aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>

              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(Number(e.target.value))}
                className={styles.composerSelect}
                aria-label="时长"
              >
                {capabilities.durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}s
                  </option>
                ))}
              </select>

              <select
                value={selectedResolution}
                onChange={(e) => setSelectedResolution(e.target.value as VideoResolution)}
                className={styles.composerSelect}
                aria-label="分辨率"
              >
                {capabilities.resolutions.map((resolution) => (
                  <option key={resolution} value={resolution}>
                    {resolution}
                  </option>
                ))}
              </select>

              <div className={styles.toolbarActions}>
                {!modelReady ? <span className={styles.warning}>当前模型未配置</span> : null}
                <button
                  type="button"
                  className={[styles.freeModeToggle, isFreeMode ? styles.freeModeToggleActive : ""].filter(Boolean).join(" ")}
                  aria-pressed={isFreeMode}
                  title="不使用提示词预设"
                  onClick={() => {
                    setSelectedPresetId(isFreeMode ? presetRailItems[0]?.id ?? "free" : "free");
                  }}
                >
                  <span className={styles.freeSwitchTrack} aria-hidden>
                    <span className={styles.freeSwitchThumb} />
                  </span>
                  <span>自由</span>
                </button>
                <button type="button" onClick={handleGenerate} disabled={isGenerating || isUploading} className={styles.generate}>
                  {isGenerating ? "生成中" : "生成"}
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
                      {promptPreviewPreset ? "预设提示词" : "当前模式提示词"}
                    </p>
                    <h2 className={styles.promptPreviewTitle}>
                      {promptPreviewPreset?.title ?? allModes.find((m) => m.id === selectedPresetId)?.label ?? selectedPresetId}
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
                  {promptPreviewPreset?.promptTemplate || buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs) || "（当前提示词为空）"}
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

      {portalMounted && presetLibraryOpen
        ? createPortal(
            <div className={styles.presetLibraryRoot} role="dialog" aria-modal="true" aria-label="提示词预设">
              <button
                type="button"
                className={styles.presetLibraryBackdrop}
                onClick={() => setPresetLibraryOpen(false)}
                aria-label="关闭提示词预设窗口"
              />
              <section className={styles.presetLibraryPanel}>
                <header className={styles.presetLibraryHead}>
                  <div>
                    <p className={styles.presetLibraryEyebrow}>生视频</p>
                    <h2 className={styles.presetLibraryTitle}>提示词预设</h2>
                  </div>
                  <div className={styles.presetLibraryHeadActions}>
                    <button
                      type="button"
                      className={styles.presetLibraryClose}
                      onClick={() => setPresetLibraryOpen(false)}
                      aria-label="关闭"
                    >
                      ×
                    </button>
                  </div>
                </header>
                {presetLibraryError ? <div className={styles.presetLibraryError}>{presetLibraryError}</div> : null}
                <div className={styles.presetLibraryGrid}>
                  {displayedPromptPresets.length === 0 ? (
                    <div className={styles.presetLibraryEmpty}>暂无提示词预设</div>
                  ) : (
                    displayedPromptPresets.map((preset) => {
                      const active = selectedPresetId === preset.id;
                      const coverUrl = preset.coverImageUrl.trim();
                      const hasDescription = Boolean(preset.description?.trim());
                      return (
                        <article
                          key={preset.id}
                          className={[styles.presetCard, active ? styles.presetCardActive : ""].filter(Boolean).join(" ")}
                        >
                          <button
                            type="button"
                            className={styles.presetCardSelect}
                            onClick={() => selectPromptPreset(preset.id)}
                            aria-label={`选择 ${preset.title}`}
                          >
                            <span className={styles.presetCardCover}>
                              <span className={styles.presetCardOverlay}>
                                <span className={styles.presetCardOverlayTop}>
                                  <span className={styles.presetCardTitle}>{preset.title}</span>
                                  {hasDescription ? (
                                    <span className={styles.presetCardDesc}>{preset.description!.trim()}</span>
                                  ) : null}
                                </span>
                              </span>
                              {coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={coverUrl} alt="" />
                              ) : (
                                <span>{preset.title}</span>
                              )}
                            </span>
                          </button>
                          <div className={styles.presetMetaActions}>
                            <button
                              type="button"
                              className={[
                                styles.presetMetaButton,
                                styles.presetViewButton,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => {
                                setPromptPreviewPreset(preset);
                                setPromptPreviewOpen(true);
                              }}
                              aria-label="查看提示词"
                              title="查看提示词"
                            >
                              查看提示词
                            </button>
                            <button
                              type="button"
                              className={[
                                styles.presetMetaButton,
                                styles.presetFavoriteButton,
                                preset.isFavorite ? styles.presetFavoriteActive : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => void togglePromptPresetFavorite(preset)}
                              disabled={Boolean(favoriteSavingById[preset.id])}
                              aria-pressed={Boolean(preset.isFavorite)}
                              aria-label={preset.isFavorite ? "取消收藏" : "收藏"}
                              title={preset.isFavorite ? "取消收藏" : "收藏"}
                            >
                              {preset.isFavorite ? "已收藏" : "收藏"}
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}
