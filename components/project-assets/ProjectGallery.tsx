"use client";

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
  onConvertImage?: (item: Extract<ProjectGalleryItem, { kind: "image" }>) => void;
};

export function ProjectGallery({
  items,
  loading = false,
  onConvertImage,
}: ProjectGalleryProps) {
  if (loading) return <p className={styles.empty}>正在加载项目画廊...</p>;
  if (items.length === 0) {
    return <p className={styles.empty}>项目画廊还没有生成记录或素材。</p>;
  }

  return (
    <div className={styles.galleryGrid}>
      {items.map((item) => (
        <article className={styles.galleryCard} key={item.id}>
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
              {item.kind === "project-asset"
                ? TYPE_LABELS[item.assetType]
                : item.kind === "image"
                  ? "图片"
                  : "视频"}
            </span>
          </div>
          <div className={styles.cardBody}>
            <strong>{item.name}</strong>
            {item.description ? <p>{item.description}</p> : null}
            {item.kind === "image" && onConvertImage ? (
              <button type="button" onClick={() => onConvertImage(item)}>
                转存为素材
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
