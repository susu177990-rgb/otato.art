"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PromptPresetKind, SitePromptPreset } from "@/lib/db/prompt-preset-store";
import {
  PROMPT_PRESET_KINDS,
  fetchAllSitePromptPresets,
  setSitePromptPresetFavorite,
} from "@/lib/prompt-preset-api-client";
import { PROMPT_TAG_GROUPS, PROMPT_UNCATEGORIZED_TAG, normalizePromptTags } from "@/lib/prompt-tags";
import { PromptPresetCard } from "./PromptPresetCard";
import { PromptPresetPreviewDialog } from "./PromptPresetPreviewDialog";
import styles from "./prompt-preset-library-dialog.module.css";

type PromptFilter = "all" | PromptPresetKind | "favorite";

const KIND_LABELS: Record<PromptPresetKind, string> = {
  image: "生图",
  video: "生视频",
  chat: "对话",
};

const FILTERS: Array<{ id: PromptFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "image", label: "生图" },
  { id: "video", label: "生视频" },
  { id: "chat", label: "对话" },
  { id: "favorite", label: "已收藏" },
];

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function presetMatchesSearch(preset: SitePromptPreset, query: string): boolean {
  if (!query) return true;
  return [preset.title, preset.description ?? "", preset.promptTemplate, ...normalizePromptTags(preset.tags)]
    .join("\n")
    .toLocaleLowerCase()
    .includes(query);
}

function presetMatchesSecondaryTag(preset: SitePromptPreset, activeTag: string | null): boolean {
  if (!activeTag) return true;
  const tags = normalizePromptTags(preset.tags);
  if (activeTag === PROMPT_UNCATEGORIZED_TAG) return tags.length === 0;
  return tags.includes(activeTag);
}

function promptPresetModelLabels(kind: PromptPresetKind): string[] {
  if (kind === "image") return ["GPT Image", "Nano Banana"];
  if (kind === "video") return ["生视频"];
  return ["对话"];
}

