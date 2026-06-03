"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./video-page.module.css";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import {
  VIDEO_MODES,
  VIDEO_MODEL_ORDER,
  buildVideoPromptFromSlots,
  composerSlotCountForTemplate,
  extractPromptPlaceholderOccurrences,
  placeholderInnerHint,
  type VideoAspectRatio,
  type VideoDurationSeconds,
  type VideoModelId,
} from "@/lib/video-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import {
  fetchVideoGalleryRecords,
  fetchWorkspaceSnapshot,
  prependVideoGalleryRecordApi,
} from "@/lib/workspace-api";

const ASPECT_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "4:3", "3:4"];
const DURATIONS: VideoDurationSeconds[] = [5, 10, 15];

const VIDEO_GENERATION_RUNTIME_STORAGE_KEY = "script-agent-video-generation-runtime-v1";
const VIDEO_GENERATION_RUNTIME_EVENT = "script-agent-video-generation-runtime-change";

type VideoGenerationRuntimeState = {
  taskId: string;
  status: "running" | "success" | "error";
  startedAt: string;
  updatedAt: string;
  modeId: string;
  modelId: VideoModelId;
  aspectRatio: VideoAspectRatio;
  duration: VideoDurationSeconds;
  slotInputs: string[];
  finalPrompt: string;
  videoUrl?: string;
  error?: string;
};

function readRuntimeState(): VideoGenerationRuntimeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIDEO_GENERATION_RUNTIME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VideoGenerationRuntimeState>;
    if (!parsed.taskId || !parsed.status || !parsed.startedAt) return null;
    if (parsed.status !== "running" && parsed.status !== "success" && parsed.status !== "error") return null;
    if (parsed.modelId !== "seedance-2.0" && parsed.modelId !== "seedance-2.0-fast") return null;
    return {
      taskId: parsed.taskId,
      status: parsed.status,
      startedAt: parsed.startedAt,
      updatedAt: parsed.updatedAt || parsed.startedAt,
      modeId: String(parsed.modeId || "cinematic-text-to-video"),
      modelId: parsed.modelId,
      aspectRatio: (parsed.aspectRatio as VideoAspectRatio) || "16:9",
      duration: (parsed.duration as VideoDurationSeconds) || 10,
      slotInputs: Array.isArray(parsed.slotInputs) ? parsed.slotInputs.map((x) => String(x ?? "")) : [""],
      finalPrompt: String(parsed.finalPrompt || ""),
      videoUrl: typeof parsed.videoUrl === "string" ? parsed.videoUrl : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return null;
  }
}

function writeRuntimeState(next: VideoGenerationRuntimeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIDEO_GENERATION_RUNTIME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent<VideoGenerationRuntimeState>(VIDEO_GENERATION_RUNTIME_EVENT, { detail: next }));
}

function normalizeSlotInputsToLength(slots: string[] | undefined, len: number): string[] {
  return Array.from({ length: len }, (_, i) => slots?.[i] ?? "");
}

function composerPlaceholder(modeId: string, occ: string[], slotIndex: number): string {
  const tok = occ[slotIndex];
  if (tok) {
    const hint = placeholderInnerHint(tok);
    if (hint) return hint;
    return `槽位 ${slotIndex + 1}`;
  }
  if (modeId === "free") return "直接输入完整提示词（自由模式无固定模版）";
  return "输入内容";
}

