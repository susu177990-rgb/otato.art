"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { SkillPacksPanel } from "@/components/settings/SkillPacksPanel";
import { AdminUsersPanel } from "@/components/admin/AdminUserManagement";
import shellStyles from "../shared/shell.module.css";
import styles from "../settings/settings-page.module.css";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { API_KEY_MASK_PLACEHOLDER, isApiKeyConfiguredPlaceholder } from "@/lib/api-key-redaction";
import { normalizeModel } from "@/lib/model-presets";
import { normalizeLlmSettings } from "@/lib/llm-models";
import {
  deleteImageModeCover,
  deleteVideoModeCover,
  fetchAdminWorkspaceSnapshot,
  saveAdminWorkspaceSnapshot,
  uploadImageModeCover,
  uploadVideoModeCover,
} from "@/lib/workspace-api";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  defaultImageModePrompt,
  extractPromptPlaceholderOccurrences,
  newCustomImageModeId,
  type ImageModeId,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_MODEL_ORDER,
  VIDEO_MODES,
  VIDEO_MODE_LABELS,
  defaultVideoModePrompt,
  extractPromptPlaceholderOccurrences as extractVideoPromptPlaceholderOccurrences,
  getVideoModelDefinition,
  newCustomVideoModeId,
  type VideoPromptModeId,
  type VideoWorkspaceSettings,
} from "@/lib/video-workspace";
import type { PromptPresetSubmission, SitePromptPreset } from "@/lib/db/prompt-preset-store";
import {
  deleteSitePromptPreset,
  fetchPromptPresetSubmissions,
  fetchSitePromptPresets,
  replaceSitePromptPresets,
  reviewPromptPresetSubmission,
} from "@/lib/prompt-preset-api-client";
import { PROMPT_TAG_GROUPS, normalizePromptTags, togglePromptTag } from "@/lib/prompt-tags";

type SettingsCategory = "users" | "prompts" | "api";
type Tab =
  | "users"
  | "llmApi"
  | "imageApi"
  | "videoApi"
  | "imagePrompts"
  | "videoPrompts"
  | "chatPrompts"
  | "promptSubmissions"
  | "skillPacks";

const CATEGORY_DEFS: ReadonlyArray<{ id: SettingsCategory; label: string; defaultTab: Tab }> = [
  { id: "users", label: "用户管理", defaultTab: "users" },
  { id: "prompts", label: "预设库", defaultTab: "imagePrompts" },
  { id: "api", label: "系统 API", defaultTab: "llmApi" },
];

const SUBPAGE_DEFS: Record<SettingsCategory, ReadonlyArray<{ id: Tab; label: string }>> = {
  users: [],
  prompts: [
    { id: "promptSubmissions", label: "投稿审核" },
    { id: "imagePrompts", label: "生图提示词预设" },
    { id: "videoPrompts", label: "生视频提示词预设" },
    { id: "chatPrompts", label: "对话提示词预设" },
    { id: "skillPacks", label: "Skill设置" },
  ],
  api: [
    { id: "llmApi", label: "LLM" },
    { id: "imageApi", label: "图片" },
    { id: "videoApi", label: "视频" },
  ],
};

const settingsCardClass = [shellStyles.card, styles.floatCard].join(" ");

function mergePromptDescription(
  current: Record<string, string> | undefined,
  modeId: string,
  description: string,
): Record<string, string> {
  const next = { ...(current ?? {}) };
  const trimmed = description.trim();
  if (trimmed) next[modeId] = trimmed;
  else delete next[modeId];
  return next;
}

function apiKeyInputValue(value: string): string {
  return isApiKeyConfiguredPlaceholder(value) ? "" : value;
}

function apiKeyPlaceholder(value: string, fallback = "sk-..."): string {
  return isApiKeyConfiguredPlaceholder(value) ? API_KEY_MASK_PLACEHOLDER : fallback;
}

function nextLlmModelId(models: Settings["models"]): string {
  let index = Object.keys(models).length + 1;
  let id = `llm-${index}`;
  while (models[id]) {
    index += 1;
    id = `llm-${index}`;
  }
  return id;
}

function tabFromSearchParam(raw: string | null): Tab | null {
  if (
    raw === "users" ||
    raw === "llmApi" ||
    raw === "imageApi" ||
    raw === "imagePrompts" ||
    raw === "chatPrompts" ||
    raw === "promptSubmissions" ||
    raw === "videoApi" ||
    raw === "videoPrompts" ||
    raw === "skillPacks"
  ) {
    return raw;
  }
  return null;
}

function categoryForTab(tab: Tab): SettingsCategory {
  if (tab === "users") return "users";
  if (tab === "promptSubmissions" || tab === "imagePrompts" || tab === "videoPrompts" || tab === "chatPrompts" || tab === "skillPacks") return "prompts";
  return "api";
}