export function PromptPresetLibraryDialog({
  open,
  onClose,
  activePresetId,
  allowedApplyKinds = PROMPT_PRESET_KINDS,
  onApplyPreset,
  clearAction,
  onFavoriteChange,
}: {
  open: boolean;
  onClose: () => void;
  activePresetId?: string | null;
  allowedApplyKinds?: PromptPresetKind[] | "all";
  onApplyPreset: (preset: SitePromptPreset) => void | Promise<void>;
  clearAction?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
  onFavoriteChange?: (preset: SitePromptPreset, isFavorite: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<PromptFilter>("all");
  const [secondaryTag, setSecondaryTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<SitePromptPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [favoriteSavingById, setFavoriteSavingById] = useState<Record<string, boolean>>({});
  const [previewPreset, setPreviewPreset] = useState<SitePromptPreset | null>(null);

  const canApplyKind = useCallback(
    (kind: PromptPresetKind) => allowedApplyKinds === "all" || allowedApplyKinds.includes(kind),
    [allowedApplyKinds],
  );

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPresets(await fetchAllSitePromptPresets());
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法加载提示词预设");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setPreviewPreset(null);
      return;
    }
    void loadPresets();
  }, [loadPresets, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    setSecondaryTag(null);
  }, [filter]);

  const counts = useMemo(() => {
    const next: Record<PromptFilter, number> = {
      all: presets.length,
      image: 0,
      video: 0,
      chat: 0,
      favorite: 0,
    };
    for (const preset of presets) {
      next[preset.kind] += 1;
      if (preset.isFavorite) next.favorite += 1;
    }
    return next;
  }, [presets]);

  const filteredPresets = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return presets.filter((preset) => {
      const kindMatched = filter === "all" || filter === preset.kind || (filter === "favorite" && preset.isFavorite);
      const tagMatched =
        filter === "image" || filter === "video" || filter === "chat"
          ? presetMatchesSecondaryTag(preset, secondaryTag)
          : true;
      return kindMatched && tagMatched && presetMatchesSearch(preset, normalizedQuery);
    });
  }, [filter, presets, query, secondaryTag]);

  const activeKind = filter === "image" || filter === "video" || filter === "chat" ? filter : null;
  const secondaryTags = activeKind ? PROMPT_TAG_GROUPS[activeKind] : [];

  async function toggleFavorite(preset: SitePromptPreset) {
    const nextFavorite = !preset.isFavorite;
    const previousPresets = presets;
    setFavoriteSavingById((prev) => ({ ...prev, [preset.id]: true }));
    setPresets((prev) => prev.map((item) => (item.id === preset.id ? { ...item, isFavorite: nextFavorite } : item)));
    setError("");
    try {
      await setSitePromptPresetFavorite(preset.id, nextFavorite);
      onFavoriteChange?.(preset, nextFavorite);
    } catch (e) {
      setPresets(previousPresets);
      setError(e instanceof Error ? e.message : "收藏更新失败");
    } finally {
      setFavoriteSavingById((prev) => {
        const next = { ...prev };
        delete next[preset.id];
        return next;
      });
    }
  }

  async function handleClearAction() {
    if (!clearAction) return;
    try {
      await clearAction.onClick();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div
        className={styles.root}
        role="dialog"
        aria-modal="true"
        aria-label="提示词预设"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className={styles.frame}>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭">
            ×
          </button>
          <section
            className={styles.panel}
            data-canvas-no-zoom
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.hero}>
              <div>
                <p className={styles.eyebrow}>Prompt Presets</p>
                <h2>提示词预设</h2>
                <p>搜索、收藏并查看现有预设，快速找到可复用的创作提示词。</p>
              </div>
              <div className={styles.heroActions}>
                <label className={styles.searchBox}>
                  <span>搜索</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="输入标题、描述或提示词内容"
                    spellCheck={false}
                  />
                </label>
                {clearAction ? (
                  <div className={styles.headerButtons}>
                  <button type="button" className={styles.clearButton} onClick={() => void handleClearAction()}>
                    {clearAction.label}
                  </button>
                  </div>
                ) : null}
              </div>
            </header>

            <div className={styles.filterBar} role="tablist" aria-label="提示词预设分类">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[styles.filterButton, filter === item.id ? styles.filterButtonActive : ""].filter(Boolean).join(" ")}
                onClick={() => setFilter(item.id)}
                role="tab"
                aria-selected={filter === item.id}
              >
                <span>{item.label}</span>
                <strong>{counts[item.id]}</strong>
              </button>
            ))}
            </div>

            {activeKind ? (
            <div className={styles.secondaryFilterBar} role="tablist" aria-label={`${KIND_LABELS[activeKind]}二级标签`}>
              <button
                type="button"
                className={[styles.secondaryFilterButton, secondaryTag === null ? styles.secondaryFilterButtonActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSecondaryTag(null)}
                role="tab"
                aria-selected={secondaryTag === null}
              >
                全部
              </button>
              {secondaryTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={[styles.secondaryFilterButton, secondaryTag === tag ? styles.secondaryFilterButtonActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSecondaryTag(tag)}
                  role="tab"
                  aria-selected={secondaryTag === tag}
                >
                  {tag}
                </button>
              ))}
              <button
                type="button"
                className={[
                  styles.secondaryFilterButton,
                  secondaryTag === PROMPT_UNCATEGORIZED_TAG ? styles.secondaryFilterButtonActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSecondaryTag(PROMPT_UNCATEGORIZED_TAG)}
                role="tab"
                aria-selected={secondaryTag === PROMPT_UNCATEGORIZED_TAG}
              >
                未分类
              </button>
            </div>
            ) : null}

            {error ? (
            <div className={styles.messageBox} role="status">
              <span>{error}</span>
              <button type="button" className={styles.inlineAction} onClick={() => void loadPresets()}>
                重试
              </button>
            </div>
            ) : null}

            <div className={styles.grid} data-canvas-scroll-area onWheel={(event) => event.stopPropagation()}>
            {loading ? (
              <div className={styles.emptyState}>正在加载提示词预设…</div>
            ) : filteredPresets.length === 0 ? (
              <div className={styles.emptyState}>暂无匹配的提示词预设</div>
            ) : (
              filteredPresets.map((preset) => {
                const canApply = canApplyKind(preset.kind);
                return (
                  <PromptPresetCard
                    key={preset.id}
                    kind={preset.kind}
                    title={preset.title}
                    description={preset.description}
                    coverImageUrl={preset.coverImageUrl}
                    tags={preset.tags}
                    modelLabels={promptPresetModelLabels(preset.kind)}
                    active={activePresetId === preset.id}
                    favorite={Boolean(preset.isFavorite)}
                    favoriteSaving={Boolean(favoriteSavingById[preset.id])}
                    selectDisabled={!canApply}
                    actionMode="viewAndFavorite"
                    selectLabel={canApply ? `选择 ${preset.title}` : `${KIND_LABELS[preset.kind]}预设不能在当前页面直接使用`}
                    onSelect={() => {
                      if (canApply) void onApplyPreset(preset);
                    }}
                    onViewPrompt={() => setPreviewPreset(preset)}
                    onToggleFavorite={() => void toggleFavorite(preset)}
                  />
                );
              })
            )}
            </div>
          </section>
        </div>
      </div>
      {previewPreset ? (
        <PromptPresetPreviewDialog
          title={previewPreset.title}
          prompt={previewPreset.promptTemplate}
          onClose={() => setPreviewPreset(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}