export default function VideoPage() {
  const { videoWorkspace, workspaceReady } = useApiSettings();
  const [records, setRecords] = useState<VideoGalleryRecord[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string>("cinematic-text-to-video");
  const [selectedModelId, setSelectedModelId] = useState<VideoModelId>("seedance-2.0");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("16:9");
  const [duration, setDuration] = useState<VideoDurationSeconds>(10);
  const [slotInputs, setSlotInputs] = useState<string[]>([""]);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const promptsRef = useRef(videoWorkspace.prompts);
  promptsRef.current = videoWorkspace.prompts;

  const modes = useMemo(
    () => [...VIDEO_MODES, ...(videoWorkspace.customModes ?? [])].reverse(),
    [videoWorkspace.customModes],
  );

  const promptTemplate = videoWorkspace.prompts[selectedModeId] ?? "";
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
    const fallback = modes.find((m) => m.id === "cinematic-text-to-video")?.id ?? modes[0]?.id ?? "free";
    setSelectedModeId(fallback);
  }, [modes, selectedModeId]);

  const finalPrompt = useMemo(
    () => buildVideoPromptFromSlots(promptTemplate, slotInputs),
    [promptTemplate, slotInputs],
  );

  const selectedModel = videoWorkspace.models[selectedModelId];
  const modelReady = Boolean(selectedModel.baseUrl.trim() && selectedModel.apiKey.trim() && String(selectedModel.modelName).trim());

  const sidebarHistoryRecords = useMemo(() => {
    const success = records.filter((r) => r.status === "success" && Boolean(r.videoUrl)).slice(0, 24);
    return success.slice().reverse();
  }, [records]);

  useEffect(() => {
    const el = historyScrollRef.current;
    if (!el || sidebarHistoryRecords.length === 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [sidebarHistoryRecords]);

  const applyRuntimeState = useCallback((state: VideoGenerationRuntimeState | null) => {
    if (!state) return;
    setSelectedModelId(state.modelId);
    setSelectedModeId(state.modeId);
    setAspectRatio(state.aspectRatio);
    setDuration(state.duration);
    const tpl = promptsRef.current[state.modeId] ?? "";
    const n = composerSlotCountForTemplate(tpl, state.modeId);
    setSlotInputs(normalizeSlotInputsToLength(state.slotInputs, n));
    setIsGenerating(state.status === "running");
    if (state.status === "success") {
      setResultUrl(state.videoUrl || "");
      setError("");
    } else if (state.status === "error") {
      setError(state.error || "生视频失败");
    }
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    const initial = readRuntimeState();
    if (initial?.status === "running") {
      applyRuntimeState(initial);
    }
    function onRuntimeChange(e: Event) {
      const detail = e instanceof CustomEvent ? (e.detail as VideoGenerationRuntimeState | undefined) : undefined;
      const next = detail ?? readRuntimeState();
      if (!next) return;
      applyRuntimeState(next);
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const next = readRuntimeState();
      if (next?.status !== "running") return;
      applyRuntimeState(next);
    }
    window.addEventListener(VIDEO_GENERATION_RUNTIME_EVENT, onRuntimeChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(VIDEO_GENERATION_RUNTIME_EVENT, onRuntimeChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceReady, applyRuntimeState]);

  useEffect(() => {
    if (!workspaceReady) return;
    void fetchVideoGalleryRecords()
      .then((rows) => setRecords(rows))
      .catch((e) => console.warn("[video] gallery load failed", e));
  }, [workspaceReady]);

  async function writeRecord(status: "success" | "error", videoUrl?: string, message?: string, promptSnapshot?: string) {
    const resolvedPrompt = promptSnapshot ?? finalPrompt;
    const record: VideoGalleryRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modeId: selectedModeId,
      modeName: modes.find((m) => m.id === selectedModeId)?.label ?? selectedModeId,
      modelId: selectedModelId,
      modelName: String(selectedModel.modelName ?? selectedModelId),
      finalPrompt: resolvedPrompt,
      userSlotInputs: [...slotInputs],
      aspectRatio,
      duration,
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
    return record;
  }

  async function handleGenerate() {
    setError("");

    if (selectedModeId === "free" && !(slotInputs[0] ?? "").trim()) {
      setError("自由模式请填写完整提示词（无内置模版）。");
      return;
    }

    const liveSnapshot = await fetchWorkspaceSnapshot();
    const liveVideoSettings = liveSnapshot.videoWorkspace;
    const liveModel = liveVideoSettings.models[selectedModelId];
    const liveTemplate = liveVideoSettings.prompts[selectedModeId] ?? "";
    const promptForRequest = buildVideoPromptFromSlots(liveTemplate, slotInputs);
    const liveReady = Boolean(liveModel.baseUrl && liveModel.apiKey && liveModel.modelName);
    if (!liveReady) {
      setError(`「${liveModel.label}」缺少 Base URL / API Key / 模型名。请在「设置 → 生视频 API」里填写并保存。`);
      return;
    }

    setIsGenerating(true);
    let runtimeState: VideoGenerationRuntimeState | null = null;
    try {
      runtimeState = {
        taskId: crypto.randomUUID(),
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modeId: selectedModeId,
        modelId: selectedModelId,
        aspectRatio,
        duration,
        slotInputs: [...slotInputs],
        finalPrompt: promptForRequest,
      };
      writeRuntimeState(runtimeState);

      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptForRequest, modelId: selectedModelId, aspectRatio, duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "生视频失败");
      const videoUrl = typeof data.videoUrl === "string" ? data.videoUrl.trim() : "";
      if (!videoUrl) throw new Error(typeof data.error === "string" && data.error ? data.error : "服务器未返回视频地址");

      if (runtimeState) {
        writeRuntimeState({
          ...runtimeState,
          status: "success",
          updatedAt: new Date().toISOString(),
          videoUrl,
          error: undefined,
        });
      }

      setResultUrl(videoUrl);
      void writeRecord("success", videoUrl, undefined, promptForRequest);
    } catch (e) {
      const message = e instanceof Error ? e.message : "生视频失败";
      if (runtimeState) {
        writeRuntimeState({
          ...runtimeState,
          status: "error",
          updatedAt: new Date().toISOString(),
          error: message,
        });
      }
      setError(message);
      void writeRecord("error", undefined, message, runtimeState?.finalPrompt);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>模式化生视频工作台</p>
          </div>
        </div>
      </header>

      <section className={styles.stage}>
        <aside className={styles.modePanel}>
          <div className={styles.modeColumn}>
            <div className={styles.railFrame}>
              <div className={[styles.scrollWrap, modes.length > 7 ? styles.scrollWrapFaded : ""].filter(Boolean).join(" ")}>
                <div className={styles.scroll}>
                  <div className={styles.list}>
                    {modes.map((mode) => {
                      const active = selectedModeId === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setSelectedModeId(mode.id)}
                          className={[styles.modeItem, active ? styles.modeItemActive : ""].filter(Boolean).join(" ")}
                          aria-label={mode.label}
                        >
                          <span className={styles.modeLabel}>{mode.label}</span>
                        </button>
                      );
                    })}
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
                  <video className={styles.resultVideo} src={resultUrl} controls />
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
            <div className={styles.railFrame}>
              <div className={[styles.scrollWrap, sidebarHistoryRecords.length > 7 ? styles.scrollWrapFaded : ""].filter(Boolean).join(" ")}>
                <div ref={historyScrollRef} className={styles.scroll}>
                  <div className={styles.list}>
                    {sidebarHistoryRecords.length === 0 ? (
                      <div className={styles.emptyRail}>暂无记录</div>
                    ) : (
                      sidebarHistoryRecords.map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => {
                            setError("");
                            setResultUrl(record.videoUrl || "");
                            setSelectedModelId(record.modelId);
                            setSelectedModeId(record.modeId);
                            setAspectRatio(record.aspectRatio);
                            setDuration(record.duration);
                            const tpl = videoWorkspace.prompts[record.modeId] ?? "";
                            const n = composerSlotCountForTemplate(tpl, record.modeId);
                            const slots = normalizeSlotInputsToLength(record.userSlotInputs ?? [""], n);
                            setSlotInputs(slots);
                          }}
                          className={styles.historyItem}
                          aria-label={`${record.modeName} · ${new Date(record.createdAt).toLocaleString()}`}
                        >
                          {record.videoUrl ? <video src={record.videoUrl} muted playsInline /> : null}
                          <span className={styles.historyMeta}>
                            {record.aspectRatio} · {record.duration}s
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

          <div className={styles.composer}>
            <div
              className={styles.promptSlotGrid}
              style={{ gridTemplateColumns: `repeat(${slotInputs.length}, minmax(0, 1fr))` }}
              role="group"
              aria-label="生视频输入"
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
                    aria-label={`生视频输入槽位 ${i + 1}`}
                    className={styles.promptInput}
                  />
                </div>
              ))}
            </div>

            <div className={styles.toolbar}>
              <div className={[shellStyles.segmented, shellStyles.segmentedComposer].join(" ")}>
                {VIDEO_MODEL_ORDER.map((id) => {
                  const model = videoWorkspace.models[id];
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
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
                className={styles.composerSelect}
                aria-label="比例"
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>

              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as VideoDurationSeconds)}
                className={styles.composerSelect}
                aria-label="时长"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>

              {!modelReady ? <span className={styles.warning}>当前模型未配置</span> : null}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className={styles.generate}
                title="生成"
              >
                {isGenerating ? "生成中" : "生成"}
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

