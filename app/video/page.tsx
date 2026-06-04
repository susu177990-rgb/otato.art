"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./video-page.module.css";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import {
  fetchVideoGalleryRecords,
  fetchWorkspaceSnapshot,
  prependVideoGalleryRecordApi,
} from "@/lib/workspace-api";
import {
  VIDEO_MODEL_ORDER,
  VIDEO_MODES,
  VIDEO_MODE_LABELS,
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
} from "@/lib/video-workspace";

const MEDIA_BUCKET = "generated-images";

type UiVideoModeId = "start_end_frame" | "multi_image_reference";
type RefSlot = { url: string; previewUrl: string; label: string } | null;
type PresetRailItem = {
  id: string;
  label: string;
  promptTemplate: string;
  coverUrl: string;
};

const UI_MODES: ReadonlyArray<{ id: UiVideoModeId; label: string }> = [
  { id: "start_end_frame", label: "首尾帧" },
  { id: "multi_image_reference", label: "多图参考" },
];

const VIDEO_UI_MODEL_ORDER: VideoModelId[] = VIDEO_MODEL_ORDER.filter((id) => id !== "kling-2.6-motion");

function createEmptyRefSlots(): RefSlot[] {
  return Array.from({ length: 10 }, () => null);
}

function normalizeRefSlots(slots: Array<RefSlot | null | undefined>): RefSlot[] {
  return Array.from({ length: 10 }, (_, index) => slots[index] ?? null);
}

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
  refSlots: RefSlot[],
): { modeId: VideoGenerationModeId; error?: string } {
  if (uiModeId === "multi_image_reference") {
    return { modeId: "multi_image_reference" };
  }
  const first = refSlots[0];
  const second = refSlots[1];
  if (!first && !second) return { modeId: "text_to_video" };
  if (second && !first) return { modeId: "start_end_frame", error: "请先上传首帧图，再上传尾帧图。" };
  if (first && !second) return { modeId: "start_frame" };
  return { modeId: "start_end_frame" };
}

function visibleSlotCount(uiModeId: UiVideoModeId): number {
  return uiModeId === "start_end_frame" ? 2 : 10;
}

function slotLabel(uiModeId: UiVideoModeId, index: number): string {
  if (uiModeId === "start_end_frame") return index === 0 ? "首帧" : "尾帧";
  return `图${index + 1}`;
}

function buildReferences(uiModeId: UiVideoModeId, refSlots: RefSlot[]): UnifiedVideoReference[] {
  if (uiModeId === "multi_image_reference") {
    return refSlots
      .slice(0, 10)
      .filter((slot): slot is NonNullable<RefSlot> => Boolean(slot))
      .map((slot) => ({
        role: "image_reference" as const,
        url: slot.url,
        label: slot.label,
        mimeType: "image/png",
      }));
  }

  const refs: UnifiedVideoReference[] = [];
  if (refSlots[0]) {
    refs.push({
      role: "start_frame",
      url: refSlots[0].url,
      label: refSlots[0].label,
      mimeType: "image/png",
    });
  }
  if (refSlots[1]) {
    refs.push({
      role: "end_frame",
      url: refSlots[1].url,
      label: refSlots[1].label,
      mimeType: "image/png",
    });
  }
  return refs;
}

