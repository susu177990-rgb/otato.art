"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { PromptPresetKind, SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { PromptPresetCard } from "@/components/prompt-presets/PromptPresetCard";
import { fetchSitePromptPresets, setSitePromptPresetFavorite } from "@/lib/prompt-preset-api-client";
import { PROMPT_TAG_GROUPS, PROMPT_UNCATEGORIZED_TAG, normalizePromptTags } from "@/lib/prompt-tags";
import shellStyles from "../shared/shell.module.css";
import styles from "./prompt-page.module.css";

type PromptFilter = "all" | PromptPresetKind | "favorite";

const PROMPT_KINDS: PromptPresetKind[] = ["image", "video", "chat"];

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

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function PromptPageInner() {
  const [filter, setFilter] = useState<PromptFilter>("all");
  const [secondaryTag, setSecondaryTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<SitePromptPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [favoriteSavingById, setFavoriteSavingById] = useState<Record<string, boolean>>({});
  const [copiedPresetId, setCopiedPresetId] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError("");
    setNeedsLogin(false);
    try {
      const grouped = await Promise.all(PROMPT_KINDS.map((kind) => fetchSitePromptPresets(kind)));
      const next = grouped.flat();
      setPresets(next);
      setSelectedPresetId((current) => current ?? next[0]?.id ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "无法加载提示词预设";
      setError(message);
      setNeedsLogin(message.includes("请先登录"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

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

  const selectedPreset = useMemo(
    () => filteredPresets.find((preset) => preset.id === selectedPresetId) ?? filteredPresets[0] ?? null,
    [filteredPresets, selectedPresetId],
  );

  async function toggleFavorite(preset: SitePromptPreset) {
    const nextFavorite = !preset.isFavorite;
    const previousPresets = presets;
    setFavoriteSavingById((prev) => ({ ...prev, [preset.id]: true }));
    setPresets((prev) => prev.map((item) => (item.id === preset.id ? { ...item, isFavorite: nextFavorite } : item)));
    setError("");
    try {
      await setSitePromptPresetFavorite(preset.id, nextFavorite);
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

  async function copyPreset(preset: SitePromptPreset) {
    await copyTextToClipboard(preset.promptTemplate);
    setCopiedPresetId(preset.id);
    window.setTimeout(() => setCopiedPresetId((current) => (current === preset.id ? null : current)), 1400);
  }

  const statusText = loading
    ? "加载中"
    : `${filteredPresets.length} / ${presets.length} 条预设`;
  const activeKind = filter === "image" || filter === "video" || filter === "chat" ? filter : null;
  const secondaryTags = activeKind ? PROMPT_TAG_GROUPS[activeKind] : [];

  return (
    <main className={[shellStyles.page, styles.promptPage].join(" ")}>
      <header className={shellStyles.topbar}>
        <nav className={shellStyles.topbarLeft} aria-label="提示词预设导航">
          <Link href="/" className={shellStyles.navLink}>
            返回首页
          </Link>
          <Link href="/settings" className={shellStyles.navLink}>
            API设置
          </Link>
        </nav>
        <div className={shellStyles.topnav}>
          <span className={styles.statusPill}>{statusText}</span>
        </div>
      </header>

      <div className={styles.promptBody}>
        <section className={styles.promptHero}>
          <div>
            <p className={styles.eyebrow}>Prompt Presets</p>
            <h1>提示词预设</h1>
            <p>搜索、收藏并复制现有预设，快速带走可复用的创作提示词。</p>
          </div>
          <label className={styles.searchBox}>
            <span>搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入标题、描述或提示词内容"
              spellCheck={false}
            />
          </label>
        </section>

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
            {needsLogin ? (
              <Link href="/login?next=/prompt" className={styles.inlineAction}>
                登录 / 注册
              </Link>
            ) : (
              <button type="button" className={styles.inlineAction} onClick={() => void loadPresets()}>
                重试
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.workspace}>
          <section className={styles.gridPanel} aria-label="提示词预设列表">
            {loading ? (
              <div className={styles.emptyState}>正在加载提示词预设…</div>
            ) : filteredPresets.length === 0 ? (
              <div className={styles.emptyState}>暂无匹配的提示词预设</div>
            ) : (
              <div className={styles.presetGrid}>
                {filteredPresets.map((preset) => (
                  <PromptPresetCard
                    key={preset.id}
                    kind={preset.kind}
                    title={preset.title}
                    description={preset.description}
                    coverImageUrl={preset.coverImageUrl}
                    tags={preset.tags}
                    modelLabels={promptPresetModelLabels(preset.kind)}
                    active={selectedPreset?.id === preset.id}
                    favorite={Boolean(preset.isFavorite)}
                    favoriteSaving={Boolean(favoriteSavingById[preset.id])}
                    actionMode="favoriteOnly"
                    selectLabel={`查看 ${preset.title}`}
                    onSelect={() => setSelectedPresetId(preset.id)}
                    onToggleFavorite={() => void toggleFavorite(preset)}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className={styles.detailPanel} aria-label="提示词预设详情">
            {selectedPreset ? (
              <>
                <div className={styles.detailHead}>
                  <div>
                    <p className={styles.eyebrow}>{KIND_LABELS[selectedPreset.kind]}</p>
                    <h2>{selectedPreset.title}</h2>
                    {normalizePromptTags(selectedPreset.tags).length > 0 ? (
                      <div className={styles.detailTags}>
                        {normalizePromptTags(selectedPreset.tags).map((tag) => (
                          <span key={tag} className={styles.tagChip}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p>{selectedPreset.description?.trim() || "无描述"}</p>
                  </div>
                </div>
                <pre className={styles.promptPreview}>{selectedPreset.promptTemplate || "这个预设还没有提示词内容。"}</pre>
                <button type="button" className={styles.copyButton} onClick={() => void copyPreset(selectedPreset)}>
                  {copiedPresetId === selectedPreset.id ? "已复制提示词" : "复制提示词"}
                </button>
              </>
            ) : (
              <div className={styles.emptyState}>选择一张预设卡片查看完整提示词</div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function PromptPage() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <PromptPageInner />
    </Suspense>
  );
}
