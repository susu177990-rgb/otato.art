"use client";

import { useEffect, useState } from "react";
import { InlineVideoPlayer } from "@/components/media/InlineVideoPlayer";
import type { ProjectAssetType, ProjectGalleryItem } from "@/lib/project-assets";
import styles from "./project-assets.module.css";

const TYPE_LABELS: Record<ProjectAssetType, string> = {
  character: "角色",
  prop: "道具",
  scene: "场景",
};

export type ProjectGalleryProps = {
  items: ProjectGalleryItem[];
  loading?: boolean;
  onConvertItem?: (item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>) => void;
  onDeleteItem?: (item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>) => void;
};

export function ProjectGallery({
  items,
  loading = false,
  onConvertItem,
  onDeleteItem,
}: ProjectGalleryProps) {
  const [previewItem, setPreviewItem] = useState<ProjectGalleryItem | null>(null);

  useEffect(() => {
    if (!previewItem) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewItem(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem]);

  if (loading) return <p className={styles.empty}>正在加载项目画廊...</p>;
  if (items.length === 0) {
    return <p className={styles.empty}>还没有生成记录。</p>;
  }

  return (
    <>
      <div className={styles.galleryGrid}>
        {items.map((item) => (
          <article
            className={styles.galleryCard}
            key={item.id}
            role="button"
            tabIndex={0}
            aria-label={`查看 ${item.name}`}
            onClick={() => setPreviewItem(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setPreviewItem(item);
              }
            }}
          >
            <div
              className={styles.media}
              style={
                item.kind === "video"
                  ? undefined
                  : { backgroundImage: `url(${JSON.stringify(item.thumbnailUrl || item.mediaUrl)})` }
              }
            >
              {item.kind === "video" ? (
                <video src={item.mediaUrl} preload="metadata" muted playsInline />
              ) : null}
              <span className={styles.kind}>
                {itemKindLabel(item)}
              </span>
            </div>
            <div className={[styles.cardBody, styles.galleryBody].join(" ")}>
              <strong>{item.name}</strong>
              {item.description ? <p>{item.description}</p> : null}
              {(item.kind === "image" || item.kind === "video") ? (
                <div className={styles.galleryIconActions}>
                  <button
                    type="button"
                    className={styles.iconAction}
                    aria-label="下载"
                    title="下载"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadGalleryItem(item).catch(console.error);
                    }}
                  >
                    <DownloadIcon />
                  </button>
                  {onDeleteItem ? (
                    <button
                      type="button"
                      className={[styles.iconAction, styles.deleteIconAction].join(" ")}
                      aria-label="删除"
                      title="删除"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteItem(item);
                      }}
                    >
                      <DeleteIcon />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {(item.kind === "image" || item.kind === "video") && onConvertItem ? (
                <button
                  type="button"
                  className={styles.convertAction}
                  onClick={(event) => {
                    event.stopPropagation();
                    onConvertItem(item);
                  }}
                >
                  转为素材
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {previewItem ? (
        <div className={styles.previewBackdrop} role="presentation" onClick={() => setPreviewItem(null)}>
          <section
            className={styles.previewDialog}
            role="dialog"
            aria-modal="true"
            aria-label={`查看 ${previewItem.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.previewClose}
              aria-label="关闭"
              onClick={() => setPreviewItem(null)}
            >
              ×
            </button>
            <div className={styles.previewMediaPane}>
              {previewItem.kind === "video" ? (
                <InlineVideoPlayer
                  src={previewItem.mediaUrl}
                  title={previewItem.name}
                  suggestedFileName={safeMediaDownloadName(previewItem.name, "video")}
                  className={styles.previewVideoPlayer}
                  videoClassName={styles.previewMedia}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewItem.mediaUrl} alt={previewItem.name} className={styles.previewMedia} />
              )}
            </div>
            <aside className={styles.previewDetails}>
              <div>
                <p className={styles.previewEyebrow}>{itemKindLabel(previewItem)}</p>
                <h3>{previewItem.name}</h3>
                <p className={styles.previewMeta}>{formatDate(previewItem.createdAt)}</p>
              </div>
              <dl className={styles.previewMetaGrid}>
                <div>
                  <dt>类型</dt>
                  <dd>{itemKindLabel(previewItem)}</dd>
                </div>
                <div>
                  <dt>记录</dt>
                  <dd>{previewItem.sourceRecordId}</dd>
                </div>
              </dl>
              <div className={styles.previewSection}>
                <h4>提示词</h4>
                <p>{previewItem.description || "无提示词记录"}</p>
              </div>
              {(previewItem.kind === "image" || previewItem.kind === "video") ? (
                <div className={styles.previewActions}>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadGalleryItem(previewItem).catch(console.error);
                    }}
                  >
                    下载
                  </button>
                  {onConvertItem ? (
                    <button type="button" onClick={() => onConvertItem(previewItem)}>
                      转为素材
                    </button>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </section>
        </div>
      ) : null}
    </>
  );
}

function itemKindLabel(item: ProjectGalleryItem): string {
  if (item.kind === "project-asset") return TYPE_LABELS[item.assetType];
  return item.kind === "image" ? "图片" : "视频";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function safeMediaDownloadName(name: string, kind: "image" | "video"): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "生成记录";
  const extension = kind === "video" ? "mp4" : "png";
  return `${base}.${extension}`;
}

export async function downloadMediaUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载失败");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.actionIcon}>
      <path d="M12 4v10" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={styles.actionIcon}>
      <path d="M8 8h8" />
      <path d="M9 8v10" />
      <path d="M15 8v10" />
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M10 5h4l1 3H9l1-3Z" />
    </svg>
  );
}

function safeDownloadName(item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>): string {
  const base = item.name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "生成记录";
  const extension = item.kind === "video" ? "mp4" : "png";
  return `${base}.${extension}`;
}

async function downloadGalleryItem(item: Extract<ProjectGalleryItem, { kind: "image" | "video" }>) {
  await downloadMediaUrl(item.mediaUrl, safeDownloadName(item));
}
