"use client";

import { useState, type CSSProperties } from "react";
import type { PromptPresetKind } from "@/lib/db/prompt-preset-store";
import { normalizePromptTags } from "@/lib/prompt-tags";
import styles from "./prompt-preset-card.module.css";

const KIND_LABELS: Record<PromptPresetKind, string> = {
  image: "生图",
  video: "生视频",
  chat: "对话",
};

type PromptPresetCardActionMode = "favoriteOnly" | "viewAndFavorite";

export function PromptPresetCard({
  kind,
  title,
  description,
  coverImageUrl,
  tags,
  modelLabels,
  active = false,
  favorite = false,
  favoriteSaving = false,
  selectDisabled = false,
  actionMode,
  selectLabel,
  onSelect,
  onViewPrompt,
  onToggleFavorite,
}: {
  kind: PromptPresetKind;
  title: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  modelLabels?: string[];
  active?: boolean;
  favorite?: boolean;
  favoriteSaving?: boolean;
  selectDisabled?: boolean;
  actionMode: PromptPresetCardActionMode;
  selectLabel?: string;
  onSelect: () => void;
  onViewPrompt?: () => void;
  onToggleFavorite: () => void;
}) {
  const normalizedTags = normalizePromptTags(tags);
  const labels = modelLabels?.filter((label) => label.trim()) ?? [KIND_LABELS[kind]];
  const coverUrl = coverImageUrl?.trim();
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const rawCoverAspect = naturalAspect && Number.isFinite(naturalAspect) && naturalAspect > 0 ? naturalAspect : 16 / 9;
  const coverAspect = Math.min(2.15, Math.max(0.75, rawCoverAspect));
  const desc = description?.trim() || "无描述";

  return (
    <article
      className={[
        styles.card,
        actionMode === "viewAndFavorite" ? styles.cardCompact : "",
        active ? styles.cardActive : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={styles.main}
        onClick={onSelect}
        disabled={selectDisabled}
        aria-label={selectLabel ?? `选择 ${title}`}
      >
        <span
          className={styles.cover}
          style={{ "--preset-cover-aspect": coverAspect } as CSSProperties}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setNaturalAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          ) : (
            <span className={styles.coverFallback}>{title}</span>
          )}
          <span className={styles.coverTopChips} aria-label="预设分类">
            <span className={styles.coverChip}>{KIND_LABELS[kind]}</span>
            {normalizedTags.slice(0, 4).map((tag) => (
              <span key={tag} className={styles.coverChip}>
                {tag}
              </span>
            ))}
          </span>
          <span className={styles.coverModelChips} aria-label="适配模型">
            {labels.map((label) => (
              <span key={label} className={styles.coverModelChip}>
                {label}
              </span>
            ))}
          </span>
        </span>
        <span className={styles.info}>
          <strong className={styles.title}>{title}</strong>
          <span className={styles.description}>{desc}</span>
        </span>
      </button>
      <div className={[styles.cardFooter, actionMode === "favoriteOnly" ? styles.cardFooterSingle : ""].join(" ")}>
        {actionMode === "viewAndFavorite" ? (
          <button type="button" className={styles.footerButton} onClick={onViewPrompt}>
            查看提示词
          </button>
        ) : null}
        <button
          type="button"
          className={[styles.footerButton, favorite ? styles.favoriteActive : ""].filter(Boolean).join(" ")}
          onClick={onToggleFavorite}
          disabled={favoriteSaving}
          aria-pressed={favorite}
        >
          {favorite ? "已收藏" : "收藏"}
        </button>
      </div>
    </article>
  );
}
