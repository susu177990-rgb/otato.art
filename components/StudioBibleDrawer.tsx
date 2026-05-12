"use client";

import { useState } from "react";
import type { Artifact, Settings } from "@/lib/types";
import { auditBibleVsCast } from "@/lib/bible-audit";
import { downloadSeriesBibleMarkdownFile } from "@/lib/export-artifacts";
import ArtifactSlotEditor from "./ArtifactSlotEditor";

export type BibleDrawerTab = "bible" | "locale";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前标签（与顶栏「系列圣经」「英语简报」按钮联动） */
  drawerTab: BibleDrawerTab;
  onDrawerTabChange: (tab: BibleDrawerTab) => void;
  hasProject: boolean;
  projectId: string;
  projectName: string;
  seriesBible: string;
  /** 有则侧栏可触发 LLM 补写圣经 */
  creativeBrief?: string;
  settings: Settings;
  /** 编剧室是否已有对话或产物（须传 allowWithProgress 才能生成） */
  hasStudioProgress?: boolean;
  onOpenSettings?: () => void;
  artifacts: Artifact[];
  onSeriesBibleChange: (next: string) => void;
  /** 全剧一份英语 Locale 简报 */
  englishLocaleBrief: string;
  onEnglishLocaleBriefChange: (next: string) => void;
  /** 与产物区一致：查看阶段 ≥6 或工程已验至 ≥6 时允许模型生成简报 */
  localeBriefGenerateEnabled: boolean;
}

