"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { fetchGalleryRecords, fetchVideoGalleryRecords } from "@/lib/workspace-api";
import styles from "./project-asset-picker.module.css";

export type ProjectGenerationRecordKind = "image" | "video";

export type ProjectGenerationRecordSelection =
  | { kind: "image"; record: ImageGalleryRecord }
  | { kind: "video"; record: VideoGalleryRecord };

type ProjectGenerationRecordPickerDialogProps = {
  projectId: string;
  allowedKinds: ProjectGenerationRecordKind[];
  maxSelection?: number;
  onClose: () => void;
  onSelect: (selections: ProjectGenerationRecordSelection[]) => void;
};

function isGrokSpicyReadyRecord(record: ImageGalleryRecord): boolean {
  return (
    record.modelId === "grok-imagine-i2i" &&
    record.sourceProvider === "crun" &&
    Boolean(record.sourceTaskId?.trim()) &&
    (record.sourceTaskModel === "grok-imagine/t2i" || record.sourceTaskModel === "grok-imagine/i2i") &&
    Number.isInteger(record.sourceTaskOutputIndex) &&
    Number(record.sourceTaskOutputIndex) >= 0
  );
}

function recordTitle(text: string | undefined, fallback: string): string {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return Array.from(cleaned).slice(0, 24).join("");
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function selectionKey(selection: ProjectGenerationRecordSelection): string {
  return `${selection.kind}:${selection.record.id}`;
}

async function responseJson<T>(promise: Promise<T>): Promise<T> {
  return promise;
}

export function ProjectGenerationRecordPickerDialog({
  projectId,
  allowedKinds,
  maxSelection,
  onClose,
  onSelect,
}: ProjectGenerationRecordPickerDialogProps) {
  const [images, setImages] = useState<ImageGalleryRecord[]>([]);
  const [videos, setVideos] = useState<VideoGalleryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageFilter, setImageFilter] = useState<"all" | "grok-spicy">("all");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const allowedKindSet = useMemo(() => new Set(allowedKinds), [allowedKinds]);
  const showImages = allowedKindSet.has("image");
  const showVideos = allowedKindSet.has("video");
  const visibleImages = useMemo(
    () =>
      images
        .filter((record) => record.status === "success" && Boolean(record.imageUrl?.trim()))
        .filter((record) => imageFilter === "all" || isGrokSpicyReadyRecord(record)),
    [imageFilter, images],
  );
  const visibleVideos = useMemo(
    () => videos.filter((record) => record.status === "success" && Boolean(record.videoUrl?.trim())),
    [videos],
  );
  const visibleSelections = useMemo<ProjectGenerationRecordSelection[]>(
    () => [
      ...(showImages ? visibleImages.map((record) => ({ kind: "image" as const, record })) : []),
      ...(showVideos ? visibleVideos.map((record) => ({ kind: "video" as const, record })) : []),
    ],
    [showImages, showVideos, visibleImages, visibleVideos],
  );
  const selectedSelections = useMemo(
    () => selectedKeys
      .map((key) => visibleSelections.find((selection) => selectionKey(selection) === key))
      .filter((selection): selection is ProjectGenerationRecordSelection => Boolean(selection)),
    [selectedKeys, visibleSelections],
  );
  const isEmpty = (!showImages || visibleImages.length === 0) && (!showVideos || visibleVideos.length === 0);

  function toggleSelected(selection: ProjectGenerationRecordSelection) {
    const key = selectionKey(selection);
    setSelectedKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (maxSelection === 1) return [key];
      if (maxSelection && current.length >= maxSelection) return current;
      return [...current, key];
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      showImages ? responseJson(fetchGalleryRecords(projectId)) : Promise.resolve([]),
      showVideos ? responseJson(fetchVideoGalleryRecords(projectId)) : Promise.resolve([]),
    ])
      .then(([nextImages, nextVideos]) => {
        if (cancelled) return;
        setImages(nextImages);
        setVideos(nextVideos);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "加载生成记录失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, showImages, showVideos]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="选择生成记录"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p>GENERATION RECORDS</p>
            <h3>选择生成记录</h3>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        {showImages ? (
          <div className={styles.actions} role="group" aria-label="图片记录筛选">
            <button type="button" className={imageFilter === "all" ? styles.active : ""} onClick={() => {
              setImageFilter("all");
              setSelectedKeys([]);
            }}>
              全部图片
            </button>
            <button type="button" className={imageFilter === "grok-spicy" ? styles.active : ""} onClick={() => {
              setImageFilter("grok-spicy");
              setSelectedKeys([]);
            }}>
              Grok 可 Spicy
            </button>
          </div>
        ) : null}

        {error ? <p className={styles.state}>{error}</p> : null}
        {loading ? <p className={styles.state}>正在加载生成记录...</p> : null}
        {!loading && !error && isEmpty ? (
          <p className={styles.state}>当前项目没有可用于此槽位的生成记录。</p>
        ) : null}

        <div className={styles.grid}>
          {showImages
            ? visibleImages.map((record) => {
                const spicyReady = isGrokSpicyReadyRecord(record);
                const selection: ProjectGenerationRecordSelection = { kind: "image", record };
                const selected = selectedKeys.includes(selectionKey(selection));
                return (
                  <button
                    type="button"
                    key={`image:${record.id}`}
                    className={[styles.card, selected ? styles.cardSelected : ""].filter(Boolean).join(" ")}
                    aria-pressed={selected}
                    onClick={() => toggleSelected(selection)}
                  >
                    <span className={styles.media}>
                      <span style={{ backgroundImage: `url(${JSON.stringify(record.thumbnailUrl || record.imageUrl || "")})` }} />
                    </span>
                    <span className={styles.badge}>{spicyReady ? "Grok 可 Spicy" : "图片"}</span>
                    {selected ? <span className={styles.checkMark} aria-hidden>✓</span> : null}
                    <strong>{recordTitle(record.userInput || record.finalPrompt, "生成图片")}</strong>
                    <small>{record.modelName} · {formatCreatedAt(record.createdAt)}</small>
                  </button>
                );
              })
            : null}
          {showVideos
            ? visibleVideos.map((record) => {
                const selection: ProjectGenerationRecordSelection = { kind: "video", record };
                const selected = selectedKeys.includes(selectionKey(selection));
                return (
                  <button
                    type="button"
                    key={`video:${record.id}`}
                    className={[styles.card, selected ? styles.cardSelected : ""].filter(Boolean).join(" ")}
                    aria-pressed={selected}
                    onClick={() => toggleSelected(selection)}
                  >
                    <span className={styles.media}>
                      <video src={record.videoUrl} muted playsInline preload="metadata" />
                    </span>
                    <span className={styles.badge}>视频</span>
                    {selected ? <span className={styles.checkMark} aria-hidden>✓</span> : null}
                    <strong>{recordTitle(record.finalPrompt, "生成视频")}</strong>
                    <small>{record.modelName} · {formatCreatedAt(record.createdAt)}</small>
                  </button>
                );
              })
            : null}
        </div>
        <footer className={styles.footer}>
          <span>已选 {selectedSelections.length} 个</span>
          <div>
            <button type="button" onClick={onClose}>取消</button>
            <button type="button" disabled={selectedSelections.length === 0} onClick={() => onSelect(selectedSelections)}>
              上传
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
