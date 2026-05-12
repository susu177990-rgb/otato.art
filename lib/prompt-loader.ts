import fs from "fs";
import path from "path";
import { resolveAgentRoot } from "./agent-paths";

const AGENT_ROOT = resolveAgentRoot();
const AGENT_ASSETS_ROOT = path.join(AGENT_ROOT, "agent");

const ORDERED_FILES = [
  "prompts/main_prompt.md",
  "prompts/main-agent-role.md",
  "prompts/rule.md",
  "prompts/deliverable-markdown.md",
  "prompts/skill.md",
  "prompts/flowchart.md",
  "prompts/script-planning-agent-role.md",
  "prompts/lines-agent-role.md",
  "prompts/english-lines-agent-role.md",
  "context_assets/character_reference.md",
];

const TEMPLATES_DIR = path.join(AGENT_ASSETS_ROOT, "templates");
const KNOWLEDGE_DIR = path.join(AGENT_ROOT, "knowledge");
const SKILLS_DIR = path.join(AGENT_ROOT, "skills");
const KNOWLEDGE_EXCLUDE = new Set(["00_README.md"]);

function readFile(relPath: string): string {
  const abs = path.join(AGENT_ASSETS_ROOT, relPath);
  try {
    return fs.readFileSync(abs, "utf-8");
  } catch {
    console.warn(`[prompt-loader] skip missing file: ${abs}`);
    return "";
  }
}

function readTemplates(): string {
  try {
    const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".md"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(TEMPLATES_DIR, f), "utf-8");
        return `\n---\n<!-- template: ${f} -->\n${content}`;
      })
      .join("\n");
  } catch {
    console.warn(`[prompt-loader] templates dir not found: ${TEMPLATES_DIR}`);
    return "";
  }
}

function readKnowledge(): string {
  try {
    const files = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".md") && !KNOWLEDGE_EXCLUDE.has(f))
      .sort((a, b) => a.localeCompare(b, "en"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf-8");
        return `<!-- file: knowledge/${f} -->\n${content}`;
      })
      .join("\n\n");
  } catch {
    console.warn(`[prompt-loader] knowledge dir missing or unreadable: ${KNOWLEDGE_DIR}`);
    return "";
  }
}

function readSkills(): string {
  try {
    const files = fs
      .readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "en"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
        return `<!-- file: skills/${f} -->\n${content}`;
      })
      .join("\n\n");
  } catch {
    console.warn(`[prompt-loader] skills dir missing or unreadable: ${SKILLS_DIR}`);
    return "";
  }
}

let cached: string | null = null;
let planningCached: string | null = null;
let adaptationAnalyzeCached: string | null = null;
let adaptationDiscussCached: string | null = null;
let adaptationPlannerCached: string | null = null;
let seriesBibleGeneratorCached: string | null = null;
let prefillMetaCached: string | null = null;

/** 策划会话专用：轻量系统提示，不含全量 knowledge/templates */
export function loadPlanningSessionPrompt(): string {
  if (planningCached) return planningCached;
  const parts: string[] = [];
  const p1 = readFile("prompts/planning-session-prompt.md");
  if (p1) parts.push(`<!-- file: prompts/planning-session-prompt.md -->\n${p1}`);
  const p2 = readFile("prompts/script-planning-agent-role.md");
  if (p2) parts.push(`<!-- file: prompts/script-planning-agent-role.md -->\n${p2}`);
  planningCached = parts.join("\n\n");
  return planningCached;
}

/** 改编：单次原文分析（不含全量 knowledge） */
export function loadAdaptationAnalyzePrompt(): string {
  if (adaptationAnalyzeCached) return adaptationAnalyzeCached;
  const p = readFile("prompts/adaptation-analyze.md");
  adaptationAnalyzeCached = p ? `<!-- file: prompts/adaptation-analyze.md -->\n${p}` : "";
  return adaptationAnalyzeCached;
}

/** 改编：改编策略讨论会话 */
export function loadAdaptationDiscussPrompt(): string {
  if (adaptationDiscussCached) return adaptationDiscussCached;
  const p = readFile("prompts/adaptation-discuss.md");
  adaptationDiscussCached = p ? `<!-- file: prompts/adaptation-discuss.md -->\n${p}` : "";
  return adaptationDiscussCached;
}

/** 改编：规划师阶段（与 script-planning-agent-role 组合） */
export function loadAdaptationPlannerPrompt(): string {
  if (adaptationPlannerCached) return adaptationPlannerCached;
  const parts: string[] = [];
  const p1 = readFile("prompts/adaptation-planner.md");
  if (p1) parts.push(`<!-- file: prompts/adaptation-planner.md -->\n${p1}`);
  const p2 = readFile("prompts/script-planning-agent-role.md");
  if (p2) parts.push(`<!-- file: prompts/script-planning-agent-role.md -->\n${p2}`);
  adaptationPlannerCached = parts.join("\n\n");
  return adaptationPlannerCached;
}

/** 进编剧室前：由确认书生成项目级系列圣经 */
export function loadSeriesBibleGeneratorPrompt(): string {
  if (seriesBibleGeneratorCached) return seriesBibleGeneratorCached;
  const p = readFile("prompts/generate-series-bible.md");
  seriesBibleGeneratorCached = p ? `<!-- file: prompts/generate-series-bible.md -->\n${p}` : "";
  return seriesBibleGeneratorCached;
}

/** 立项元数据 JSON 抽取 */
export function loadPrefillMetaPrompt(): string {
  if (prefillMetaCached) return prefillMetaCached;
  const p = readFile("prompts/prefill-meta.md");
  prefillMetaCached = p ? `<!-- file: prompts/prefill-meta.md -->\n${p}` : "";
  return prefillMetaCached;
}

export function loadSystemPrompt(): string {
  if (cached) return cached;

  const parts: string[] = [];

  for (const rel of ORDERED_FILES) {
    const content = readFile(rel);
    if (content) {
      parts.push(`<!-- file: ${rel} -->\n${content}`);
    }
  }

  const knowledge = readKnowledge();
  if (knowledge) {
    parts.push(knowledge);
  }

  const skills = readSkills();
  if (skills) {
    parts.push(skills);
  }

  const templates = readTemplates();
  if (templates) {
    parts.push(templates);
  }

  cached = parts.join("\n\n");
  return cached;
}
