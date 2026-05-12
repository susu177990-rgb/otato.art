import { completeChatNonStream } from "./openai-completion";
import type { Project, ProjectMeta, Settings } from "./types";

function excerpt(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 从项目产物取 STAGE 5 设定集正文摘录（供 Locale 简报上下文） */
export function buildSettingsExcerptForLocale(artifacts: Project["artifacts"], maxChars = 2000): string {
  const cats = (artifacts ?? []).filter((a) => a.stage === 5 && a.subKey.startsWith("cat_"));
  const joined = cats.map((a) => a.content).join("\n\n").trim();
  return excerpt(joined, maxChars);
}

function metaLines(meta: ProjectMeta | undefined, fallbackName: string): string {
  const m = meta;
  return [
    `剧名：${m?.seriesTitle?.trim() || fallbackName}`,
    `目标市场：${m?.targetMarket?.trim() || "待确认"}`,
    `台词语言：${m?.dialogueLanguage?.trim() || "待确认"}`,
    `备注：${m?.extraNotes?.trim() || "无"}`,
  ].join("\n");
}

const LOCALE_BRIEF_SYSTEM = `你是英语影视对白与语体顾问。根据用户提供的立项材料（目标市场、台词语言、创作思路、系列圣经、设定集摘录），起草一份**全剧共用**的《英语 Locale 简报》Markdown。

要求：
- 基于常识与行业惯例归纳语体建议；**不要编造网址、文献或「某调查称」**；未在材料中出现具体剧名对标时，不要假装检索过某部作品。
- 目标读者是中文主创：小节标题可用中文，其中**示例对白、推荐英文措辞、术语**用英文写出。
- 严格使用下列 Markdown 一级/二级结构（可按材料增删要点，但保留这些章节标题）：

# 英语 Locale 简报（模型起草，可人工改）

> 由编剧室「生成 / 更新简报」使用当前设置中的大模型根据项目材料起草；**全剧一份**，STAGE 7 英语对白语体须与本简报一致。

## 地域与语体

## 对白语体与节奏（当代短剧 / 剧集口语）

## 称谓与礼貌层级

## 高频口语与避免翻译腔（translationese）

## 文化敏感与禁忌（创作向）

## 修订备忘

- （若材料不足，在此列出你需要主创补充的 2～5 条具体问题。）

文末另起一行输出：*生成时间（UTC）：* 后接 ISO 时间（由你在输出中填写当前 UTC 时间）。

只输出 Markdown 正文，不要代码围栏，不要前言或后记说明。`;

function buildUserContent(project: Project): string {
  const name = project.name?.trim() || "未命名项目";
  const brief = (project.creativeBrief ?? "").trim();
  const bible = (project.seriesBible ?? "").trim();
  const settingsExcerpt = buildSettingsExcerptForLocale(project.artifacts ?? []);

  return [
    "【请根据以下材料起草《英语 Locale 简报》】",
    "",
    "【立项元数据】",
    metaLines(project.meta, name),
    "",
    "【《创作思路确认书》（摘录）】",
    excerpt(brief, 2800) || "（无）",
    "",
    "【《系列圣经》（摘录）】",
    excerpt(bible, 3600) || "（无）",
    "",
    "【STAGE 5 设定集（摘录）】",
    settingsExcerpt || "（无）",
  ].join("\n");
}

export async function completeEnglishLocaleBrief(
  project: Project,
  settings: Settings
): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  const userContent = buildUserContent(project);
  const result = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: LOCALE_BRIEF_SYSTEM },
      { role: "user", content: userContent },
    ],
    temperature: 0.35,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, markdown: result.content };
}
