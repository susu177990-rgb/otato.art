"use client";

import Link from "next/link";
import { useState } from "react";
import type { Artifact, Settings } from "@/lib/types";
import { auditBibleVsCast } from "@/lib/bible-audit";
import { downloadSeriesBibleMarkdownFile, downloadCreativeBriefMarkdownFile } from "@/lib/export-artifacts";
import ArtifactSlotEditor from "./ArtifactSlotEditor";
import shellStyles from "@/app/shared/shell.module.css";

export type BibleDrawerTab = "brief" | "bible" | "locale";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前标签（与顶栏「思路书」「圣经」「简报」按钮联动） */
  drawerTab: BibleDrawerTab;
  onDrawerTabChange: (tab: BibleDrawerTab) => void;
  hasProject: boolean;
  projectId: string;
  projectName: string;
  /** 《创作思路确认书》立项正文；思路书 tab 可编辑 */
  creativeBrief: string;
  onCreativeBriefChange: (next: string) => void;
  seriesBible: string;
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
  creativeBrief,
  onCreativeBriefChange,
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
      alert("请先在设置 → LLM API 中填写 API Key（与对话相同）。");
      return;
    }
    setLocaleGenLoading(true);
    try {
      const res = await fetch("/api/locale-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
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

  return (
    <>
      <div className={shellStyles.drawerScrim} onClick={onClose} aria-hidden />
      <div
        className={shellStyles.drawerCard}
        role="dialog"
        aria-label="创作思路确认书、系列圣经与英语简报"
      >
        <div className={shellStyles.drawerHead}>
          <div className={shellStyles.segmented} aria-label="抽屉视图">
            <button
              type="button"
              onClick={() => onDrawerTabChange("brief")}
              className={[
                shellStyles.segmentedItem,
                drawerTab === "brief" ? shellStyles.segmentedItemActive : "",
              ].join(" ")}
            >
              思路书
            </button>
            <button
              type="button"
              onClick={() => onDrawerTabChange("bible")}
              className={[
                shellStyles.segmentedItem,
                drawerTab === "bible" ? shellStyles.segmentedItemActive : "",
              ].join(" ")}
            >
              系列圣经
            </button>
            <button
              type="button"
              onClick={() => onDrawerTabChange("locale")}
              className={[
                shellStyles.segmentedItem,
                drawerTab === "locale" ? shellStyles.segmentedItemActive : "",
              ].join(" ")}
            >
              英语简报
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={shellStyles.iconBtn}
            title="关闭"
            aria-label="关闭抽屉"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {drawerTab === "brief" ? (
          <div className={shellStyles.drawerBody}>
            <div>
              <h2 className={shellStyles.cardTitle} style={{ fontSize: 13 }}>
                《创作思路确认书》
              </h2>
              <p className={shellStyles.cardSubtitle}>
                立项对齐后的方向与体量摘要（Markdown）。对话上下文会引用节选；修改后自动写入工程。
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {projectId ? (
                <Link
                  href={`/project/${projectId}/onboarding`}
                  className={shellStyles.navLink}
                  onClick={onClose}
                >
                  立项页完整编辑…
                </Link>
              ) : null}
              <button
                type="button"
                disabled={!hasProject || !creativeBrief.trim()}
                onClick={() =>
                  downloadCreativeBriefMarkdownFile(projectName || "未命名项目", creativeBrief)
                }
                className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                title="导出为与 ZIP 内 00-创作思路确认书.txt 一致的 Markdown"
              >
                导出 .txt
              </button>
            </div>

            <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
              <ArtifactSlotEditor
                label="创作思路确认书正文"
                value={creativeBrief}
                onCommit={onCreativeBriefChange}
                rows={28}
                textareaClassName="min-h-[min(22rem,42vh)]"
                placeholder="粘贴或撰写 Markdown…立项策划产出也可整理到此。"
              />
            </div>
          </div>
        ) : drawerTab === "bible" ? (
          <div className={shellStyles.drawerBody}>
            <div>
              <h2 className={shellStyles.cardTitle} style={{ fontSize: 13 }}>
                系列圣经（SSOT）
              </h2>
              <p className={shellStyles.cardSubtitle}>
                项目内设定真源；对话与圣经冲突时以本正文为准。默认 Markdown 预览，与产物记录槽位相同，点「编辑」修改。
              </p>
            </div>

            {bibleEmpty ? (
              <div
                className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}
                style={{ padding: "10px 12px" }}
              >
                <p style={{ margin: "0 0 8px", fontSize: 11, lineHeight: 1.6 }}>
                  当前尚无系列圣经正文。
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    disabled={!canLlmFillBible || llmBibleLoading}
                    onClick={() => void handleLlmGenerateBible()}
                    className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                  >
                    {llmBibleLoading ? "生成中…" : "用 LLM 生成系列圣经"}
                  </button>
                  {!settings.apiKey ? (
                    <button
                      type="button"
                      onClick={() => onOpenSettings?.()}
                      className={shellStyles.navLink}
                    >
                      去配置 LLM API
                    </button>
                  ) : null}
                  {!creativeBrief.trim() ? (
                    <span className={shellStyles.helpText}>需项目已有《创作思路确认书》。</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {canLlmRewriteBible ? (
                <button
                  type="button"
                  disabled={llmBibleLoading}
                  onClick={() => void handleLlmRewriteBible()}
                  className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
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
                className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                title="仅导出为 .txt；侧栏编辑仍为 Markdown，内容一致"
              >
                导出 .txt
              </button>
            </div>

            <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
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
              <div
                className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}
                style={{ padding: "8px 10px" }}
              >
                <span style={{ fontWeight: 500 }}>人物名粗检：</span>
                圣经候选名未在人物产物中找到：{auditIssues.map((x) => x.name).join("、")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={shellStyles.drawerBody}>
            <div>
              <h2 className={shellStyles.cardTitle} style={{ fontSize: 13 }}>
                英语 Locale 简报（STAGE 7 语体）
              </h2>
              <p className={shellStyles.cardSubtitle}>
                全剧一份，与系列圣经并列存于工程；用当前设置中的大模型根据立项与设定集摘录起草（与对话同一 API Key）。可手动改后再保存。
              </p>
            </div>

            {!localeBriefGenerateEnabled ? (
              <div
                className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}
                style={{ padding: "8px 10px" }}
              >
                进入 STAGE 6 大纲阶段后（当前查看阶段 ≥6 或工程已验至 ≥6）可使用下方「生成 / 更新」。在此之前仍可粘贴或编辑正文。
              </div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                disabled={localeGenLoading || !hasApiKey || !localeBriefGenerateEnabled}
                onClick={() => void handleGenerateLocaleBrief()}
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
              >
                {localeGenLoading ? "生成中…" : "生成 / 更新简报"}
              </button>
              {!hasApiKey ? (
                <button
                  type="button"
                  onClick={() => onOpenSettings?.()}
                  className={shellStyles.navLink}
                >
                  去填写 API Key
                </button>
              ) : null}
            </div>

            <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
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
