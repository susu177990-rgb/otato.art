import { pickNonEmptyTrimmed } from "@/lib/persisted-field";

export type VideoModeId =
  | "free"
  | "cinematic-text-to-video"
  | "storyboard-shot"
  | "product-ad";

export const VIDEO_MODES: ReadonlyArray<{ id: VideoModeId; label: string }> = [
  { id: "free", label: "自由模式" },
  { id: "cinematic-text-to-video", label: "电影镜头（文生视频）" },
  { id: "storyboard-shot", label: "分镜镜头（动作+机位）" },
  { id: "product-ad", label: "产品广告（镜头语言）" },
];

export type SeedanceModelName = "seedance-2.0" | "seedance-2.0-fast";

export type VideoModelId = "seedance-2.0" | "seedance-2.0-fast";

export type VideoAspectRatio = "16:9" | "9:16" | "4:3" | "3:4";

export type VideoDurationSeconds = 5 | 10 | 15;

export interface VideoModelSettings {
  id: VideoModelId;
  label: string;
  /** Seedance v2 base url, e.g. https://seedanceapi.org/v2 */
  baseUrl: string;
  apiKey: string;
  /** Seedance model name, e.g. seedance-2.0 */
  modelName: SeedanceModelName;
}

export interface CustomVideoMode {
  id: string;
  label: string;
}

export interface VideoWorkspaceSettings {
  prompts: Record<string, string>;
  models: Record<VideoModelId, VideoModelSettings>;
  customModes: CustomVideoMode[];
}

export const VIDEO_MODEL_ORDER: VideoModelId[] = ["seedance-2.0", "seedance-2.0-fast"];

const CINEMATIC_TEXT_TO_VIDEO_PROMPT = `# 任务：文生视频（电影镜头）
# 目标：生成一条可直接用于短剧/广告剪辑的镜头素材（真实镜头语言、明确机位运动、画面构图稳定）。

## 1. 画面内容（主体/动作/环境）
{{主体与动作（人物/道具/事件）}}

## 2. 镜头语言（机位/焦段/运动/节奏）
{{机位与运动（推拉摇移跟/长短镜头节奏）}}

## 3. 视觉风格（光线/质感/色彩/氛围）
{{风格与氛围（光影、色温、颗粒、质感）}}

## 4. 约束（禁止项/清晰度/稳定性）
{{约束（不抖动、不变形、不要字幕水印等）}}`;

const STORYBOARD_SHOT_PROMPT = `# 任务：分镜镜头生成（可直接匹配脚本）

## 分镜脚本
{{分镜脚本（发生了什么）}}

## 镜头调度
{{镜头调度（景别、机位、运动、对焦）}}

## 画面风格
{{画面风格（材质、光线、色彩）}}`;

const PRODUCT_AD_PROMPT = `# 任务：产品广告镜头（短视频）

## 产品与卖点
{{产品与卖点}}

## 镜头脚本（分镜/节奏）
{{镜头脚本（开场→展示→特写→收尾）}}

## 画面风格（灯光/材质/背景）
{{画面风格}}`;

export function defaultVideoModePrompt(id: VideoModeId): string {
  switch (id) {
    case "free":
      return "";
    case "cinematic-text-to-video":
      return CINEMATIC_TEXT_TO_VIDEO_PROMPT;
    case "storyboard-shot":
      return STORYBOARD_SHOT_PROMPT;
    case "product-ad":
      return PRODUCT_AD_PROMPT;
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

function seedanceModelDefaults(id: VideoModelId): VideoModelSettings {
  const modelName: SeedanceModelName = id === "seedance-2.0-fast" ? "seedance-2.0-fast" : "seedance-2.0";
  return {
    id,
    label: id,
    baseUrl: "https://seedanceapi.org/v2",
    apiKey: "",
    modelName,
  };
}

export const DEFAULT_VIDEO_SETTINGS: VideoWorkspaceSettings = {
  customModes: [],
  prompts: {
    free: "",
    "cinematic-text-to-video": CINEMATIC_TEXT_TO_VIDEO_PROMPT,
    "storyboard-shot": STORYBOARD_SHOT_PROMPT,
    "product-ad": PRODUCT_AD_PROMPT,
  },
  models: {
    "seedance-2.0": seedanceModelDefaults("seedance-2.0"),
    "seedance-2.0-fast": seedanceModelDefaults("seedance-2.0-fast"),
  },
};

function mergeVideoModelSettings(
  id: VideoModelId,
  partial: unknown,
): VideoModelSettings {
  const baked = seedanceModelDefaults(id);
  const p = partial && typeof partial === "object" ? (partial as Partial<VideoModelSettings>) : {};
  const baseUrl = pickNonEmptyTrimmed(p.baseUrl, baked.baseUrl);
  const apiKey = pickNonEmptyTrimmed(p.apiKey, baked.apiKey);
  const modelNameRaw = pickNonEmptyTrimmed(p.modelName, baked.modelName);
  const modelName: SeedanceModelName =
    modelNameRaw === "seedance-2.0-fast" ? "seedance-2.0-fast" : "seedance-2.0";
  const label = pickNonEmptyTrimmed(p.label, baked.label);
  return { id, label, baseUrl, apiKey, modelName };
}

export function mergeVideoSettings(partial: unknown): VideoWorkspaceSettings {
  const p = partial && typeof partial === "object" ? (partial as Partial<VideoWorkspaceSettings>) : {};
  const prompts: Record<string, string> = { ...DEFAULT_VIDEO_SETTINGS.prompts, ...(p.prompts ?? {}) };
  const modelsObj: Record<string, unknown> =
    p.models && typeof p.models === "object" ? (p.models as Record<string, unknown>) : {};
  const models: Record<VideoModelId, VideoModelSettings> = {
    "seedance-2.0": mergeVideoModelSettings("seedance-2.0", modelsObj["seedance-2.0"]),
    "seedance-2.0-fast": mergeVideoModelSettings("seedance-2.0-fast", modelsObj["seedance-2.0-fast"]),
  };
  const customModes = Array.isArray(p.customModes)
    ? p.customModes
        .filter((m) => m && typeof m === "object")
        .map((m) => {
          const row = m as Partial<CustomVideoMode>;
          const id = String(row.id ?? "").trim();
          const label = String(row.label ?? "").trim() || id;
          return id ? { id, label } : null;
        })
        .filter((x): x is CustomVideoMode => x !== null)
    : [];
  return { prompts, models, customModes };
}

export function extractPromptPlaceholderOccurrences(tpl: string): string[] {
  const matches = tpl.match(/\{\{[^}]+\}\}/g) ?? [];
  return matches;
}

export function placeholderInnerHint(token: string): string {
  const trimmed = token.trim();
  const m = trimmed.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return m?.[1]?.trim() ?? "";
}

export function composerSlotCountForTemplate(template: string, modeId: string): number {
  if (modeId === "free") return 1;
  const n = extractPromptPlaceholderOccurrences(template).length;
  return Math.max(1, n);
}

export function buildVideoPromptFromSlots(template: string, slotInputs: string[]): string {
  let i = 0;
  return template.replace(/\{\{[^}]+\}\}/g, () => slotInputs[i++] ?? "");
}

