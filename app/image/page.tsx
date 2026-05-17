"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildImagePrompt,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  type ImageAspectRatio,
  type ImageGalleryRecord,
  type ImageModelId,
  type ImageModeId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import { loadImageGallery, loadImageSettings, prependImageGalleryRecord } from "@/lib/image-storage";
import shellStyles from "../shared/shell.module.css";
import styles from "./image-page.module.css";

const ASPECT_RATIOS: ImageAspectRatio[] = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
const IMAGE_SIZES: ImageSizeTier[] = ["1K", "2K", "4K"];
const REF_IMAGE_SLOT_COUNT = 10;

function createEmptyRefSlots(): Array<string | null> {
  return Array.from({ length: REF_IMAGE_SLOT_COUNT }, () => null);
}

function normalizeRefSlots(images: Array<string | null>): Array<string | null> {
  return Array.from({ length: REF_IMAGE_SLOT_COUNT }, (_, index) => images[index] ?? null);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImagePage() {
  const [settings, setSettings] = useState(loadImageSettings);
  const [records, setRecords] = useState<ImageGalleryRecord[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<ImageModeId>("real-character-asset");
  const [selectedModelId, setSelectedModelId] = useState<ImageModelId>("gpt-image-2");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("4:3");
  const [imageSize, setImageSize] = useState<ImageSizeTier>("1K");
  const [userInput, setUserInput] = useState("");
  const [refImages, setRefImages] = useState<Array<string | null>>(createEmptyRefSlots);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSettings(loadImageSettings());
    setRecords(loadImageGallery());
  }, []);

  const selectedModel = settings.models[selectedModelId];
  const promptTemplate = settings.prompts[selectedModeId];
  const finalPrompt = useMemo(() => buildImagePrompt(promptTemplate, userInput), [promptTemplate, userInput]);
  const modelReady = Boolean(selectedModel.endpointUrl.trim() && selectedModel.apiKey.trim() && selectedModel.modelName.trim());
  const filledRefImages = useMemo(() => refImages.filter((src): src is string => Boolean(src)), [refImages]);
  const sidebarHistoryRecords = useMemo(() => {
    const success = records.filter((r) => r.status === "success" && Boolean(r.imageUrl)).slice(0, 24);
    return success.slice().reverse();
  }, [records]);

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

  async function addRefImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    const dataUrls = await Promise.all(images.map(fileToDataUrl));
    setRefImages((prev) => {
      const next = normalizeRefSlots(prev);
      let imageIndex = 0;
      for (let slotIndex = 0; slotIndex < next.length && imageIndex < dataUrls.length; slotIndex += 1) {
        if (!next[slotIndex]) {
          next[slotIndex] = dataUrls[imageIndex];
          imageIndex += 1;
        }
      }
      return next;
    });
  }

  async function fillRefImagesFromIndex(index: number, files: FileList | File[] | null | undefined) {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    const dataUrls = await Promise.all(images.map(fileToDataUrl));
    setRefImages((prev) => {
      const next = normalizeRefSlots(prev);
      dataUrls.forEach((dataUrl, offset) => {
        const slotIndex = index + offset;
        if (slotIndex < next.length) next[slotIndex] = dataUrl;
      });
      return next;
    });
  }

  function clearRefImage(index: number) {
    setRefImages((prev) => {
      const next = normalizeRefSlots(prev);
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
      aspectRatio,
      imageSize,
      imageUrl,
      refImageCount: filledRefImages.length,
      status,
      error: message,
    });
    setRecords(next);
  }

  async function handleGenerate() {
    const trimmedInput = userInput.trim();
    setError("");

    if (!trimmedInput) {
      setError(selectedModeId === "free" ? "请先填写提示词。" : "请先填写角色设定。");
      return;
    }
    if (!modelReady) {
      setError("当前模型缺少 URL、API Key 或模型名，请先去生图设置填写。");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          model: selectedModel,
          aspectRatio,
          imageSize,
          refImages: filledRefImages,
        }),
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
        </aside>

        <div className={styles.canvas}>
          <div className={styles.canvasInner}>
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="生成结果" className={styles.resultImage} />
            ) : null}
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
                            }}
                            className={styles.historyItem}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={record.imageUrl!} alt={record.modeName} />
                            <span className={styles.historyMeta}>
                              {record.aspectRatio} · {record.imageSize}
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
            {refImages.map((src, index) => (
              <div
                key={index}
                className={[styles.refSlot, src ? styles.refSlotFilled : styles.refSlotEmpty].join(" ")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void fillRefImagesFromIndex(index, e.dataTransfer.files);
                }}
              >
                <label>
                  <input
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      void fillRefImagesFromIndex(index, e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  {src ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`参考图 ${index + 1}`} />
                    </>
                  ) : (
                    <span className={styles.refEmptyContent}>
                      <span className={styles.refIcon}>▧</span>
                      <span>图{index + 1}</span>
                    </span>
                  )}
                </label>
                {src ? (
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
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                selectedModeId === "free"
                  ? "直接输入完整提示词（自由模式无固定模版）"
                  : "输入角色设定，将写入固定提示词模版"
              }
              rows={3}
              className={styles.promptInput}
            />
            <div className={styles.toolbar}>
              <div className={shellStyles.segmented}>
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

              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)} className={styles.composerSelect}>
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio === "auto" ? "自适应" : ratio}
                  </option>
                ))}
              </select>

              <select value={imageSize} onChange={(e) => setImageSize(e.target.value as ImageSizeTier)} className={styles.composerSelect}>
                {IMAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>

              {!modelReady ? <span className={styles.warning}>当前模型未配置</span> : null}
              <button type="button" onClick={handleGenerate} disabled={isGenerating} className={styles.generate} title="生成">
                {isGenerating ? "生成中" : "生成"}
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
