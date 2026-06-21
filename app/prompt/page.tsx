"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { PromptPresetKind, SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { PromptPresetCard } from "@/components/prompt-presets/PromptPresetCard";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import { fetchAllSitePromptPresets, setSitePromptPresetFavorite, submitPromptPresetContribution } from "@/lib/prompt-preset-api-client";
import {
  PROMPT_TAG_GROUPS,
  PROMPT_UNCATEGORIZED_TAG,
  normalizePromptTags,
  togglePromptTag,
} from "@/lib/prompt-tags";
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

const EMPTY_UPLOAD_FORM = {
  kind: "image" as PromptPresetKind,
  title: "",
  description: "",
  promptTemplate: "",
  coverFile: null as File | null,
  tags: [] as string[],
};

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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError("");
    setNeedsLogin(false);
    try {
      const next = await fetchAllSitePromptPresets();
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

  async function submitUploadPreset() {
    setUploadSaving(true);
    setUploadError("");
    setUploadSuccess("");
    setError("");
    setNeedsLogin(false);
    try {
      await submitPromptPresetContribution({
        kind: uploadForm.kind,
        title: uploadForm.title,
        description: uploadForm.description,
        promptTemplate: uploadForm.promptTemplate,
        coverFile: uploadForm.coverFile,
        tags: uploadForm.tags,
      });
      setFilter(uploadForm.kind);
      setSecondaryTag(null);
      setQuery("");
      setUploadOpen(false);
      setUploadForm(EMPTY_UPLOAD_FORM);
      setUploadSuccess("投稿已提交，管理员审核通过后会进入全站预设库。");
    } catch (e) {
      const message = e instanceof Error ? e.message : "提交提示词投稿失败";
      setUploadError(message);
      if (message.includes("请先登录")) {
        setError(message);
        setNeedsLogin(true);
      }
    } finally {
      setUploadSaving(false);
    }
  }

  const activeKind = filter === "image" || filter === "video" || filter === "chat" ? filter : null;
  const secondaryTags = activeKind ? PROMPT_TAG_GROUPS[activeKind] : [];

  return (
    <main className={[shellStyles.page, styles.promptPage].join(" ")}>
      <header className={styles.promptTopbar}>
        <div className={styles.promptTopbarIdentity}>
          <Link href="/" className={styles.promptTopbarBack}>
            首页
          </Link>
        </div>

        <nav className={styles.promptTopbarModes} aria-label="提示词预设导航">
          <Link href="/projects" className={styles.promptTopbarMode}>
            项目列表
          </Link>
          <span className={styles.promptTopbarModeActive}>预设社区</span>
        </nav>

        <div className={styles.promptTopbarActions}>
          <button type="button" className={styles.promptTopbarAction} onClick={() => setUploadOpen(true)}>
            投稿提示词
          </button>
          <TopbarAccountActions linkClassName={styles.promptTopbarAction} />
        </div>
      </header>

      <div className={styles.promptBody}>
        {uploadSuccess ? (
          <div className={styles.messageBox} role="status">
            <span>{uploadSuccess}</span>
          </div>
        ) : null}
        <div className={styles.filterBar}>
          <div className={styles.filterButtons} role="tablist" aria-label="提示词预设分类">
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
          <label className={styles.searchBox}>
            <span className={styles.visuallyHidden}>搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索提示词"
              spellCheck={false}
            />
          </label>
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
      {uploadOpen ? (
        <UploadPromptPresetDialog
          form={uploadForm}
          saving={uploadSaving}
          error={uploadError}
          onClose={() => {
            if (uploadSaving) return;
            setUploadOpen(false);
            setUploadError("");
          }}
          onChange={setUploadForm}
          onSubmit={() => void submitUploadPreset()}
        />
      ) : null}
    </main>
  );
}