function AdminPageInner() {
  const searchParams = useSearchParams();
  const initialTab = tabFromSearchParam(searchParams.get("tab")) ?? "users";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [llmSettings, setLlmSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [videoSettings, setVideoSettings] = useState<VideoWorkspaceSettings>(DEFAULT_VIDEO_SETTINGS);
  const [adminState, setAdminState] = useState<"loading" | "ready" | "forbidden">("loading");
  const [savedMessage, setSavedMessage] = useState("");
  const [chatPromptPresets, setChatPromptPresets] = useState<SitePromptPreset[]>([]);
  const [promptSubmissions, setPromptSubmissions] = useState<PromptPresetSubmission[]>([]);
  const [promptSubmissionMessage, setPromptSubmissionMessage] = useState("");
  const imagePromptsPersistMergeRef = useRef<(() => ImageWorkspaceSettings) | null>(null);
  const videoPromptsPersistMergeRef = useRef<(() => VideoWorkspaceSettings) | null>(null);

  useEffect(() => {
    const fromUrl = tabFromSearchParam(searchParams.get("tab"));
    if (fromUrl) setTab(fromUrl);
  }, [searchParams]);

  const category = categoryForTab(tab);
  const subpages = SUBPAGE_DEFS[category];

  useEffect(() => {
    let cancelled = false;
    async function loadAdmin() {
      try {
        const auth = await fetch("/api/admin/me", { cache: "no-store" });
        if (!auth.ok) {
          if (!cancelled) setAdminState("forbidden");
          return;
        }
        const snapshot = await fetchAdminWorkspaceSnapshot().catch(() => null);
        if (cancelled) return;
        if (snapshot) {
          setLlmSettings(snapshot.llm ?? DEFAULT_SETTINGS);
          setImageSettings(snapshot.imageWorkspace);
          setVideoSettings(snapshot.videoWorkspace);
        }
        setAdminState("ready");
      } catch {
        if (!cancelled) setAdminState("forbidden");
      }
    }
    void loadAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshAdminWorkspace() {
    const snapshot = await fetchAdminWorkspaceSnapshot();
    setLlmSettings(snapshot.llm ?? DEFAULT_SETTINGS);
    setImageSettings(snapshot.imageWorkspace);
    setVideoSettings(snapshot.videoWorkspace);
  }

  useEffect(() => {
    if (adminState !== "ready") return;
    void fetchSitePromptPresets("chat")
      .then(setChatPromptPresets)
      .catch(() => {});
    void fetchPromptPresetSubmissions("pending")
      .then(setPromptSubmissions)
      .catch(() => {});
  }, [adminState]);

  async function refreshPromptSubmissions() {
    setPromptSubmissions(await fetchPromptPresetSubmissions("pending"));
  }

  async function persistWorkspace(llm: Settings, image: ImageWorkspaceSettings, video: VideoWorkspaceSettings) {
    const normalizedLlm = normalizeLlmSettings(llm);
    const snapshot = await saveAdminWorkspaceSnapshot({ llm: normalizedLlm, imageWorkspace: image, videoWorkspace: video });
    setLlmSettings(snapshot.llm);
    setImageSettings(snapshot.imageWorkspace);
    setVideoSettings(snapshot.videoWorkspace);
  }

  async function saveAll() {
    const mergedImage =
      typeof imagePromptsPersistMergeRef.current === "function"
        ? imagePromptsPersistMergeRef.current()
        : imageSettings;
    const mergedVideo =
      typeof videoPromptsPersistMergeRef.current === "function"
        ? videoPromptsPersistMergeRef.current()
        : videoSettings;
    setImageSettings(mergedImage);
    setVideoSettings(mergedVideo);
    const normalizedLlm = normalizeLlmSettings(llmSettings);
    setLlmSettings(normalizedLlm);
    try {
      await persistWorkspace(normalizedLlm, mergedImage, mergedVideo);
      setSavedMessage("已保存全局设置");
    } catch (error) {
      const message = error instanceof Error ? error.message.trim() : "";
      setSavedMessage(message || "保存失败");
    }
    window.setTimeout(() => setSavedMessage(""), 1400);
  }

  async function reviewPromptSubmission(submissionId: string, action: "approve" | "reject") {
    setPromptSubmissionMessage("");
    try {
      await reviewPromptPresetSubmission(submissionId, action);
      await refreshPromptSubmissions();
      if (action === "approve") {
        await refreshAdminWorkspace();
        setChatPromptPresets(await fetchSitePromptPresets("chat"));
      }
      setPromptSubmissionMessage(action === "approve" ? "已通过并发布到全站预设库" : "已拒绝投稿");
    } catch (error) {
      setPromptSubmissionMessage(error instanceof Error ? error.message : "审核操作失败");
    }
    window.setTimeout(() => setPromptSubmissionMessage(""), 1800);
  }

  function addLlmModel() {
    setLlmSettings((current) => {
      const id = nextLlmModelId(current.models);
      return {
        ...current,
        models: {
          ...current.models,
          [id]: {
            id,
            label: "新模型",
            modelName: "",
            enabled: true,
            apiUrl: "",
            apiKey: "",
          },
        },
      };
    });
  }

  function addChatPromptPreset() {
    const id = newChatPromptPresetId();
    const nextPreset: SitePromptPreset = {
      id,
      kind: "chat",
      title: `对话预设 ${chatPromptPresets.length + 1}`,
      promptTemplate: "",
      coverImageUrl: "",
      refSlotHints: [],
      tags: [],
    };
    const next = [nextPreset, ...chatPromptPresets];
    setChatPromptPresets(next);
    void replaceSitePromptPresets("chat", next).then(setChatPromptPresets);
  }

  function addImagePromptPreset() {
    const id = newCustomImageModeId();
    const next: ImageWorkspaceSettings = {
      ...imageSettings,
      customModes: [...(imageSettings.customModes ?? []), { id, label: `生图预设 ${(imageSettings.customModes?.length ?? 0) + 1}` }],
      prompts: { ...imageSettings.prompts, [id]: "" },
      promptModelProvidersByMode: { ...imageSettings.promptModelProvidersByMode, [id]: ["gpt-image", "nano-banana"] },
      promptTagsByMode: { ...imageSettings.promptTagsByMode, [id]: [] },
      promptDescriptionsByMode: mergePromptDescription(imageSettings.promptDescriptionsByMode, id, ""),
    };
    setImageSettings(next);
    void persistWorkspace(llmSettings, next, videoSettings);
  }

  function addVideoPromptPreset() {
    const id = newCustomVideoModeId();
    const next: VideoWorkspaceSettings = {
      ...videoSettings,
      customModes: [...(videoSettings.customModes ?? []), { id, label: `生视频预设 ${(videoSettings.customModes?.length ?? 0) + 1}` }],
      prompts: { ...videoSettings.prompts, [id]: "" },
      promptTagsByMode: { ...videoSettings.promptTagsByMode, [id]: [] },
      promptDescriptionsByMode: mergePromptDescription(videoSettings.promptDescriptionsByMode, id, ""),
    };
    setVideoSettings(next);
    void persistWorkspace(llmSettings, imageSettings, next);
  }

  const createAction =
    tab === "llmApi"
      ? { label: "新建模型", onClick: addLlmModel }
      : tab === "imagePrompts"
        ? { label: "新建生图预设", onClick: addImagePromptPreset }
        : tab === "videoPrompts"
          ? { label: "新建生视频预设", onClick: addVideoPromptPreset }
          : tab === "chatPrompts"
            ? { label: "新建对话预设", onClick: addChatPromptPreset }
            : null;
  const showSaveButton = tab === "llmApi" || tab === "imageApi" || tab === "videoApi" || tab === "imagePrompts" || tab === "videoPrompts";

  return (
    <main className={[shellStyles.page, styles.settingsPage, styles.adminUnifiedPage].join(" ")}>
      <header className={shellStyles.topbar}>
        <nav className={shellStyles.topbarLeft} aria-label="全局管理分类">
          <Link href="/projects" className={shellStyles.navLink}>
            返回项目
          </Link>
          {CATEGORY_DEFS.map((def) => {
            const active = category === def.id;
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => setTab(def.defaultTab)}
                className={[shellStyles.navLink, active ? shellStyles.navLinkActive : ""].filter(Boolean).join(" ")}
                aria-pressed={active}
              >
                {def.label}
              </button>
            );
          })}
        </nav>
        <div className={shellStyles.topnav}>
          {savedMessage ? <span className={styles.savedHint}>{savedMessage}</span> : null}
          {adminState === "ready" && createAction ? (
            <button
              type="button"
              onClick={createAction.onClick}
              className={[shellStyles.navLink, styles.saveButton].join(" ")}
            >
              {createAction.label}
            </button>
          ) : null}
          {adminState === "ready" && showSaveButton ? (
            <button
              type="button"
              onClick={saveAll}
              className={[shellStyles.navLink, styles.saveButton].join(" ")}
            >
              保存
            </button>
          ) : null}
        </div>
      </header>

      {adminState === "loading" ? <div className={shellStyles.empty}>正在校验管理员权限…</div> : null}
      {adminState === "forbidden" ? (
        <div className={shellStyles.empty}>当前账号无权访问全局管理。</div>
      ) : null}

      {adminState === "ready" ? <div className={styles.settingsBody}>
        <div
          className={[styles.settingsWorkspace, tab === "imagePrompts" || tab === "videoPrompts" ? styles.promptModeShell : ""]
            .concat(styles.adminSettingsWorkspace)
            .concat(subpages.length === 0 ? styles.adminSettingsWorkspaceNoSubnav : "")
            .filter(Boolean)
            .join(" ")}
        >
          {subpages.length > 0 ? (
            <aside className={styles.subnav} aria-label="全局管理子页面">
              {subpages.map((def) => {
                const active = tab === def.id;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setTab(def.id)}
                    className={[styles.subnavPill, active ? styles.subnavPillActive : ""].filter(Boolean).join(" ")}
                    aria-pressed={active}
                  >
                    {def.label}
                  </button>
                );
              })}
            </aside>
          ) : null}

          <section className={styles.settingsContent}>
            {tab === "llmApi" ? (
              <LlmApiPanel value={llmSettings} onChange={setLlmSettings} />
            ) : null}

            {tab === "users" ? <AdminUsersPanel /> : null}

            {tab === "imagePrompts" ? (
              <ImagePromptsPanel
                value={imageSettings}
                onChange={setImageSettings}
                persistMergeRef={imagePromptsPersistMergeRef}
                onRefreshWorkspace={refreshAdminWorkspace}
                onPersistImage={async (next) => {
                  setImageSettings(next);
                  await persistWorkspace(llmSettings, next, videoSettings);
                }}
              />
            ) : null}

            {tab === "imageApi" ? (
              <ImageApiPanel value={imageSettings} onChange={setImageSettings} />
            ) : null}

            {tab === "videoPrompts" ? (
              <VideoPromptsPanel
                value={videoSettings}
                onChange={setVideoSettings}
                persistMergeRef={videoPromptsPersistMergeRef}
                onRefreshWorkspace={refreshAdminWorkspace}
                onPersistVideo={async (next) => {
                  setVideoSettings(next);
                  await persistWorkspace(llmSettings, imageSettings, next);
                }}
              />
            ) : null}

            {tab === "chatPrompts" ? (
              <ChatPromptsPanel value={chatPromptPresets} onChange={setChatPromptPresets} />
            ) : null}

            {tab === "promptSubmissions" ? (
              <PromptSubmissionsPanel
                submissions={promptSubmissions}
                message={promptSubmissionMessage}
                onRefresh={refreshPromptSubmissions}
                onReview={reviewPromptSubmission}
              />
            ) : null}

            {tab === "videoApi" ? (
              <VideoApiPanel value={videoSettings} onChange={setVideoSettings} />
            ) : null}

            {tab === "skillPacks" ? <SkillPacksPanel /> : null}
          </section>
        </div>
      </div> : null}
    </main>
  );
}

type PromptPresetRow = SitePromptPreset & { isCustom: true };

