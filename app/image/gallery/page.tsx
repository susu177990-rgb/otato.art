"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GPT_IMAGE_QUALITY_LABELS, type ImageAspectRatio, type ImageGalleryRecord } from "@/lib/image-workspace";
import { loadImageGallery, saveImageGallery } from "@/lib/image-storage";
import shellStyles from "../../shared/shell.module.css";
import styles from "./gallery-page.module.css";

function aspectRatioStyle(ratio: ImageAspectRatio) {
  if (ratio === "auto") return undefined;
  return { aspectRatio: ratio.replaceAll(":", " / ") } as const;
}

export default function ImageGalleryPage() {
  const [records, setRecords] = useState<ImageGalleryRecord[]>([]);
  const [selected, setSelected] = useState<ImageGalleryRecord | null>(null);

  useEffect(() => {
    setRecords(loadImageGallery());
  }, []);

  function updateRecords(next: ImageGalleryRecord[]) {
    setRecords(next);
    saveImageGallery(next);
    if (selected && !next.some((record) => record.id === selected.id)) {
      setSelected(null);
    }
  }

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const visibleRecords = records.filter(
    (record) => record.status === "success" && Boolean(record.imageUrl),
  );

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/image" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回作图
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>作图画廊</p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <button
            type="button"
            onClick={() => updateRecords([])}
            disabled={records.length === 0}
            className={[shellStyles.navLink, shellStyles.navLinkDanger].join(" ")}
          >
            清空记录
          </button>
        </nav>
      </header>

      <div className={styles.galleryBody}>
        {visibleRecords.length === 0 ? (
          <div className={styles.empty}>暂无生图记录</div>
        ) : (
          <div className={styles.masonry}>
            {visibleRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelected(record)}
                className={styles.masonryItem}
                aria-label={`${record.modeName} · ${new Date(record.createdAt).toLocaleString()}`}
              >
                <span className={styles.tile}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.imageUrl}
                    alt={record.modeName}
                    className={styles.tileImg}
                    style={aspectRatioStyle(record.aspectRatio)}
                    loading="lazy"
                  />
                  <span className={styles.tileMeta}>
                    <span className={styles.tileMetaName}>{record.modeName}</span>
                    <span className={styles.tileMetaInfo}>
                      {record.aspectRatio} · {record.imageSize}
                      {record.gptImageQuality ? ` · 细节程度：${GPT_IMAGE_QUALITY_LABELS[record.gptImageQuality]}` : ""}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setSelected(null)}
              aria-label="关闭"
            >
              ×
            </button>

            <div className={styles.modalImageWrap}>
              {selected.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={selected.imageUrl} alt={selected.modeName} className={styles.modalImage} />
              ) : (
                <div className={styles.modalFail}>{selected.error || "生成失败"}</div>
              )}
            </div>

            <aside className={styles.modalSide}>
              <div>
                <h2 className={styles.modalTitle}>{selected.modeName}</h2>
                <p className={styles.modalSubtitle}>{new Date(selected.createdAt).toLocaleString()}</p>
              </div>

              <dl className={styles.metaGrid}>
                <div className={styles.metaCell}>
                  <dt>模型</dt>
                  <dd className={styles.mono}>{selected.modelName}</dd>
                </div>
                <div className={styles.metaCell}>
                  <dt>参数</dt>
                  <dd>
                    {selected.aspectRatio} · {selected.imageSize}
                    {selected.gptImageQuality ? ` · 细节程度：${GPT_IMAGE_QUALITY_LABELS[selected.gptImageQuality]}` : ""}
                  </dd>
                </div>
                <div className={styles.metaCell}>
                  <dt>参考图</dt>
                  <dd>{selected.refImageCount} 张</dd>
                </div>
                <div className={styles.metaCell}>
                  <dt>状态</dt>
                  <dd className={selected.status === "success" ? styles.statusOk : styles.statusFail}>
                    {selected.status === "success" ? "成功" : selected.error || "失败"}
                  </dd>
                </div>
              </dl>

              <div className={styles.section}>
                <h3>作图输入</h3>
                {selected.userInputSecondary ? (
                  <>
                    <p className={styles.sectionHint}>左栏 / 绘画风格与质感</p>
                    <pre className={styles.proseBlock}>{selected.userInput || "（无）"}</pre>
                    <p className={styles.sectionHint}>右栏 / 分镜剧本</p>
                    <pre className={styles.proseBlock}>{selected.userInputSecondary}</pre>
                  </>
                ) : (
                  <pre className={styles.proseBlock}>{selected.userInput || "（无）"}</pre>
                )}
              </div>

              <div className={styles.section}>
                <h3>最终提示词</h3>
                <pre className={[styles.proseBlock, styles.mono].join(" ")}>
                  {selected.finalPrompt || "（无）"}
                </pre>
              </div>

              <div className={styles.modalActions}>
                {selected.imageUrl ? (
                  <a
                    href={selected.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={[shellStyles.navLink, styles.modalAction].join(" ")}
                  >
                    打开原图
                  </a>
                ) : null}
                <button
                  type="button"
                  className={[shellStyles.navLink, shellStyles.navLinkDanger, styles.modalAction].join(" ")}
                  onClick={() => updateRecords(records.filter((record) => record.id !== selected.id))}
                >
                  删除
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </main>
  );
}