function UploadPromptPresetDialog({
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  form: typeof EMPTY_UPLOAD_FORM;
  saving: boolean;
  error: string;
  onClose: () => void;
  onChange: (next: typeof EMPTY_UPLOAD_FORM) => void;
  onSubmit: () => void;
}) {
  const tagValue = normalizePromptTags(form.tags);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function setKind(kind: PromptPresetKind) {
    onChange({
      ...form,
      kind,
      coverFile: kind === "chat" ? null : form.coverFile,
      tags: [],
    });
  }

  return (
    <div
      className={styles.uploadDialogRoot}
      role="dialog"
      aria-modal="true"
      aria-label="投稿提示词预设"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={[shellStyles.card, styles.uploadDialogCard].join(" ")} onPointerDown={(event) => event.stopPropagation()}>
        <header className={[shellStyles.cardHead, styles.uploadDialogHead].join(" ")}>
          <div>
            <p className={styles.eyebrow}>Submit Preset</p>
            <h2 className={styles.uploadDialogTitle}>投稿提示词预设</h2>
            <p className={styles.uploadDialogSubtitle}>提交后进入审核队列，通过后才会出现在全站预设库。</p>
          </div>
          <button type="button" className={styles.uploadCloseButton} onClick={onClose} disabled={saving} aria-label="关闭">
            ×
          </button>
        </header>

        <article className={[shellStyles.card, styles.uploadPresetCard].join(" ")}>
          <header className={[shellStyles.cardHead, styles.uploadPresetCardHead].join(" ")}>
            <label className={styles.promptModeLabelEdit}>
              <span className={styles.visuallyHidden}>预设名称</span>
              <input
                className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                value={form.title}
                onChange={(event) => onChange({ ...form, title: event.target.value })}
                placeholder="预设标题"
                aria-label="预设标题"
              />
            </label>
            <div className={styles.uploadPresetActions}>
              <button type="button" className={shellStyles.buttonSubtle} onClick={onClose} disabled={saving}>
                取消
              </button>
              <button type="button" className={shellStyles.buttonSubtle} onClick={onSubmit} disabled={saving}>
                {saving ? "提交中…" : "提交投稿"}
              </button>
            </div>
          </header>

          <div className={styles.uploadPresetBody}>
            <div className={styles.uploadKindModelRow}>
              <div className={styles.uploadKindField}>
                <span className={shellStyles.fieldLabel}>预设类型</span>
                <div className={styles.uploadKindButtons} role="group" aria-label="预设类型">
                  {PROMPT_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={[styles.uploadKindButton, form.kind === kind ? styles.uploadKindButtonActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                      aria-pressed={form.kind === kind}
                      onClick={() => setKind(kind)}
                    >
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
              </div>
              {form.kind === "image" ? (
                <div className={styles.uploadModelField}>
                  <span className={shellStyles.fieldLabel}>推荐模型</span>
                  <div className={styles.uploadModelButtons} aria-label="推荐模型">
                    {promptPresetModelLabels(form.kind).map((label) => (
                      <span key={label} className={styles.uploadModelButton}>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.promptTagField}>
              <span className={shellStyles.fieldLabel}>二级标签</span>
              <div className={styles.promptTagPicker} role="group" aria-label="二级标签">
                {PROMPT_TAG_GROUPS[form.kind].map((tag) => {
                  const active = tagValue.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={[styles.promptTagButton, active ? styles.promptTagButtonActive : ""].filter(Boolean).join(" ")}
                      aria-pressed={active}
                      onClick={() => onChange({ ...form, tags: togglePromptTag(tagValue, tag) })}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className={shellStyles.field}>
              <span className={shellStyles.fieldLabel}>卡片描述（可选）</span>
              <textarea
                className={[shellStyles.textarea, styles.promptDescriptionTextarea, styles.noResize].join(" ")}
                value={form.description}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
                placeholder="简述这个预设适合什么场景"
              />
            </label>

            <div className={[styles.promptUploadPair, form.kind === "chat" ? styles.promptUploadPairSingle : ""].filter(Boolean).join(" ")}>
              <label className={[shellStyles.field, styles.promptTextField].join(" ")}>
                <span className={shellStyles.fieldLabel}>提示词内容</span>
                <textarea
                  className={[shellStyles.textarea, shellStyles.mono, styles.promptModeTextarea, styles.noResize].join(" ")}
                  value={form.promptTemplate}
                  onChange={(event) => onChange({ ...form, promptTemplate: event.target.value })}
                  spellCheck={false}
                  placeholder="粘贴完整提示词..."
                />
              </label>

              {form.kind === "chat" ? null : (
                <div className={styles.uploadCoverSlot} aria-label="预设封面">
                  <span className={shellStyles.fieldLabel}>预设封面（可选）</span>
                  <div className={[styles.uploadCoverFrame, form.coverFile ? styles.uploadCoverFrameFilled : ""].filter(Boolean).join(" ")}>
                    <label className={styles.uploadCoverUploadLabel}>
                      <span className={styles.uploadCoverLabel}>
                        {form.coverFile ? form.coverFile.name : form.kind === "video" ? "上传 GIF / 图片封面" : "上传图片封面"}
                      </span>
                      <span className={styles.uploadCoverHint}>本地上传 · 自动压缩并转 WebP · 最大 5MB</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className={styles.uploadCoverFileInput}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          event.target.value = "";
                          onChange({ ...form, coverFile: file });
                        }}
                      />
                    </label>
                    {form.coverFile ? (
                      <button
                        type="button"
                        className={styles.uploadCoverDelete}
                        aria-label="移除封面"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onChange({ ...form, coverFile: null });
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

        {error ? (
          <div className={styles.messageBox} role="status">
            <span>{error}</span>
            {error.includes("请先登录") ? (
              <Link href="/login?next=/prompt" className={styles.inlineAction}>
                登录 / 注册
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function PromptPage() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <PromptPageInner />
    </Suspense>
  );
}