function historySlotKey(modeId: VideoGenerationModeId, role: UnifiedVideoReference["role"], index: number): number | null {
  if (modeId === "multi_image_reference") {
    return role === "image_reference" ? index : null;
  }
  if (role === "start_frame") return 0;
  if (role === "end_frame") return 1;
  return null;
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
  const [refSlots, setRefSlots] = useState<RefSlot[]>(createEmptyRefSlots);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const safeModelId = VIDEO_UI_MODEL_ORDER.includes(selectedModelId)
    ? selectedModelId
    : videoWorkspace.uiDefaults.defaultModelId;
  const capabilities = getVideoCapabilities(safeModelId);
  const { modeId: effectiveModeId, error: modeError } = useMemo(
    () => effectiveModeFromUi(selectedUiModeId, refSlots),
    [selectedUiModeId, refSlots],
  );
  const presetRailItems = useMemo<PresetRailItem[]>(
    () => {
      const builtinRows = VIDEO_MODES.map((mode) => ({
        id: mode.id,
        label: mode.label,
      }));
      const customRows = (videoWorkspace.customModes ?? []).map((mode) => ({
        id: mode.id,
        label: mode.label,
      }));
      return [...builtinRows, ...customRows].reverse().map((item) => ({
        id: item.id,
        label: item.label,
        promptTemplate: videoWorkspace.prompts[item.id] ?? "",
        coverUrl: videoWorkspace.coverImageUrlByMode?.[item.id]?.trim() ?? "",
      }));
    },
    [videoWorkspace.coverImageUrlByMode, videoWorkspace.customModes, videoWorkspace.prompts],
  );
  const selectedPreset =
    presetRailItems.find((item) => item.id === selectedPresetId) ?? presetRailItems[0] ?? { id: "free", label: "自由模式", promptTemplate: "", coverUrl: "" };
  const placeholderOccurrences = useMemo(
    () => extractPromptPlaceholderOccurrences(selectedPreset.promptTemplate),
    [selectedPreset.promptTemplate],
  );
  const composerSlotCount = composerSlotCountForTemplate(selectedPreset.promptTemplate);
  const displayedRefSlotCount = visibleSlotCount(selectedUiModeId);
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
  }, [capabilities, safeModelId]);

  useEffect(() => {
    if (presetRailItems.some((item) => item.id === selectedPresetId)) return;
    setSelectedPresetId(presetRailItems[0]?.id ?? "free");
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

  async function uploadImageSlotsFromIndex(index: number, files: FileList | File[] | null | undefined) {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    setIsUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("请先登录");

      const uploaded = await Promise.all(
        images.map(async (file) => {
          const path = `${user.id}/video-inputs/${safeModelId}/${crypto.randomUUID()}.${fileExt(file)}`;
          const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
            contentType: file.type || "image/png",
            upsert: false,
          });
          if (uploadError) throw uploadError;
          const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
          if (!data.publicUrl) throw new Error("无法生成素材地址");
          return { url: data.publicUrl, previewUrl: data.publicUrl, label: file.name } satisfies NonNullable<RefSlot>;
        }),
      );

      setRefSlots((prev) => {
        const next = normalizeRefSlots(prev);
        uploaded.forEach((slot, offset) => {
          const slotIndex = index + offset;
          if (slotIndex < next.length) next[slotIndex] = slot;
        });
        return next;
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "参考图上传失败");
    } finally {
      setIsUploading(false);
      for (const key of Object.keys(fileInputRefs.current)) {
        if (fileInputRefs.current[Number(key)]) fileInputRefs.current[Number(key)]!.value = "";
      }
    }
  }

  function clearRefImage(index: number) {
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      next[index] = null;
      return next;
    });
  }

  async function writeRecord(
    status: "success" | "error",
    finalPrompt: string,
    providerTaskId?: string,
    videoUrl?: string,
    message?: string,
  ) {
    const record: VideoGalleryRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modelId: safeModelId,
      modelName: getVideoModelDefinition(safeModelId).label,
      modeId: effectiveModeId,
      modeName: VIDEO_MODE_LABELS[effectiveModeId],
      finalPrompt,
      userSlotInputs: [...slotInputs],
      aspectRatio: selectedAspectRatio,
      durationSeconds: selectedDuration,
      resolution: selectedResolution,
      providerTaskId,
      referencesSummary: buildReferences(selectedUiModeId, refSlots).map((item) => ({
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
    if (modeError) {
      setError(modeError);
      return;
    }
    if (selectedUiModeId === "multi_image_reference" && !refSlots[0]) {
      setError("多图参考模式至少需要上传一张参考图。");
      return;
    }
    if (effectiveModeId === "start_end_frame" && !capabilities.supportedModes.includes("start_end_frame")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持首尾帧模式。`);
      return;
    }
    if (effectiveModeId === "multi_image_reference" && !capabilities.supportedModes.includes("multi_image_reference")) {
      setError(`模型「${getVideoModelDefinition(safeModelId).label}」当前不支持多图参考模式。`);
      return;
    }

    const prompt = buildVideoPromptFromSlots(selectedPreset.promptTemplate, slotInputs).trim();
    if (!prompt) {
      setError("提示词不能为空。");
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
          modeId: effectiveModeId,
          prompt,
          duration: selectedDuration,
          aspectRatio: selectedAspectRatio,
          resolution: selectedResolution,
          references: buildReferences(selectedUiModeId, refSlots),
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
      await writeRecord("success", prompt, data.providerTaskId, videoUrl);
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : "生视频失败";
      setError(message);
      await writeRecord("error", prompt, undefined, undefined, message);
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
    const nextSlots = createEmptyRefSlots();
    (record.referencesSummary ?? []).forEach((item, index) => {
      const slotIndex = historySlotKey(record.modeId, item.role, index);
      if (slotIndex === null || !item.url) return;
      nextSlots[slotIndex] = {
        url: item.url,
        previewUrl: item.url,
        label: item.label,
      };
    });
    setRefSlots(nextSlots);
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
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
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
                    {presetRailItems.map((preset) => (
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
                    ))}
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
            {refSlots.slice(0, displayedRefSlotCount).map((slot, index) => (
              <div
                key={index}
                className={[styles.refSlot, slot ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void uploadImageSlotsFromIndex(index, e.dataTransfer.files);
                }}
              >
                <label aria-label={`${slotLabel(selectedUiModeId, index)}，点击上传参考图`}>
                  <input
                    ref={(node) => {
                      fileInputRefs.current[index] = node;
                    }}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    multiple={selectedUiModeId === "multi_image_reference"}
                    onChange={(e) => {
                      void uploadImageSlotsFromIndex(index, e.target.files);
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
                  <button type="button" onClick={() => clearRefImage(index)} className={styles.deleteRef} aria-label="移除参考图">
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
            >
              {slotInputs.map((value, index) => (
                <div key={index} className={styles.promptSlotPane}>
                  <textarea
                    value={value}
                    onChange={(e) =>
                      setSlotInputs((prev) => {
                        const next = [...prev];
                        next[index] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={composerPlaceholder(placeholderOccurrences, index)}
                    className={styles.promptInput}
                  />
                </div>
              ))}
            </div>

            <div className={styles.toolbar}>
              <div className={[shellStyles.segmented, shellStyles.segmentedComposer].join(" ")}>
                {UI_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSelectedUiModeId(mode.id)}
                    className={[shellStyles.segmentedItem, selectedUiModeId === mode.id ? shellStyles.segmentedItemActive : ""].join(" ")}
                  >
                    {mode.label}
                  </button>
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
                <button type="button" onClick={handleGenerate} disabled={isGenerating || isUploading} className={styles.generate}>
                  {isGenerating ? "生成中" : "生成"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