function newChatPromptPresetId(): string {
  return `chat_preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isAdminEditableImagePromptId(id: string): boolean {
  return id.startsWith("custom_") || id.startsWith("user_preset_image_");
}

function isAdminEditableVideoPromptId(id: string): boolean {
  return id.startsWith("custom_video_") || id.startsWith("user_preset_video_");
}

function PromptTagPicker({
  kind,
  value,
  onChange,
}: {
  kind: "image" | "video" | "chat";
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const tags = normalizePromptTags(value);
  return (
    <div className={styles.promptTagField}>
      <span className={shellStyles.fieldLabel}>二级标签</span>
      <div className={styles.promptTagPicker} role="group" aria-label="二级标签">
        {PROMPT_TAG_GROUPS[kind].map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={[styles.promptTagButton, active ? styles.promptTagButtonActive : ""].filter(Boolean).join(" ")}
              aria-pressed={active}
              onClick={() => onChange(togglePromptTag(tags, tag))}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PROMPT_KIND_LABELS: Record<PromptPresetSubmission["kind"], string> = {
  image: "生图",
  video: "生视频",
  chat: "对话",
};

function formatSubmissionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PromptSubmissionsPanel({
  submissions,
  message,
  onRefresh,
  onReview,
}: {
  submissions: PromptPresetSubmission[];
  message: string;
  onRefresh: () => Promise<void>;
  onReview: (submissionId: string, action: "approve" | "reject") => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);

  async function review(submissionId: string, action: "approve" | "reject") {
    setSavingId(submissionId);
    try {
      await onReview(submissionId, action);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={settingsCardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>投稿审核</h2>
            <p className={shellStyles.cardSubtitle}>
              普通用户提交的提示词会先进入这里。通过后才会发布到全站预设库；拒绝不会影响现有预设。
            </p>
          </div>
          <div className={styles.promptModeCardActions}>
            {message ? <span className={styles.savedHint}>{message}</span> : null}
            <button type="button" className={shellStyles.buttonSubtle} onClick={() => void onRefresh()}>
              刷新
            </button>
          </div>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className={shellStyles.empty}>暂无待审核投稿。</div>
      ) : (
        <div className={styles.promptModeGrid}>
          {submissions.map((submission) => {
            const saving = savingId === submission.id;
            return (
              <article
                key={submission.id}
                className={[
                  settingsCardClass,
                  styles.promptModeCard,
                  submission.coverImageUrl ? styles.promptMediaCard : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className={[shellStyles.cardHead, styles.promptModeCardHead].join(" ")}>
                  <div>
                    <h3 className={styles.promptModeCardTitle}>{submission.title}</h3>
                    <p className={shellStyles.cardSubtitle}>
                      {PROMPT_KIND_LABELS[submission.kind]} · {submission.submitterEmail || submission.submitterUserId} · {formatSubmissionDate(submission.createdAt)}
                    </p>
                  </div>
                  <div className={styles.promptModeCardActions}>
                    <button
                      type="button"
                      className={shellStyles.buttonSubtle}
                      disabled={saving}
                      onClick={() => void review(submission.id, "reject")}
                    >
                      拒绝
                    </button>
                    <button
                      type="button"
                      className={shellStyles.buttonSubtle}
                      disabled={saving}
                      onClick={() => void review(submission.id, "approve")}
                    >
                      {saving ? "处理中…" : "通过发布"}
                    </button>
                  </div>
                </header>

                <div className={styles.promptModeEditBody}>
                  {submission.coverImageUrl ? (
                    <div className={styles.promptModeCoverSlot} aria-label="投稿封面">
                      <div className={[styles.promptModeCoverFrame, styles.promptModeCoverFrameFilled, styles.promptModeCoverFrameReadOnly].join(" ")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={submission.coverImageUrl} alt="" className={styles.promptModeCoverImage} />
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.promptModeMainColumn}>
                    <PromptTagPicker kind={submission.kind} value={submission.tags} onChange={() => {}} />
                    {submission.description ? (
                      <label className={shellStyles.field}>
                        <span className={shellStyles.fieldLabel}>投稿说明</span>
                        <textarea
                          className={[shellStyles.textarea, styles.promptDescriptionTextarea, styles.noResize, styles.promptModeTextareaReadOnly].join(" ")}
                          value={submission.description}
                          readOnly
                        />
                      </label>
                    ) : null}
                    <label className={shellStyles.field}>
                      <span className={shellStyles.fieldLabel}>提示词内容</span>
                      <textarea
                        className={[
                          shellStyles.textarea,
                          shellStyles.mono,
                          styles.promptModeTextarea,
                          styles.noResize,
                          styles.promptModeTextareaReadOnly,
                        ].join(" ")}
                        value={submission.promptTemplate}
                        readOnly
                        spellCheck={false}
                      />
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ChatPromptsPanel({
  value,
  onChange,
}: {
  value: SitePromptPreset[];
  onChange: (next: SitePromptPreset[]) => void;
}) {
  const allRows = useMemo<PromptPresetRow[]>(
    () =>
      value.map((preset) => ({
        ...preset,
        isCustom: true,
      })),
    [value],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitleById, setDraftTitleById] = useState<Record<string, string>>({});
  const [draftPromptById, setDraftPromptById] = useState<Record<string, string>>({});
  const [draftDescriptionById, setDraftDescriptionById] = useState<Record<string, string>>({});
  const [draftTagsById, setDraftTagsById] = useState<Record<string, string[]>>({});

  function seedDraft(preset: SitePromptPreset) {
    setDraftTitleById((prev) => ({ ...prev, [preset.id]: preset.title }));
    setDraftPromptById((prev) => ({ ...prev, [preset.id]: preset.promptTemplate }));
    setDraftDescriptionById((prev) => ({ ...prev, [preset.id]: preset.description ?? "" }));
    setDraftTagsById((prev) => ({ ...prev, [preset.id]: normalizePromptTags(preset.tags) }));
  }

  async function persist(next: SitePromptPreset[]) {
    const saved = await replaceSitePromptPresets("chat", next);
    onChange(saved);
  }

  function handleEdit(preset: SitePromptPreset) {
    seedDraft(preset);
    setEditingId(preset.id);
  }

  async function handleSave(id: string) {
    const next = value.map((preset) =>
      preset.id === id
        ? {
            ...preset,
            title: draftTitleById[id]?.trim() || preset.title,
            promptTemplate: draftPromptById[id] ?? preset.promptTemplate,
            description: draftDescriptionById[id]?.trim() || undefined,
            tags: normalizePromptTags(draftTagsById[id] ?? preset.tags),
          }
        : preset,
    );
    await persist(next);
    setEditingId((cur) => (cur === id ? null : cur));
  }

  async function handleDelete(id: string) {
    const next = value.filter((preset) => preset.id !== id);
    await persist(next);
    setEditingId((cur) => (cur === id ? null : cur));
  }

  async function setChatPromptTags(preset: SitePromptPreset, nextTagsRaw: string[], isEditing: boolean) {
    const nextTags = normalizePromptTags(nextTagsRaw);
    if (isEditing) {
      setDraftTagsById((prev) => ({ ...prev, [preset.id]: nextTags }));
      return;
    }
    const next = value.map((item) => (item.id === preset.id ? { ...item, tags: nextTags } : item));
    onChange(next);
    await persist(next);
  }

  return (
    <section className={styles.panel}>
      <div className={settingsCardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>对话提示词预设</h2>
            <p className={shellStyles.cardSubtitle}>
              对话页普通聊天模式用这里的预设。它只负责给 Agent 注入系统级提示，不承担 Skill 表单能力。
            </p>
          </div>
        </div>
      </div>

      <div className={styles.promptModeGrid}>
        {allRows.map((preset) => {
          const isEditing = editingId === preset.id;
          const titleValue = isEditing ? (draftTitleById[preset.id] ?? preset.title) : preset.title;
          const promptValue = isEditing ? (draftPromptById[preset.id] ?? preset.promptTemplate) : preset.promptTemplate;
          const descriptionValue = isEditing ? (draftDescriptionById[preset.id] ?? (preset.description ?? "")) : (preset.description ?? "");
          const tagValue = isEditing ? (draftTagsById[preset.id] ?? preset.tags) : preset.tags;

          return (
            <article key={preset.id} className={[settingsCardClass, styles.promptModeCard].join(" ")}>
              <header className={[shellStyles.cardHead, styles.promptModeCardHead].join(" ")}>
                {isEditing ? (
                  <label className={styles.promptModeLabelEdit}>
                    <span className={styles.visuallyHidden}>预设名称</span>
                    <input
                      className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                      value={titleValue}
                      onChange={(e) => setDraftTitleById((prev) => ({ ...prev, [preset.id]: e.target.value }))}
                      aria-label="对话预设名称"
                    />
                  </label>
                ) : (
                  <h3 className={styles.promptModeCardTitle}>{preset.title}</h3>
                )}
                <div className={styles.promptModeCardActions}>
                  <button type="button" className={shellStyles.buttonSubtle} onClick={() => void handleDelete(preset.id)}>
                    删除
                  </button>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => (isEditing ? void handleSave(preset.id) : handleEdit(preset))}
                  >
                    {isEditing ? "保存" : "编辑"}
                  </button>
                </div>
              </header>
              <div className={styles.promptModeEditBody}>
                <div className={styles.promptModeMainColumn}>
                  <PromptTagPicker
                    kind="chat"
                    value={tagValue}
                    onChange={(next) => void setChatPromptTags(preset, next, isEditing)}
                  />
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>提示词内容</span>
                    <textarea
                      className={[
                        shellStyles.textarea,
                        shellStyles.mono,
                        styles.promptModeTextarea,
                        styles.noResize,
                        !isEditing ? styles.promptModeTextareaReadOnly : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      value={promptValue}
                      readOnly={!isEditing}
                      spellCheck={false}
                      aria-readonly={!isEditing}
                      onClick={() => {
                        if (!isEditing) handleEdit(preset);
                      }}
                      onFocus={() => {
                        if (!isEditing) handleEdit(preset);
                      }}
                      onChange={(e) => {
                        if (!isEditing) return;
                        setDraftPromptById((prev) => ({ ...prev, [preset.id]: e.target.value }));
                      }}
                    />
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>使用说明 (可选)</span>
                    <textarea
                      className={[
                        shellStyles.textarea,
                        styles.promptDescriptionTextarea,
                        styles.noResize,
                        !isEditing ? styles.promptModeTextareaReadOnly : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      value={descriptionValue}
                      readOnly={!isEditing}
                      onClick={() => {
                        if (!isEditing) handleEdit(preset);
                      }}
                      onFocus={() => {
                        if (!isEditing) handleEdit(preset);
                      }}
                      onChange={(e) => {
                        if (!isEditing) return;
                        setDraftDescriptionById((prev) => ({ ...prev, [preset.id]: e.target.value }));
                      }}
                      placeholder="简述这个预设的用途..."
                    />
                  </label>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <AdminPageInner />
    </Suspense>
  );
}

function LlmApiPanel({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
}) {
  const modelList = Object.values(value.models);

  return (
    <section className={[styles.panel, styles.apiCardGrid, styles.modelApiGrid].join(" ")}>
      {modelList.map((model) => (
        <div key={model.id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
          <div className={styles.llmModelCardTopBar}>
            <div className={styles.llmModelCardTopLeft}>
              {model.id === value.defaultModelId ? (
                <span className={styles.defaultBadge}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                  默认模型
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.setDefaultBtn}
                  onClick={() => onChange({ ...value, defaultModelId: model.id })}
                >
                  设为默认
                </button>
              )}
            </div>
            <div className={styles.llmModelCardTopRight}>
              <label className={styles.toggleSwitch} title={model.enabled ? "已启用" : "已停用"}>
                <input
                  type="checkbox"
                  className={styles.toggleSwitchInput}
                  checked={model.enabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [model.id]: { ...model, enabled: e.target.checked },
                      },
                    })
                  }
                />
                <span className={styles.toggleSwitchSlider} />
              </label>
              {model.id !== value.defaultModelId ? (
                <button
                  type="button"
                  className={styles.deleteModelBtn}
                  onClick={() => {
                    const nextModels = { ...value.models };
                    delete nextModels[model.id];
                    onChange({ ...value, models: nextModels });
                  }}
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.llmModelCardFieldsCompact}>
            <div className={styles.llmModelCardRow}>
              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>API URL</span>
                <input
                  className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                  value={model.apiUrl}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [model.id]: { ...model, apiUrl: e.target.value },
                      },
                    })
                  }
                  placeholder="https://.../v1/chat/completions"
                />
              </label>
              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>API Key</span>
                <input
                  type="password"
                  className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                  value={apiKeyInputValue(model.apiKey)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [model.id]: { ...model, apiKey: e.target.value },
                      },
                    })
                  }
                  placeholder={apiKeyPlaceholder(model.apiKey)}
                />
              </label>
            </div>

            <div className={styles.llmModelCardRow}>
              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>显示名</span>
                <input
                  className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                  value={model.label}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [model.id]: { ...model, label: e.target.value },
                      },
                    })
                  }
                />
              </label>
              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>模型 ID</span>
                <input
                  className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                  value={model.modelName}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [model.id]: { ...model, modelName: normalizeModel(e.target.value) },
                      },
                    })
                  }
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

type ModePromptRow = { id: string; label: string; isCustom: boolean };

function ImagePromptsPanel({
  value,
  onChange,
  persistMergeRef,
  onPersistImage,
  onRefreshWorkspace,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
  persistMergeRef?: MutableRefObject<(() => ImageWorkspaceSettings) | null>;
  onPersistImage: (next: ImageWorkspaceSettings) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void>;
}) {
  const builtinRows: ModePromptRow[] = IMAGE_MODES.filter((m) => m.id !== "free").map((m) => ({
    id: m.id,
    label: m.label,
    isCustom: false,
  }));
  const customRows: ModePromptRow[] = (value.customModes ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    isCustom: true,
  }));
  const allRows = [...builtinRows, ...customRows].reverse();

  const [editingPromptModeId, setEditingPromptModeId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Partial<Record<string, string>>>({});
  const [draftLabels, setDraftLabels] = useState<Partial<Record<string, string>>>({});
  const [draftPromptProviders, setDraftPromptProviders] = useState<
    Partial<Record<string, ImageWorkspaceSettings["models"][keyof ImageWorkspaceSettings["models"]]["provider"][]>>
  >({});
  const [draftPromptTags, setDraftPromptTags] = useState<Partial<Record<string, string[]>>>({});
  const [draftPromptDescriptions, setDraftPromptDescriptions] = useState<Partial<Record<string, string>>>({});
  const [coverBusyModeId, setCoverBusyModeId] = useState<string | null>(null);
  const [coverErrorByMode, setCoverErrorByMode] = useState<Partial<Record<string, string>>>({});

  async function handleUploadCover(modeId: string, file: File) {
    setCoverBusyModeId(modeId);
    setCoverErrorByMode((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    try {
      const result = await uploadImageModeCover(modeId, file);
      onChange(result.imageWorkspace);
      await onRefreshWorkspace?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "上传封面失败";
      setCoverErrorByMode((prev) => ({ ...prev, [modeId]: message }));
    } finally {
      setCoverBusyModeId((cur) => (cur === modeId ? null : cur));
    }
  }

  async function handleDeleteCover(modeId: string) {
    if (!value.coverImageUrlByMode?.[modeId]) return;
    if (!window.confirm("确定删除该预设的封面图？")) return;
    setCoverBusyModeId(modeId);
    setCoverErrorByMode((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    try {
      const result = await deleteImageModeCover(modeId);
      onChange(result.imageWorkspace);
      await onRefreshWorkspace?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "删除封面失败";
      setCoverErrorByMode((prev) => ({ ...prev, [modeId]: message }));
    } finally {
      setCoverBusyModeId((cur) => (cur === modeId ? null : cur));
    }
  }

  async function removeStoredModeCover(modeId: string): Promise<Record<string, string>> {
    if (!value.coverImageUrlByMode?.[modeId]) {
      const copy = { ...value.coverImageUrlByMode };
      delete copy[modeId];
      return copy;
    }
    const result = await deleteImageModeCover(modeId);
    return result.imageWorkspace.coverImageUrlByMode;
  }

  useEffect(() => {
    const ref = persistMergeRef;
    if (!ref) return;
    ref.current = () => {
      if (editingPromptModeId === null) return value;
      const id = editingPromptModeId;
      const text = draftPrompts[id] ?? value.prompts[id] ?? "";
      let merged: ImageWorkspaceSettings = {
        ...value,
        prompts: { ...value.prompts, [id]: text },
        promptModelProvidersByMode: {
          ...value.promptModelProvidersByMode,
          [id]: draftPromptProviders[id] ?? value.promptModelProvidersByMode?.[id] ?? ["gpt-image", "nano-banana"],
        },
        promptTagsByMode: {
          ...value.promptTagsByMode,
          [id]: normalizePromptTags(draftPromptTags[id] ?? value.promptTagsByMode?.[id]),
        },
        promptDescriptionsByMode: mergePromptDescription(
          value.promptDescriptionsByMode,
          id,
          draftPromptDescriptions[id] ?? value.promptDescriptionsByMode?.[id] ?? "",
        ),
      };
      if (isAdminEditableImagePromptId(id)) {
        const labelRaw =
          draftLabels[id] ?? value.customModes?.find((m) => m.id === id)?.label ?? id;
        const label = String(labelRaw).trim() || id;
        merged = {
          ...merged,
          customModes: (merged.customModes ?? []).map((m) => (m.id === id ? { ...m, label } : m)),
        };
      }
      return merged;
    };
    return () => {
      ref.current = null;
    };
  }, [
    persistMergeRef,
    value,
    editingPromptModeId,
    draftPrompts,
    draftLabels,
    draftPromptProviders,
    draftPromptTags,
    draftPromptDescriptions,
  ]);

  function handleSavePrompt(modeId: string) {
    const text = draftPrompts[modeId] ?? value.prompts[modeId] ?? "";
    let next: ImageWorkspaceSettings = {
      ...value,
      prompts: { ...value.prompts, [modeId]: text },
      promptModelProvidersByMode: {
        ...value.promptModelProvidersByMode,
        [modeId]: draftPromptProviders[modeId] ?? value.promptModelProvidersByMode?.[modeId] ?? ["gpt-image", "nano-banana"],
      },
      promptTagsByMode: {
        ...value.promptTagsByMode,
        [modeId]: normalizePromptTags(draftPromptTags[modeId] ?? value.promptTagsByMode?.[modeId]),
      },
      promptDescriptionsByMode: mergePromptDescription(
        value.promptDescriptionsByMode,
        modeId,
        draftPromptDescriptions[modeId] ?? value.promptDescriptionsByMode?.[modeId] ?? "",
      ),
    };
    if (modeId.startsWith("custom_")) {
      const labelRaw =
        draftLabels[modeId] ?? value.customModes?.find((m) => m.id === modeId)?.label ?? modeId;
      const label = String(labelRaw).trim() || modeId;
      next = {
        ...next,
        customModes: (next.customModes ?? []).map((m) => (m.id === modeId ? { ...m, label } : m)),
      };
    }
    onChange(next);
    void onPersistImage(next);
    setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftLabels((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftPromptProviders((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftPromptTags((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftPromptDescriptions((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
  }

  function handleEditPrompt(modeId: string) {
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = value.prompts[modeId] ?? "";
      return copy;
    });
    if (isAdminEditableImagePromptId(modeId)) {
      setDraftLabels((prev) => ({
        ...prev,
        [modeId]: value.customModes?.find((m) => m.id === modeId)?.label ?? "",
      }));
    }
    setDraftPromptProviders((prev) => ({
      ...prev,
      [modeId]: value.promptModelProvidersByMode?.[modeId] ?? ["gpt-image", "nano-banana"],
    }));
    setDraftPromptTags((prev) => ({
      ...prev,
      [modeId]: normalizePromptTags(value.promptTagsByMode?.[modeId]),
    }));
    setDraftPromptDescriptions((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = value.promptDescriptionsByMode?.[modeId] ?? "";
      return copy;
    });
    setEditingPromptModeId(modeId);
  }

  function handleDeleteCustomMode(modeId: string) {
    if (!isAdminEditableImagePromptId(modeId)) return;
    void (async () => {
      if (modeId.startsWith("user_preset_image_")) {
        try {
          await deleteSitePromptPreset(modeId);
          await onRefreshWorkspace?.();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "删除预设失败");
          return;
        }
      } else {
        let coverImageUrlByMode: Record<string, string>;
        try {
          coverImageUrlByMode = await removeStoredModeCover(modeId);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "删除封面失败");
          return;
        }
        const restPrompts = { ...value.prompts };
        delete restPrompts[modeId];
        const restPromptProviders = { ...value.promptModelProvidersByMode };
        delete restPromptProviders[modeId];
        const restPromptTags = { ...value.promptTagsByMode };
        delete restPromptTags[modeId];
        const restPromptDescriptions = { ...value.promptDescriptionsByMode };
        delete restPromptDescriptions[modeId];
        const next: ImageWorkspaceSettings = {
          ...value,
          customModes: (value.customModes ?? []).filter((m) => m.id !== modeId),
          prompts: restPrompts,
          promptModelProvidersByMode: restPromptProviders,
          promptTagsByMode: restPromptTags,
          promptDescriptionsByMode: restPromptDescriptions,
          coverImageUrlByMode,
        };
        onChange(next);
        void onPersistImage(next);
      }
      setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
      setDraftPrompts((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftLabels((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftPromptProviders((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftPromptTags((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftPromptDescriptions((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
    })();
  }

  function handleDeletePromptRow(mode: ModePromptRow) {
    if (mode.isCustom) {
      handleDeleteCustomMode(mode.id);
      return;
    }
    if (
      !window.confirm(
        `「${mode.label}」将恢复为内置默认提示词并清空封面图，确定？`,
      )
    ) {
      return;
    }
    void (async () => {
      let coverImageUrlByMode: Record<string, string>;
      try {
        coverImageUrlByMode = await removeStoredModeCover(mode.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "删除封面失败");
        return;
      }
      const defaultPrompt = defaultImageModePrompt(mode.id as ImageModeId);
      const next: ImageWorkspaceSettings = {
        ...value,
        prompts: { ...value.prompts, [mode.id]: defaultPrompt },
        promptModelProvidersByMode: { ...value.promptModelProvidersByMode, [mode.id]: ["gpt-image", "nano-banana"] },
        promptTagsByMode: { ...value.promptTagsByMode, [mode.id]: [] },
        promptDescriptionsByMode: mergePromptDescription(value.promptDescriptionsByMode, mode.id, ""),
        coverImageUrlByMode,
      };
      onChange(next);
      void onPersistImage(next);
      setEditingPromptModeId((cur) => (cur === mode.id ? null : cur));
      setDraftPrompts((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
      setDraftPromptProviders((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
      setDraftPromptTags((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
      setDraftPromptDescriptions((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
    })();
  }

  function togglePromptProvider(modeId: string, provider: "gpt-image" | "nano-banana", isEditing: boolean) {
    const current: Array<"gpt-image" | "nano-banana"> =
      (isEditing ? draftPromptProviders[modeId] : undefined) ??
      value.promptModelProvidersByMode?.[modeId] ??
      ["gpt-image", "nano-banana"];
    const nextProviders: Array<"gpt-image" | "nano-banana"> = current.includes(provider)
      ? current.length > 1
        ? current.filter((item) => item !== provider)
        : current
      : [...current, provider];

    if (isEditing) {
      setDraftPromptProviders((prev) => ({ ...prev, [modeId]: nextProviders }));
      return;
    }

    const next: ImageWorkspaceSettings = {
      ...value,
      promptModelProvidersByMode: {
        ...value.promptModelProvidersByMode,
        [modeId]: nextProviders,
      },
    };
    onChange(next);
    void onPersistImage(next);
  }

  function setImagePromptTags(modeId: string, nextTagsRaw: string[], isEditing: boolean) {
    const nextTags = normalizePromptTags(nextTagsRaw);
    if (isEditing) {
      setDraftPromptTags((prev) => ({ ...prev, [modeId]: nextTags }));
      return;
    }
    const next: ImageWorkspaceSettings = {
      ...value,
      promptTagsByMode: { ...value.promptTagsByMode, [modeId]: nextTags },
    };
    onChange(next);
    void onPersistImage(next);
  }

  return (
    <section className={styles.panel}>
      <div className={settingsCardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>生图提示词预设库</h2>
            <p className={shellStyles.cardSubtitle}>
              作图页用这里的预设。点击卡片或「编辑」即可修改；<code className={shellStyles.mono}>{"{{…}}"}</code> 会生成对应输入框，右侧可上传封面。
            </p>
          </div>
        </div>
      </div>

      <div className={styles.promptModeGrid}>
        {allRows.map((mode) => {
          const isEditing = editingPromptModeId === mode.id;
          const savedText = value.prompts[mode.id] ?? "";
          const textareaValue = isEditing ? (draftPrompts[mode.id] ?? savedText) : savedText;
          const occCount = extractPromptPlaceholderOccurrences(savedText).length;
          const coverUrl = value.coverImageUrlByMode?.[mode.id]?.trim() ?? "";
          const providerValues = isEditing
            ? (draftPromptProviders[mode.id] ?? value.promptModelProvidersByMode?.[mode.id] ?? ["gpt-image", "nano-banana"])
            : (value.promptModelProvidersByMode?.[mode.id] ?? ["gpt-image", "nano-banana"]);
          const tagValues = isEditing ? (draftPromptTags[mode.id] ?? value.promptTagsByMode?.[mode.id] ?? []) : (value.promptTagsByMode?.[mode.id] ?? []);
          const descriptionValue = isEditing
            ? (draftPromptDescriptions[mode.id] ?? value.promptDescriptionsByMode?.[mode.id] ?? "")
            : (value.promptDescriptionsByMode?.[mode.id] ?? "");
          const coverBusy = coverBusyModeId === mode.id;
          const coverError = coverErrorByMode[mode.id];

          return (
            <article key={mode.id} className={[settingsCardClass, styles.promptModeCard, styles.promptMediaCard].join(" ")}>
              <header className={[shellStyles.cardHead, styles.promptModeCardHead].join(" ")}>
                {mode.isCustom && isEditing ? (
                  <label className={styles.promptModeLabelEdit}>
                    <span className={styles.visuallyHidden}>预设名称</span>
                    <input
                      className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                      value={draftLabels[mode.id] ?? mode.label}
                      onChange={(e) =>
                        setDraftLabels((prev) => ({ ...prev, [mode.id]: e.target.value }))
                      }
                      aria-label="自定义预设名称"
                    />
                  </label>
                ) : (
                  <h3 className={styles.promptModeCardTitle}>{mode.label}</h3>
                )}
                <div className={styles.promptModeCardActions}>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => handleDeletePromptRow(mode)}
                    aria-label={mode.isCustom ? `删除自定义预设 ${mode.label}` : `恢复 ${mode.label} 默认提示词`}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => (isEditing ? handleSavePrompt(mode.id) : handleEditPrompt(mode.id))}
                  >
                    {isEditing ? "保存" : "编辑"}
                  </button>
                </div>
              </header>
              {occCount > 6 ? (
                <p className={styles.promptOccWarn}>当前模版含 {occCount} 处占位符，作图页会显示 {occCount} 个输入框。</p>
              ) : null}
              <div className={styles.promptModeEditBody}>
                <div className={styles.promptModeMainColumn}>
                  <label className={styles.promptModeProviderField}>
                    <span className={shellStyles.fieldLabel}>适配模型</span>
                    <div className={styles.promptModeProviderButtons} role="group" aria-label={`${mode.label} 适配模型`}>
                      <button
                        type="button"
                        className={[
                          styles.promptModeProviderButton,
                          providerValues.includes("gpt-image") ? styles.promptModeProviderButtonActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={providerValues.includes("gpt-image")}
                        onClick={() => togglePromptProvider(mode.id, "gpt-image", isEditing)}
                      >
                        GPT Image
                      </button>
                      <button
                        type="button"
                        className={[
                          styles.promptModeProviderButton,
                          providerValues.includes("nano-banana") ? styles.promptModeProviderButtonActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={providerValues.includes("nano-banana")}
                        onClick={() => togglePromptProvider(mode.id, "nano-banana", isEditing)}
                      >
                        Nano Banana
                      </button>
                    </div>
                  </label>
                  <PromptTagPicker
                    kind="image"
                    value={tagValues}
                    onChange={(next) => setImagePromptTags(mode.id, next, isEditing)}
                  />
                  <label className={styles.promptDescriptionField}>
                    <span className={shellStyles.fieldLabel}>卡片描述</span>
                    <textarea
                      className={[
                        shellStyles.textarea,
                        styles.promptDescriptionTextarea,
                        !isEditing ? styles.promptModeTextareaReadOnly : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      value={descriptionValue}
                      readOnly={!isEditing}
                      aria-readonly={!isEditing}
                      placeholder="显示在预设卡标题下方的简短说明"
                      onClick={() => {
                        if (!isEditing) handleEditPrompt(mode.id);
                      }}
                      onFocus={() => {
                        if (!isEditing) handleEditPrompt(mode.id);
                      }}
                      onChange={(e) => {
                        if (!isEditing) return;
                        setDraftPromptDescriptions((prev) => ({ ...prev, [mode.id]: e.target.value }));
                      }}
                    />
                  </label>
                  <textarea
                    className={[
                      shellStyles.textarea,
                      shellStyles.mono,
                      styles.promptModeTextarea,
                      !isEditing ? styles.promptModeTextareaReadOnly : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    value={textareaValue}
                    readOnly={!isEditing}
                    spellCheck={false}
                    aria-readonly={!isEditing}
                    onClick={() => {
                      if (!isEditing) handleEditPrompt(mode.id);
                    }}
                    onFocus={() => {
                      if (!isEditing) handleEditPrompt(mode.id);
                    }}
                    onChange={(e) => {
                      if (!isEditing) return;
                      setDraftPrompts((prev) => ({ ...prev, [mode.id]: e.target.value }));
                    }}
                  />
                </div>
                <div className={styles.promptModeCoverSlot} aria-label={`${mode.label} 预设封面`}>
                  <div
                    className={[
                      styles.promptModeCoverFrame,
                      coverUrl ? styles.promptModeCoverFrameFilled : "",
                      coverBusy ? styles.promptModeCoverFrameBusy : "",
                      !isEditing && !coverUrl ? styles.promptModeCoverFrameReadOnly : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {coverUrl ? (
                      <>
                        {isEditing ? (
                          <label className={styles.promptModeCoverReplaceHit} aria-label="点击更换封面">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={coverUrl} alt={`${mode.label} 封面`} className={styles.promptModeCoverImage} />
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className={styles.promptModeCoverFileInput}
                              disabled={coverBusy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) void handleUploadCover(mode.id, file);
                              }}
                            />
                          </label>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={coverUrl} alt={`${mode.label} 封面`} className={styles.promptModeCoverImage} />
                        )}
                        {isEditing ? (
                          <button
                            type="button"
                            className={styles.promptModeCoverDelete}
                            disabled={coverBusy}
                            aria-label="删除封面"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleDeleteCover(mode.id);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </>
                    ) : isEditing ? (
                      <label className={styles.promptModeCoverUploadLabel}>
                        <span className={styles.promptModeCoverLabel}>上传封面</span>
                        <span className={styles.promptModeCoverHint}>原比例缩略 · 自动转 WebP · 最大 5MB</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className={styles.promptModeCoverFileInput}
                          disabled={coverBusy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleUploadCover(mode.id, file);
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        <span className={styles.promptModeCoverLabel}>预设封面</span>
                        <span className={styles.promptModeCoverHint}>未设置</span>
                      </>
                    )}
                    {coverBusy ? <span className={styles.promptModeCoverBusy}>处理中…</span> : null}
                  </div>
                  {coverError ? <p className={styles.promptModeCoverError}>{coverError}</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ImageApiPanel({
  value,
  onChange,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
}) {
  return (
    <section className={[styles.panel, styles.apiCardGrid].join(" ")}>
      {IMAGE_MODEL_ORDER.map((id) => {
        const model = value.models[id];
        return (
          <div key={id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
            <div className={styles.llmModelCardTopBar}>
              <div className={styles.llmModelCardTopLeft}>
                <h2 className={shellStyles.cardTitle} style={{ fontSize: '15px' }}>{model.label}</h2>
                <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--settings-muted)' }}>
                  {model.provider === "gpt-image" ? "GPT Image 请求格式" : "Nano Banana 请求格式"}
                </span>
              </div>
            </div>

            <div className={styles.llmModelCardFieldsCompact}>
              <div className={styles.llmModelCardRow}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>Base URL / Endpoint</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                    value={model.endpointUrl}
                    placeholder="https://.../v1/images/generations"
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], endpointUrl: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>API Key</span>
                  <input
                    type="password"
                    className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                    value={apiKeyInputValue(model.apiKey)}
                    placeholder={apiKeyPlaceholder(model.apiKey)}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], apiKey: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              </div>

              <div className={styles.llmModelCardRow}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>显示名</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                    value={model.label}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], label: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>模型名</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                    value={model.modelName}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], modelName: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function VideoApiPanel({
  value,
  onChange,
}: {
  value: VideoWorkspaceSettings;
  onChange: (next: VideoWorkspaceSettings) => void;
}) {
  return (
    <section className={[styles.panel, styles.apiCardGrid].join(" ")}>
      {VIDEO_MODEL_ORDER.map((id) => {
        const model = value.models[id];
        const definition = getVideoModelDefinition(id);
        return (
          <div key={id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
            <div className={styles.llmModelCardTopBar}>
              <div className={styles.llmModelCardTopLeft}>
                <h2 className={shellStyles.cardTitle} style={{ fontSize: '15px' }}>{model.label}</h2>
                <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--settings-muted)' }}>
                  {definition.provider} · {definition.capabilities.supportedModes.map((modeId) => VIDEO_MODE_LABELS[modeId]).join(" / ")}
                </span>
              </div>
              <div className={styles.llmModelCardTopRight}>
                <label className={styles.toggleSwitch} title={model.enabled ? "已启用" : "已停用"}>
                  <input
                    type="checkbox"
                    className={styles.toggleSwitchInput}
                    checked={model.enabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], enabled: e.target.checked },
                        },
                      })
                    }
                  />
                  <span className={styles.toggleSwitchSlider} />
                </label>
              </div>
            </div>

            <div className={styles.llmModelCardFieldsCompact}>
              <div className={styles.llmModelCardRow}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>Base URL</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                    value={model.baseUrl}
                    placeholder="留空，后续按模型填写"
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], baseUrl: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>API Key</span>
                  <input
                    type="password"
                    className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                    value={apiKeyInputValue(model.apiKey)}
                    placeholder={apiKeyPlaceholder(model.apiKey, "留空，后续填写")}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: { ...value.models[id], apiKey: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              </div>

              <div className={styles.llmModelCardRow}>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>显示名</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                    value={model.label}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: {
                            ...value.models[id],
                            label: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className={shellStyles.field}>
                  <span className={shellStyles.fieldLabel}>模型名</span>
                  <input
                    className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")}
                    value={model.apiModelName}
                    placeholder={definition.defaultApiModelName}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        models: {
                          ...value.models,
                          [id]: {
                            ...value.models[id],
                            apiModelName: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

type VideoModePromptRow = { id: string; label: string; isCustom: boolean };

function VideoPromptsPanel({
  value,
  onChange,
  persistMergeRef,
  onPersistVideo,
  onRefreshWorkspace,
}: {
  value: VideoWorkspaceSettings;
  onChange: (next: VideoWorkspaceSettings) => void;
  persistMergeRef?: MutableRefObject<(() => VideoWorkspaceSettings) | null>;
  onPersistVideo: (next: VideoWorkspaceSettings) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void>;
}) {
  const builtinRows: VideoModePromptRow[] = VIDEO_MODES.filter((mode) => mode.id !== "free").map((mode) => ({
    id: mode.id,
    label: mode.label,
    isCustom: false,
  }));
  const customRows: VideoModePromptRow[] = (value.customModes ?? []).map((mode) => ({
    id: mode.id,
    label: mode.label,
    isCustom: true,
  }));
  const allRows = [...builtinRows, ...customRows].reverse();

  const [editingPromptModeId, setEditingPromptModeId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Partial<Record<string, string>>>({});
  const [draftLabels, setDraftLabels] = useState<Partial<Record<string, string>>>({});
  const [draftPromptTags, setDraftPromptTags] = useState<Partial<Record<string, string[]>>>({});
  const [draftPromptDescriptions, setDraftPromptDescriptions] = useState<Partial<Record<string, string>>>({});
  const [coverBusyModeId, setCoverBusyModeId] = useState<string | null>(null);
  const [coverErrorByMode, setCoverErrorByMode] = useState<Partial<Record<string, string>>>({});

  async function handleUploadCover(modeId: string, file: File) {
    setCoverBusyModeId(modeId);
    setCoverErrorByMode((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    try {
      const result = await uploadVideoModeCover(modeId, file);
      onChange(result.videoWorkspace);
      await onRefreshWorkspace?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "上传封面失败";
      setCoverErrorByMode((prev) => ({ ...prev, [modeId]: message }));
    } finally {
      setCoverBusyModeId((cur) => (cur === modeId ? null : cur));
    }
  }

  async function handleDeleteCover(modeId: string) {
    if (!value.coverImageUrlByMode?.[modeId]) return;
    if (!window.confirm("确定删除该预设的封面图？")) return;
    setCoverBusyModeId(modeId);
    setCoverErrorByMode((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    try {
      const result = await deleteVideoModeCover(modeId);
      onChange(result.videoWorkspace);
      await onRefreshWorkspace?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "删除封面失败";
      setCoverErrorByMode((prev) => ({ ...prev, [modeId]: message }));
    } finally {
      setCoverBusyModeId((cur) => (cur === modeId ? null : cur));
    }
  }

  async function removeStoredModeCover(modeId: string): Promise<Record<string, string>> {
    if (!value.coverImageUrlByMode?.[modeId]) {
      const copy = { ...value.coverImageUrlByMode };
      delete copy[modeId];
      return copy;
    }
    const result = await deleteVideoModeCover(modeId);
    return result.videoWorkspace.coverImageUrlByMode;
  }

  useEffect(() => {
    const ref = persistMergeRef;
    if (!ref) return;
    ref.current = () => {
      if (editingPromptModeId === null) return value;
      const id = editingPromptModeId;
      const text = draftPrompts[id] ?? value.prompts[id] ?? "";
      let merged: VideoWorkspaceSettings = {
        ...value,
        prompts: { ...value.prompts, [id]: text },
        promptTagsByMode: {
          ...value.promptTagsByMode,
          [id]: normalizePromptTags(draftPromptTags[id] ?? value.promptTagsByMode?.[id]),
        },
        promptDescriptionsByMode: mergePromptDescription(
          value.promptDescriptionsByMode,
          id,
          draftPromptDescriptions[id] ?? value.promptDescriptionsByMode?.[id] ?? "",
        ),
      };
      if (isAdminEditableVideoPromptId(id)) {
        const labelRaw = draftLabels[id] ?? value.customModes?.find((mode) => mode.id === id)?.label ?? id;
        const label = String(labelRaw).trim() || id;
        merged = {
          ...merged,
          customModes: (merged.customModes ?? []).map((mode) => (mode.id === id ? { ...mode, label } : mode)),
        };
      }
      return merged;
    };
    return () => {
      ref.current = null;
    };
  }, [persistMergeRef, value, editingPromptModeId, draftPrompts, draftLabels, draftPromptTags, draftPromptDescriptions]);

  function handleSavePrompt(modeId: string) {
    const text = draftPrompts[modeId] ?? value.prompts[modeId] ?? "";
    let next: VideoWorkspaceSettings = {
      ...value,
      prompts: { ...value.prompts, [modeId]: text },
      promptTagsByMode: {
        ...value.promptTagsByMode,
        [modeId]: normalizePromptTags(draftPromptTags[modeId] ?? value.promptTagsByMode?.[modeId]),
      },
      promptDescriptionsByMode: mergePromptDescription(
        value.promptDescriptionsByMode,
        modeId,
        draftPromptDescriptions[modeId] ?? value.promptDescriptionsByMode?.[modeId] ?? "",
      ),
    };
    if (modeId.startsWith("custom_video_")) {
      const labelRaw = draftLabels[modeId] ?? value.customModes?.find((mode) => mode.id === modeId)?.label ?? modeId;
      const label = String(labelRaw).trim() || modeId;
      next = {
        ...next,
        customModes: (next.customModes ?? []).map((mode) => (mode.id === modeId ? { ...mode, label } : mode)),
      };
    }
    onChange(next);
    void onPersistVideo(next);
    setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftLabels((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftPromptTags((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftPromptDescriptions((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
  }

  function handleEditPrompt(modeId: string) {
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = value.prompts[modeId] ?? "";
      return copy;
    });
    if (isAdminEditableVideoPromptId(modeId)) {
      setDraftLabels((prev) => ({
        ...prev,
        [modeId]: value.customModes?.find((mode) => mode.id === modeId)?.label ?? "",
      }));
    }
    setDraftPromptTags((prev) => ({
      ...prev,
      [modeId]: normalizePromptTags(value.promptTagsByMode?.[modeId]),
    }));
    setDraftPromptDescriptions((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = value.promptDescriptionsByMode?.[modeId] ?? "";
      return copy;
    });
    setEditingPromptModeId(modeId);
  }

  function handleDeleteCustomMode(modeId: string) {
    if (!isAdminEditableVideoPromptId(modeId)) return;
    void (async () => {
      if (modeId.startsWith("user_preset_video_")) {
        try {
          await deleteSitePromptPreset(modeId);
          await onRefreshWorkspace?.();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "删除预设失败");
          return;
        }
      } else {
        let coverImageUrlByMode: Record<string, string>;
        try {
          coverImageUrlByMode = await removeStoredModeCover(modeId);
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "删除封面失败");
          return;
        }
        const restPrompts = { ...value.prompts };
        delete restPrompts[modeId];
        const restPromptTags = { ...value.promptTagsByMode };
        delete restPromptTags[modeId];
        const restPromptDescriptions = { ...value.promptDescriptionsByMode };
        delete restPromptDescriptions[modeId];
        const next: VideoWorkspaceSettings = {
          ...value,
          customModes: (value.customModes ?? []).filter((mode) => mode.id !== modeId),
          prompts: restPrompts,
          promptTagsByMode: restPromptTags,
          promptDescriptionsByMode: restPromptDescriptions,
          coverImageUrlByMode,
        };
        onChange(next);
        void onPersistVideo(next);
      }
      setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
      setDraftPrompts((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftLabels((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftPromptTags((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
      setDraftPromptDescriptions((prev) => {
        const copy = { ...prev };
        delete copy[modeId];
        return copy;
      });
    })();
  }

  function handleDeletePromptRow(mode: VideoModePromptRow) {
    if (mode.isCustom) {
      handleDeleteCustomMode(mode.id);
      return;
    }
    if (!window.confirm(`「${mode.label}」将恢复为内置默认提示词并清空封面图，确定？`)) return;
    void (async () => {
      let coverImageUrlByMode: Record<string, string>;
      try {
        coverImageUrlByMode = await removeStoredModeCover(mode.id);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "删除封面失败");
        return;
      }
      const next: VideoWorkspaceSettings = {
        ...value,
        prompts: { ...value.prompts, [mode.id]: defaultVideoModePrompt(mode.id as VideoPromptModeId) },
        promptTagsByMode: { ...value.promptTagsByMode, [mode.id]: [] },
        promptDescriptionsByMode: mergePromptDescription(value.promptDescriptionsByMode, mode.id, ""),
        coverImageUrlByMode,
      };
      onChange(next);
      void onPersistVideo(next);
      setEditingPromptModeId((cur) => (cur === mode.id ? null : cur));
      setDraftPrompts((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
      setDraftPromptTags((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
      setDraftPromptDescriptions((prev) => {
        const copy = { ...prev };
        delete copy[mode.id];
        return copy;
      });
    })();
  }

  function setVideoPromptTags(modeId: string, nextTagsRaw: string[], isEditing: boolean) {
    const nextTags = normalizePromptTags(nextTagsRaw);
    if (isEditing) {
      setDraftPromptTags((prev) => ({ ...prev, [modeId]: nextTags }));
      return;
    }
    const next: VideoWorkspaceSettings = {
      ...value,
      promptTagsByMode: { ...value.promptTagsByMode, [modeId]: nextTags },
    };
    onChange(next);
    void onPersistVideo(next);
  }

  return (
    <section className={styles.panel}>
      <div className={settingsCardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>生视频提示词预设库</h2>
            <p className={shellStyles.cardSubtitle}>
              生视频页用这里的预设。<code className={shellStyles.mono}>{"{{…}}"}</code> 会生成对应输入框，右侧可上传 GIF 动图封面。
            </p>
          </div>
        </div>
      </div>

      <div className={styles.promptModeGrid}>
        {allRows.map((mode) => {
          const isEditing = editingPromptModeId === mode.id;
          const savedText = value.prompts[mode.id] ?? "";
          const textareaValue = isEditing ? (draftPrompts[mode.id] ?? savedText) : savedText;
          const occCount = extractVideoPromptPlaceholderOccurrences(savedText).length;
          const coverUrl = value.coverImageUrlByMode?.[mode.id]?.trim() ?? "";
          const coverBusy = coverBusyModeId === mode.id;
          const coverError = coverErrorByMode[mode.id];
          const tagValues = isEditing ? (draftPromptTags[mode.id] ?? value.promptTagsByMode?.[mode.id] ?? []) : (value.promptTagsByMode?.[mode.id] ?? []);
          const descriptionValue = isEditing
            ? (draftPromptDescriptions[mode.id] ?? value.promptDescriptionsByMode?.[mode.id] ?? "")
            : (value.promptDescriptionsByMode?.[mode.id] ?? "");

          return (
            <article key={mode.id} className={[settingsCardClass, styles.promptModeCard, styles.promptMediaCard].join(" ")}>
              <header className={[shellStyles.cardHead, styles.promptModeCardHead].join(" ")}>
                {mode.isCustom && isEditing ? (
                  <label className={styles.promptModeLabelEdit}>
                    <span className={styles.visuallyHidden}>预设名称</span>
                    <input
                      className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                      value={draftLabels[mode.id] ?? mode.label}
                      onChange={(e) => setDraftLabels((prev) => ({ ...prev, [mode.id]: e.target.value }))}
                      aria-label="自定义预设名称"
                    />
                  </label>
                ) : (
                  <h3 className={styles.promptModeCardTitle}>{mode.label}</h3>
                )}
                <div className={styles.promptModeCardActions}>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => handleDeletePromptRow(mode)}
                    aria-label={mode.isCustom ? `删除自定义预设 ${mode.label}` : `恢复 ${mode.label} 默认提示词`}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => (isEditing ? handleSavePrompt(mode.id) : handleEditPrompt(mode.id))}
                  >
                    {isEditing ? "保存" : "编辑"}
                  </button>
                </div>
              </header>
              {occCount > 6 ? (
                <p className={styles.promptOccWarn}>当前模版含 {occCount} 处占位符，视频页将显示 {occCount} 栏输入。</p>
              ) : null}
              <div className={styles.promptModeEditBody}>
                <PromptTagPicker
                  kind="video"
                  value={tagValues}
                  onChange={(next) => setVideoPromptTags(mode.id, next, isEditing)}
                />
                <label className={styles.promptDescriptionField}>
                  <span className={shellStyles.fieldLabel}>卡片描述</span>
                  <textarea
                    className={[
                      shellStyles.textarea,
                      styles.promptDescriptionTextarea,
                      !isEditing ? styles.promptModeTextareaReadOnly : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    value={descriptionValue}
                    readOnly={!isEditing}
                    aria-readonly={!isEditing}
                    placeholder="显示在预设卡标题下方的简短说明"
                    onClick={() => {
                      if (!isEditing) handleEditPrompt(mode.id);
                    }}
                    onFocus={() => {
                      if (!isEditing) handleEditPrompt(mode.id);
                    }}
                    onChange={(e) => {
                      if (!isEditing) return;
                      setDraftPromptDescriptions((prev) => ({ ...prev, [mode.id]: e.target.value }));
                    }}
                  />
                </label>
                <textarea
                  className={[
                    shellStyles.textarea,
                    shellStyles.mono,
                    styles.promptModeTextarea,
                    !isEditing ? styles.promptModeTextareaReadOnly : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  value={textareaValue}
                  readOnly={!isEditing}
                  spellCheck={false}
                  aria-readonly={!isEditing}
                  onClick={() => {
                    if (!isEditing) handleEditPrompt(mode.id);
                  }}
                  onFocus={() => {
                    if (!isEditing) handleEditPrompt(mode.id);
                  }}
                  onChange={(e) => {
                    if (!isEditing) return;
                    setDraftPrompts((prev) => ({ ...prev, [mode.id]: e.target.value }));
                  }}
                />
                <div className={styles.promptModeCoverSlot} aria-label={`${mode.label} 预设封面`}>
                  <div
                    className={[
                      styles.promptModeCoverFrame,
                      coverUrl ? styles.promptModeCoverFrameFilled : "",
                      coverBusy ? styles.promptModeCoverFrameBusy : "",
                      !isEditing && !coverUrl ? styles.promptModeCoverFrameReadOnly : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {coverUrl ? (
                      <>
                        {isEditing ? (
                          <label className={styles.promptModeCoverReplaceHit} aria-label="点击更换封面">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={coverUrl} alt={`${mode.label} 封面`} className={styles.promptModeCoverImage} />
                            <input
                              type="file"
                              accept="image/gif"
                              className={styles.promptModeCoverFileInput}
                              disabled={coverBusy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) void handleUploadCover(mode.id, file);
                              }}
                            />
                          </label>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={coverUrl} alt={`${mode.label} 封面`} className={styles.promptModeCoverImage} />
                        )}
                        {isEditing ? (
                          <button
                            type="button"
                            className={styles.promptModeCoverDelete}
                            disabled={coverBusy}
                            aria-label="删除封面"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleDeleteCover(mode.id);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </>
                    ) : isEditing ? (
                      <label className={styles.promptModeCoverUploadLabel}>
                        <span className={styles.promptModeCoverLabel}>上传 GIF 封面</span>
                        <span className={styles.promptModeCoverHint}>支持 GIF 动图 · 原文件上传 · 最大 5MB</span>
                        <input
                          type="file"
                          accept="image/gif"
                          className={styles.promptModeCoverFileInput}
                          disabled={coverBusy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleUploadCover(mode.id, file);
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        <span className={styles.promptModeCoverLabel}>预设封面</span>
                        <span className={styles.promptModeCoverHint}>未设置</span>
                      </>
                    )}
                    {coverBusy ? <span className={styles.promptModeCoverBusy}>处理中…</span> : null}
                  </div>
                  {coverError ? <p className={styles.promptModeCoverError}>{coverError}</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