export default function StudioBibleDrawer({
  open,
  onClose,
  drawerTab,
  onDrawerTabChange,
  hasProject,
  projectId,
  projectName,
  creativeBrief = "",
  settings,
  hasStudioProgress = false,
  onOpenSettings,
  seriesBible,
  artifacts,
  onSeriesBibleChange,
  englishLocaleBrief,
  onEnglishLocaleBriefChange,
  localeBriefGenerateEnabled,
}: Props) {
  const [llmBibleLoading, setLlmBibleLoading] = useState(false);
  const [localeGenLoading, setLocaleGenLoading] = useState(false);

  const auditIssues = hasProject ? auditBibleVsCast(seriesBible, artifacts) : [];
  const bibleEmpty = !seriesBible.trim();
  const hasBrief = Boolean(creativeBrief.trim());
  const canLlmFillBible =
    hasProject && bibleEmpty && hasBrief && Boolean(settings.apiKey);
  const canLlmRewriteBible = hasProject && !bibleEmpty && hasBrief && Boolean(settings.apiKey);
  const hasApiKey = Boolean(settings.apiKey?.trim());

  async function handleLlmGenerateBible() {
    if (!canLlmFillBible || !projectId) return;
    setLlmBibleLoading(true);
    try {
      const res = await fetch("/api/onboarding/generate-series-bible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          settings,
          allowWithProgress: hasStudioProgress,
        }),
      });
      const data = (await res.json()) as { error?: string; project?: { seriesBible?: string } };
      if (!res.ok) throw new Error(data.error || res.statusText);
      const next = (data.project?.seriesBible ?? "").trim();
      if (!next) throw new Error("未返回系列圣经");
      onSeriesBibleChange(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLlmBibleLoading(false);
    }
  }

  async function handleLlmRewriteBible() {
    if (!canLlmRewriteBible || !projectId) return;
    if (
      !confirm(
        "将用 LLM 根据《创作思路确认书》重新生成系列圣经，并覆盖当前侧栏中的全部正文。是否继续？"
      )
    ) {
      return;
    }
    setLlmBibleLoading(true);
    try {
      const res = await fetch("/api/onboarding/generate-series-bible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          settings,
          replaceExisting: true,
          allowWithProgress: true,
        }),
      });
      const data = (await res.json()) as { error?: string; project?: { seriesBible?: string } };
      if (!res.ok) throw new Error(data.error || res.statusText);
      const next = (data.project?.seriesBible ?? "").trim();
      if (!next) throw new Error("未返回系列圣经");
      onSeriesBibleChange(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "重新生成失败");
    } finally {
      setLlmBibleLoading(false);
    }
  }

  async function handleGenerateLocaleBrief() {
    if (!projectId) return;
    if (!hasApiKey) {
      alert("请先在设置中填写 API Key（与对话相同）。");
      return;
    }
    setLocaleGenLoading(true);
    try {
      const res = await fetch("/api/locale-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, settings }),
      });
      const data = (await res.json()) as { markdown?: string; error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.markdown) onEnglishLocaleBriefChange(data.markdown);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLocaleGenLoading(false);
    }
  }

  if (!open) return null;

  const tabBtn = (id: BibleDrawerTab, label: string) => (
    <button
      type="button"
      onClick={() => onDrawerTabChange(id)}
      className={[
        "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
        drawerTab === id
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        role="dialog"
        aria-label="系列圣经与英语 Locale 简报"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {tabBtn("bible", "系列圣经")}
            {tabBtn("locale", "英语 Locale")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="关闭"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {drawerTab === "bible" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <h2 className="mb-2 shrink-0 text-xs font-semibold text-zinc-400">系列圣经（SSOT）</h2>
            <p className="mb-3 shrink-0 text-[10px] leading-relaxed text-zinc-500">
              项目内设定真源；对话与圣经冲突时以本正文为准。默认 Markdown 预览，与产物记录槽位相同，点「编辑」修改。
            </p>
            {bibleEmpty ? (
              <div className="mb-3 shrink-0 rounded-lg border border-indigo-900/50 bg-indigo-950/30 px-2.5 py-2 text-[10px] leading-relaxed text-indigo-100/90">
                <p className="mb-1.5 text-indigo-200/80">当前尚无系列圣经正文。</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canLlmFillBible || llmBibleLoading}
                    onClick={() => void handleLlmGenerateBible()}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {llmBibleLoading ? "生成中…" : "用 LLM 生成系列圣经"}
                  </button>
                  {!settings.apiKey ? (
                    <button
                      type="button"
                      onClick={() => onOpenSettings?.()}
                      className="text-[11px] text-indigo-300 underline hover:text-indigo-200"
                    >
                      去填写 API Key
                    </button>
                  ) : null}
                  {!creativeBrief.trim() ? (
                    <span className="text-zinc-500">需项目已有《创作思路确认书》。</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="mb-3 flex shrink-0 flex-wrap gap-2">
              {canLlmRewriteBible ? (
                <button
                  type="button"
                  disabled={llmBibleLoading}
                  onClick={() => void handleLlmRewriteBible()}
                  className="rounded bg-indigo-700 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-600 disabled:opacity-50"
                  title="覆盖当前正文，按确认书重新生成完整圣经"
                >
                  {llmBibleLoading ? "生成中…" : "用 LLM 重新生成系列圣经"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={!hasProject || !seriesBible.trim()}
                onClick={() =>
                  downloadSeriesBibleMarkdownFile(projectName || "未命名项目", seriesBible)
                }
                className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                title="仅导出为 .txt；侧栏编辑仍为 Markdown，内容一致"
              >
                导出 .txt
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ArtifactSlotEditor
                label="系列圣经正文"
                value={seriesBible}
                onCommit={onSeriesBibleChange}
                rows={28}
                textareaClassName="min-h-[min(22rem,42vh)]"
                placeholder="（空）点击「编辑」填写；Markdown。也可用上方「用 LLM 生成 / 重新生成」。"
              />
            </div>
            {auditIssues.length > 0 ? (
              <div className="mt-3 shrink-0 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-[10px] text-amber-100/90">
                <span className="font-medium">人物名粗检：</span>
                圣经候选名未在人物产物中找到：{auditIssues.map((x) => x.name).join("、")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <h2 className="mb-2 shrink-0 text-xs font-semibold text-zinc-400">英语 Locale 简报（STAGE 7 语体）</h2>
            <p className="mb-3 shrink-0 text-[10px] leading-relaxed text-zinc-500">
              全剧一份，与系列圣经并列存于工程；用当前设置中的大模型根据立项与设定集摘录起草（与对话同一 API Key）。可手动改后再保存。
            </p>
            {!localeBriefGenerateEnabled ? (
              <div className="mb-3 shrink-0 rounded-lg border border-amber-900/50 bg-amber-950/25 px-2.5 py-2 text-[10px] text-amber-100/90">
                进入 STAGE 6 大纲阶段后（当前查看阶段 ≥6 或工程已验至 ≥6）可使用下方「生成 / 更新」。在此之前仍可粘贴或编辑正文。
              </div>
            ) : null}
            <div className="mb-3 flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={localeGenLoading || !hasApiKey || !localeBriefGenerateEnabled}
                onClick={() => void handleGenerateLocaleBrief()}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {localeGenLoading ? "生成中…" : "生成 / 更新简报"}
              </button>
              {!hasApiKey ? (
                <button
                  type="button"
                  onClick={() => onOpenSettings?.()}
                  className="text-[11px] text-indigo-300 underline hover:text-indigo-200"
                >
                  去填写 API Key
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ArtifactSlotEditor
                label="英语 Locale 简报正文"
                value={englishLocaleBrief}
                onCommit={onEnglishLocaleBriefChange}
                rows={24}
                textareaClassName="min-h-[min(20rem,38vh)]"
                placeholder="生成或粘贴 Markdown…"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
