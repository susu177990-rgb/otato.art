"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildImagePrompt,
  DEFAULT_IMAGE_SETTINGS,
  GPT_IMAGE_QUALITY_LABELS,
  GPT_IMAGE_QUALITY_ORDER,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  IMAGE_MODE_DUAL_PLACEHOLDERS,
  IMAGE_GALLERY_STORAGE_KEY,
  IMAGE_SETTINGS_STORAGE_KEY,
  templateUsesDualPaintingAndScriptSlots,
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageGalleryRecord,
  type ImageModelId,
  type ImageModeId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import { loadImageGallery, loadImageSettings, prependImageGalleryRecord, saveImageSettings } from "@/lib/image-storage";
import shellStyles from "../shared/shell.module.css";
import styles from "./image-page.module.css";

const ASPECT_RATIOS: ImageAspectRatio[] = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
const IMAGE_SIZES: ImageSizeTier[] = ["1K", "2K", "4K"];
const REF_IMAGE_SLOT_COUNT = 10;

type RefSlot = { previewUrl: string; file: File } | null;

function createEmptyRefSlots(): RefSlot[] {
  return Array.from({ length: REF_IMAGE_SLOT_COUNT }, () => null);
}

function normalizeRefSlots(slots: Array<RefSlot | null | undefined>): RefSlot[] {
  return Array.from({ length: REF_IMAGE_SLOT_COUNT }, (_, index) => slots[index] ?? null);
}

function revokeRefPreview(slot: RefSlot | null) {
  if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
}

function refSlotFromFile(file: File): NonNullable<RefSlot> {
  return { file, previewUrl: URL.createObjectURL(file) };
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
  /** 与 SSR 首帧一致，避免 hydration 抖动；真实配置在 effect / storage 同步里拉取 */
  const [settings, setSettings] = useState(DEFAULT_IMAGE_SETTINGS);
  const [records, setRecords] = useState<ImageGalleryRecord[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<ImageModeId>("real-character-asset");
  const [selectedModelId, setSelectedModelId] = useState<ImageModelId>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("4:3");
  const [imageSize, setImageSize] = useState<ImageSizeTier>("1K");
  const [userInput, setUserInput] = useState("");
  const [userInputSecondary, setUserInputSecondary] = useState("");
  const [refSlots, setRefSlots] = useState<RefSlot[]>(createEmptyRefSlots);
  const [resultUrl, setResultUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const refSlotsRef = useRef<RefSlot[]>(refSlots);
  refSlotsRef.current = refSlots;

  useEffect(() => {
    return () => {
      for (const s of refSlotsRef.current) revokeRefPreview(s);
    };
  }, []);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

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
    function refreshImageWorkspaceFromDisk() {
      setSettings(loadImageSettings());
      setRecords(loadImageGallery());
    }
    refreshImageWorkspaceFromDisk();

    /** 其它标签页改了 localStorage 时同步（同源 storage 事件不进当前页写入方，故生成前另有强制读取） */
    function onStorage(ev: StorageEvent) {
      if (ev.key === IMAGE_SETTINGS_STORAGE_KEY || ev.key === IMAGE_GALLERY_STORAGE_KEY || ev.key === null) {
        refreshImageWorkspaceFromDisk();
      }
    }
    window.addEventListener("storage", onStorage);

    /** 从设置页返回本标签、或手机切回前台时再读盘，避免界面显示旧内存态 */
    function onVisibility() {
      if (document.visibilityState === "visible") refreshImageWorkspaceFromDisk();
    }
    document.addEventListener("visibilitychange", onVisibility);

    /** 浏览器后退恢复 bfcache 时 React 状态可能是旧的 */
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) refreshImageWorkspaceFromDisk();
    }
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const selectedModel = settings.models[selectedModelId];
  const promptTemplate = settings.prompts[selectedModeId];
  const useDualPaintingScriptComposer = templateUsesDualPaintingAndScriptSlots(promptTemplate);
  const dualPlaceholders = IMAGE_MODE_DUAL_PLACEHOLDERS[selectedModeId] ?? {
    left: "左栏填写内容",
    right: "右栏填写内容",
  };
  const finalPrompt = useMemo(
    () => buildImagePrompt(promptTemplate, userInput, userInputSecondary),
    [promptTemplate, userInput, userInputSecondary],
  );
  const modelReady = Boolean(selectedModel.endpointUrl.trim() && selectedModel.apiKey.trim() && selectedModel.modelName.trim());
  const filledRefFileCount = useMemo(() => refSlots.filter(Boolean).length, [refSlots]);
  const sidebarHistoryRecords = useMemo(() => {
    const success = records.filter((r) => r.status === "success" && Boolean(r.imageUrl)).slice(0, 24);
    return success.slice().reverse();
  }, [records]);

  function persistGptImageQuality(q: GptImageQuality) {
    setSettings((prev) => {
      const next = { ...prev, gptImageQuality: q };
      saveImageSettings(next);
      return next;
    });
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

  function addRefImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
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
    setRefSlots((prev) => {
      const next = normalizeRefSlots(prev);
      revokeRefPreview(next[index]);
      next[index] = null;
      return next;
    });
  }

  function writeRecord(status: "success" | "error", imageUrl?: string, message?: string) {
    const next = prependImageGalleryRecord({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      modeId: selectedModeId,
      modeName: IMAGE_MODES.find((m) => m.id === selectedModeId)?.label ?? selectedModeId,
      modelId: selectedModelId,
      modelName: selectedModel.modelName,
      finalPrompt,
      userInput,
      userInputSecondary: useDualPaintingScriptComposer ? userInputSecondary : undefined,
      aspectRatio,
      imageSize,
      gptImageQuality: selectedModel.provider === "gpt-image" ? settings.gptImageQuality : undefined,
      imageUrl,
      refImageCount: filledRefFileCount,
      status,
      error: message,
    });
    setRecords(next);
  }

  async function handleGenerate() {
    setError("");

    if (selectedModeId === "free" && !userInput.trim()) {
      setError("自由模式请填写完整提示词（无内置模版）。");
      return;
    }

    /** 提交前强制与 localStorage 对齐：避免页面内存仍是旧快照而设置里早已保存（返回/bfcache/未触发同步时常见） */
    const liveSettings = loadImageSettings();
    setSettings(liveSettings);
    const liveModel = liveSettings.models[selectedModelId];
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
    try {
      const fd = new FormData();
      fd.append(
        "meta",
        JSON.stringify({
          prompt: finalPrompt,
          model: liveModel,
          aspectRatio,
          imageSize,
          gptImageQuality: liveModel.provider === "gpt-image" ? liveSettings.gptImageQuality : undefined,
        }),
      );
      for (const slot of refSlots) {
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
      setResultUrl(imageUrl);
      try {
        writeRecord("success", imageUrl);
      } catch (persistErr) {
        console.warn("本地画廊写入失败（多与浏览器存储配额有关）:", persistErr);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "生图失败";
      setError(message);
      try {
        writeRecord("error", undefined, message);
      } catch (persistErr) {
        console.warn("写入失败记录到本地画廊时出错:", persistErr);
      }
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
          <Link href="/image/gallery" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            画廊
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>模式化生图工作台</p>
          </div>
        </div>
      </header>

      <section className={styles.stage}>
        <aside className={styles.modePanel}>
          <div className={styles.modeColumn}>
            <div className={styles.modeRail}>
              <div className={styles.modeRailFrame}>
                <div
                  className={[
                    styles.modeScrollWrap,
                    IMAGE_MODES.length > 7 ? styles.modeScrollWrapFaded : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.modeScroll}>
                    <div className={styles.modeList}>
                      {IMAGE_MODES.map((mode) => {
                        const active = selectedModeId === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setSelectedModeId(mode.id)}
                            className={[styles.modeButton, active ? styles.modeButtonActive : ""].filter(Boolean).join(" ")}
                          >
                            <span className={styles.modeName}>{mode.label}</span>
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
                              setUserInput(record.userInput);
                              setUserInputSecondary(record.userInputSecondary ?? "");
                              if (record.gptImageQuality) {
                                setSettings((prev) => {
                                  const next = { ...prev, gptImageQuality: record.gptImageQuality! };
                                  saveImageSettings(next);
                                  return next;
                                });
                              }
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
                <label>
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
                      <span className={styles.refIcon}>▧</span>
                      <span>图{index + 1}</span>
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
            {useDualPaintingScriptComposer ? (
              <div className={styles.promptDualGrid} role="group" aria-label="作图双输入">
                <div className={styles.promptDualPane}>
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder={dualPlaceholders.left}
                    aria-label="绘画风格与质感"
                    className={styles.promptInput}
                  />
                </div>
                <div className={styles.promptDualPane}>
                  <textarea
                    value={userInputSecondary}
                    onChange={(e) => setUserInputSecondary(e.target.value)}
                    placeholder={dualPlaceholders.right}
                    aria-label="本分镜剧本"
                    className={styles.promptInput}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.promptInputShell}>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={
                    selectedModeId === "free"
                      ? "直接输入完整提示词（自由模式无固定模版）"
                      : selectedModeId === "storyboard-continuation"
                        ? "输入本分镜脚本（将接续参考图1的上一拍，写入连续性推演模版）"
                        : selectedModeId === "prop-asset"
                          ? "输入道具资产设定（材质、结构、用途、磨损特征等），写入模版「## 5. 资产设定」"
                          : "输入角色设定，将写入固定提示词模版"
                  }
                  className={styles.promptInput}
                />
              </div>
            )}
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
    </main>
  );
}
