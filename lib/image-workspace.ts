import { BAKED_IMAGE_MODEL_DEFAULTS, BAKED_LLM_SETTINGS } from "@/lib/baked-api-defaults";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
export type ImageModeId =
  | "free";

/** 作图页左侧模式顺序与展示名 */
export const IMAGE_MODES: ReadonlyArray<{ id: ImageModeId; label: string }> = [
  { id: "free", label: "自由模式" },
];
export type ImageModelId = "gpt-image-2" | "nano-banana-2" | "nano-banana-pro";
export type ImageAspectRatio = "auto" | "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
export type ImageSizeTier = "1K" | "2K" | "4K";
/** OpenAI gpt-image-* `quality`：含官方默认 auto；仅 GPT Image 路由使用 */
export type GptImageQuality = "auto" | "low" | "medium" | "high";
export type ImageGenerationStatus = "success" | "error";

export const GPT_IMAGE_QUALITY_ORDER: GptImageQuality[] = ["auto", "low", "medium", "high"];

export const GPT_IMAGE_QUALITY_LABELS: Record<GptImageQuality, string> = {
  auto: "自动",
  low: "低",
  medium: "中",
  high: "高",
};

export const IMAGE_SETTINGS_STORAGE_KEY = "script-agent-image-settings";
export const IMAGE_GALLERY_STORAGE_KEY = "script-agent-image-gallery";



/** 各模式内置默认模版（自由模式为空）；合并缺键或代码回退时使用 */
export function defaultImageModePrompt(id: ImageModeId): string {
  switch (id) {
    case "free":
      return "";
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

export interface ImageModelSettings {
  id: ImageModelId;
  label: string;
  modelName: string;
  endpointUrl: string;
  apiKey: string;
  provider: "gpt-image" | "nano-banana";
}

/** 用户自定义作图模式（id 建议 `custom_` + UUID，避免与内置 {@link ImageModeId} 冲突） */
export interface CustomImageMode {
  id: string;
  label: string;
}

/** 作图页上传参考图槽位数量（图1…） */
export const IMAGE_REF_SLOT_COUNT = 10;

export interface ImageWorkspaceSettings {
  /** 内置 + 自定义模式的模版；自定义键为 {@link CustomImageMode.id} */
  prompts: Record<string, string>;
  models: Record<ImageModelId, ImageModelSettings>;
  /** gpt-image 模型请求质量；nano-banana 忽略 */
  gptImageQuality: GptImageQuality;
  /** 接在内置 {@link IMAGE_MODES} 之后展示 */
  customModes: CustomImageMode[];
  /**
   * 作图页参考图槽说明：modeId → 与「图1、图2…」顺序对应的短文（在设置页逐行填写）。
   * 某行留空则该槽仅显示「图n」。
   */
  refSlotHintsByMode: Record<string, string[]>;
  /** 设置页为各作图模式配置的封面图（Supabase Storage 公开 URL） */
  coverImageUrlByMode: Record<string, string>;
}

export interface ImageGalleryRecord {
  id: string;
  createdAt: string;
  modeId: string;
  modeName: string;
  modelId: ImageModelId;
  modelName: string;
  finalPrompt: string;
  userInput: string;
  /** 双槽输入模式（如动漫分镜）：第二段用户文案 */
  userInputSecondary?: string;
  /** 按模版中 `{{…}}` 出现顺序保存的各槽输入（新记录优先） */
  userSlotInputs?: string[];
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeTier;
  /** 仅 GPT Image 记录可能有值 */
  gptImageQuality?: GptImageQuality;
  imageUrl?: string;
  refImageCount: number;
  /**
   * 生成当时的参考图快照。按槽位保存，便于从右侧历史记录一键恢复输入状态。
   * 旧记录可能只有 refImageCount，没有本字段。
   */
  referenceImages?: ImageGalleryReferenceImage[];
  status: ImageGenerationStatus;
  error?: string;
}

export interface ImageGalleryReferenceImage {
  slotIndex: number;
  dataUrl: string;
  name?: string;
  type?: string;
}

export const IMAGE_MODEL_ORDER: ImageModelId[] = ["gpt-image-2", "nano-banana-2", "nano-banana-pro"];

function imageModelFromBaked(id: ImageModelId): ImageModelSettings {
  const row = BAKED_IMAGE_MODEL_DEFAULTS[id];
  return {
    id,
    label: id,
    modelName: row.modelName,
    endpointUrl: row.endpointUrl,
    apiKey: pickNonEmptyTrimmed(row.apiKey, BAKED_LLM_SETTINGS.apiKey),
    provider: id === "gpt-image-2" ? "gpt-image" : "nano-banana",
  };
}

export const DEFAULT_IMAGE_SETTINGS: ImageWorkspaceSettings = {
  gptImageQuality: "auto",
  customModes: [],
  refSlotHintsByMode: {},
  coverImageUrlByMode: {},
  prompts: {
    /** 自由模式：不使用固定模版，最终提示词 = 用户输入（需在界面填写，见作图页校验） */
    free: "",
  },
  models: {
    "gpt-image-2": imageModelFromBaked("gpt-image-2"),
    "nano-banana-2": imageModelFromBaked("nano-banana-2"),
    "nano-banana-pro": imageModelFromBaked("nano-banana-pro"),
  },
};

const CUSTOM_MODE_ID_RE = /^custom_[a-zA-Z0-9_-]+$/;

/** 设置页封面 / 自定义模式 id 校验（不含 free） */
export function isKnownImageModeId(modeId: string, customModes: CustomImageMode[] = []): boolean {
  const id = modeId.trim();
  if (!id || id === "free") return false;
  if (IMAGE_MODES.some((m) => m.id === id)) return true;
  return CUSTOM_MODE_ID_RE.test(id) && customModes.some((m) => m.id === id);
}

function coerceCustomModes(raw: unknown): CustomImageMode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomImageMode[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const label = String(o.label ?? "").trim();
    if (!CUSTOM_MODE_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: label || id });
  }
  return out;
}

function coercePromptsRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const builtInIds = new Set<string>(IMAGE_MODES.map((mode) => mode.id));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (builtInIds.has(k) || k.startsWith("custom_")) out[k] = v;
    } else if (v != null) {
      if (builtInIds.has(k) || k.startsWith("custom_")) out[k] = String(v);
    }
  }
  return out;
}

function coerceRefSlotHintsByMode(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [modeId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;
    const lines = val.map((x) => String(x ?? "").trim()).slice(0, IMAGE_REF_SLOT_COUNT);
    let end = lines.length;
    while (end > 0 && !lines[end - 1]) end -= 1;
    if (end > 0) out[modeId] = lines.slice(0, end);
  }
  return out;
}

function coerceCoverImageUrlByMode(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [modeId, val] of Object.entries(raw as Record<string, unknown>)) {
    const url = String(val ?? "").trim();
    if (url && /^https?:\/\//i.test(url)) out[modeId] = url;
  }
  return out;
}

/** 设置页多行文案 → 存入 settings 的数组（去掉末尾空行） */
export function parseRefSlotHintsTextarea(text: string): string[] {
  const rawLines = text.split(/\r?\n/);
  const lines = Array.from({ length: IMAGE_REF_SLOT_COUNT }, (_, i) => (rawLines[i] ?? "").trim());
  let end = lines.length;
  while (end > 0 && !lines[end - 1]) end -= 1;
  return lines.slice(0, end);
}

/** 设置页展示用：数组 → 多行文本 */
export function formatRefSlotHintsForTextarea(stored: string[] | undefined): string {
  if (!stored?.length) return "";
  const lines = Array.from({ length: IMAGE_REF_SLOT_COUNT }, (_, i) => (stored[i] ?? "").trim());
  let end = lines.length;
  while (end > 0 && !lines[end - 1]) end -= 1;
  return lines.slice(0, end).join("\n");
}

/** 写入 settings：去掉末尾空栏，每栏 trim */
export function refSlotHintsDraftRowsToStored(rows: string[]): string[] {
  let end = rows.length;
  while (end > 0 && !String(rows[end - 1] ?? "").trim()) end -= 1;
  return rows.slice(0, end).map((s) => String(s).trim());
}

/** 设置页编辑 UI：未配置时默认一行空字符串（仅「图1」一栏） */
export function refSlotHintsStoredToDraftRows(stored: string[] | undefined): string[] {
  if (stored && stored.length > 0) return [...stored];
  return [""];
}

function coerceGptImageQuality(v: unknown): GptImageQuality | undefined {
  return v === "auto" || v === "low" || v === "medium" || v === "high" ? v : undefined;
}

/** 合并设置或发往接口前做一次字符串化，避免 localStorage/异常类型导致 `.trim` 失效或误判为空 */
export function coerceImageModelStrings(m: ImageModelSettings): ImageModelSettings {
  return {
    ...m,
    label: String(m.label ?? "").trim() || DEFAULT_IMAGE_SETTINGS.models[m.id].label,
    modelName: String(m.modelName ?? "").trim(),
    endpointUrl: String(m.endpointUrl ?? "").trim(),
    apiKey: String(m.apiKey ?? "").trim(),
  };
}

export function mergeImageSettings(raw: unknown): ImageWorkspaceSettings {
  const source = raw && typeof raw === "object" ? (raw as Partial<ImageWorkspaceSettings>) : {};
  const sourcePrompts = coercePromptsRecord(source.prompts);
  const sourceModels = source.models && typeof source.models === "object" ? source.models : {};
  const customModes = coerceCustomModes(source.customModes);

  return {
    gptImageQuality: coerceGptImageQuality(source.gptImageQuality) ?? DEFAULT_IMAGE_SETTINGS.gptImageQuality,
    customModes,
    refSlotHintsByMode: coerceRefSlotHintsByMode(source.refSlotHintsByMode),
    coverImageUrlByMode: coerceCoverImageUrlByMode(source.coverImageUrlByMode),
    prompts: {
      ...DEFAULT_IMAGE_SETTINGS.prompts,
      ...sourcePrompts,
    },
    models: IMAGE_MODEL_ORDER.reduce((acc, id) => {
      const base = DEFAULT_IMAGE_SETTINGS.models[id];
      const inc = (sourceModels as Partial<Record<ImageModelId, Partial<ImageModelSettings>>>)[id];
      acc[id] = coerceImageModelStrings({
        ...base,
        ...inc,
        id,
        provider: base.provider,
        label: pickNonEmptyTrimmed(inc?.label, base.label),
        endpointUrl: pickNonEmptyTrimmed(inc?.endpointUrl, base.endpointUrl),
        apiKey: pickNonEmptyTrimmed(inc?.apiKey, base.apiKey),
        modelName: pickNonEmptyTrimmed(inc?.modelName, base.modelName),
      });
      return acc;
    }, {} as Record<ImageModelId, ImageModelSettings>),
  };
}

/**
 * 服务端从 POST JSON 解析 model；返回明确错误（含槽位 id），避免与「请求体过大解析失败」混淆。
 */
export function normalizeIncomingImageModel(
  raw: unknown,
):
  | { ok: true; model: ImageModelSettings }
  | { ok: false; message: string } {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ok: false, message: "请求里缺少 model 字段。" };
  }
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (id !== "gpt-image-2" && id !== "nano-banana-2" && id !== "nano-banana-pro") {
    return { ok: false, message: "model.id 无效，请刷新作图页后重试。" };
  }
  const base = DEFAULT_IMAGE_SETTINGS.models[id];
  const endpointUrl = String(o.endpointUrl ?? "").trim();
  const apiKey = String(o.apiKey ?? "").trim();
  const modelName = String(o.modelName ?? "").trim();
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : base.label;
  const provider: ImageModelSettings["provider"] =
    o.provider === "gpt-image" || o.provider === "nano-banana" ? o.provider : base.provider;

  if (!endpointUrl || !apiKey || !modelName) {
    return {
      ok: false,
      message: `「${label}」（槽位 ${id}）缺少 Endpoint / API Key / 模型名。请在 **设置 → 生图 API** 里找到对应卡片填写完整并点 **保存**。作图页选哪个模型，就用哪一套配置（与其它模型的预览无关）。`,
    };
  }

  return { ok: true, model: { id, label, endpointUrl, apiKey, modelName, provider } };
}

/** 双槽模版：绘画风格（与「分镜剧本」成对出现） */
export const IMAGE_PROMPT_SLOT_PAINTING_STYLE = "{{用户输入绘画风格}}";
/** 双槽模版：分镜剧本（与「绘画风格」成对出现） */
export const IMAGE_PROMPT_SLOT_STORYBOARD_SCRIPT = "{{用户输入分镜剧本}}";
/** 真人电影分镜：风格与质感槽（与 {@link IMAGE_PROMPT_SLOT_FILM_SCRIPT} 成对） */
export const IMAGE_PROMPT_SLOT_FILM_STYLE = "{{真人胶片电影风格与视觉质感控制}}";
/** 真人电影分镜：镜头剧本槽 */
export const IMAGE_PROMPT_SLOT_FILM_SCRIPT = "{{电影第X镜分镜内容}}";

export function templateUsesDualPaintingAndScriptSlots(template: string): boolean {
  const animeDual =
    template.includes(IMAGE_PROMPT_SLOT_PAINTING_STYLE) &&
    template.includes(IMAGE_PROMPT_SLOT_STORYBOARD_SCRIPT);
  const filmDual =
    template.includes(IMAGE_PROMPT_SLOT_FILM_STYLE) && template.includes(IMAGE_PROMPT_SLOT_FILM_SCRIPT);
  return animeDual || filmDual;
}

export type ImageModeDualPlaceholders = {
  /** 左栏 textarea placeholder */
  left: string;
  /** 右栏 textarea placeholder */
  right: string;
};

/** 双输入框仅用 placeholder 提示填写内容（无额外标题区） */
export const IMAGE_MODE_DUAL_PLACEHOLDERS: Partial<Record<string, ImageModeDualPlaceholders>> = {};

const PLACEHOLDER_OCCURRENCE_RE = /\{\{[^}]+\}\}/g;

/** 模版中每一处 `{{…}}` 按从左到右顺序（同一字符串出现多次则各占一档） */
export function extractPromptPlaceholderOccurrences(template: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_OCCURRENCE_RE.source, "g");
  while ((m = re.exec(template)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/**
 * 取出 `{{…}}` 括号内的文案（trim），用作作图页对应输入框的 placeholder。
 * 括号内留空时返回空字符串，由调用方兜底。
 */
export function placeholderInnerHint(fullToken: string): string {
  const m = fullToken.match(/^\{\{([\s\S]*)\}\}$/);
  return (m?.[1] ?? "").trim();
}

/** 作图页输入栏数量：自由模式 1；无占位符时 1；否则为出现次数 */
export function composerSlotCountForTemplate(template: string, modeId: string): number {
  if (modeId === "free") return 1;
  const n = extractPromptPlaceholderOccurrences(template).length;
  return n === 0 ? 1 : n;
}

export function newCustomImageModeId(): string {
  return `custom_${crypto.randomUUID()}`;
}

function slotValueForLegacyDualToken(token: string, primaryTrimmed: string, secondaryTrimmed: string): string {
  if (token === IMAGE_PROMPT_SLOT_FILM_STYLE || token === IMAGE_PROMPT_SLOT_PAINTING_STYLE) return primaryTrimmed;
  if (token === IMAGE_PROMPT_SLOT_FILM_SCRIPT || token === IMAGE_PROMPT_SLOT_STORYBOARD_SCRIPT) return secondaryTrimmed;
  return primaryTrimmed;
}

/** 将各槽内容按出现顺序依次替换每一处占位符（禁止 replaceAll，以支持同形占位符多槽） */
export function buildImagePromptFromSlots(template: string, slots: string[]): string {
  const occ = extractPromptPlaceholderOccurrences(template);
  if (occ.length === 0) {
    return buildImagePromptLegacyNoPlaceholders(template, slots[0] ?? "", slots[1]);
  }
  let result = template;
  let cursor = 0;
  for (let i = 0; i < occ.length; i++) {
    const token = occ[i];
    const idx = result.indexOf(token, cursor);
    if (idx === -1) break;
    const val = (slots[i] ?? "").trim();
    result = result.slice(0, idx) + val + result.slice(idx + token.length);
    cursor = idx + val.length;
  }
  return result;
}

function buildImagePromptLegacyNoPlaceholders(template: string, primary: string, secondary?: string): string {
  const trimmedPrimary = primary.trim();
  const trimmedSecondary = (secondary ?? "").trim();
  if (templateUsesDualPaintingAndScriptSlots(template)) {
    if (template.includes(IMAGE_PROMPT_SLOT_FILM_STYLE) && template.includes(IMAGE_PROMPT_SLOT_FILM_SCRIPT)) {
      return template
        .replaceAll(IMAGE_PROMPT_SLOT_FILM_STYLE, trimmedPrimary)
        .replaceAll(IMAGE_PROMPT_SLOT_FILM_SCRIPT, trimmedSecondary);
    }
    return template
      .replaceAll(IMAGE_PROMPT_SLOT_PAINTING_STYLE, trimmedPrimary)
      .replaceAll(IMAGE_PROMPT_SLOT_STORYBOARD_SCRIPT, trimmedSecondary);
  }

  const trimmedUser = trimmedPrimary;
  if (!template.trim()) return trimmedUser;
  if (template.includes("{{用户输入}}")) {
    return template.replaceAll("{{用户输入}}", trimmedUser);
  }
  if (template.includes("{{用户输入具体角色设定}}")) {
    return template.replaceAll("{{用户输入具体角色设定}}", trimmedUser);
  }
  if (template.includes("{{用户输入分镜脚本}}")) {
    return template.replaceAll("{{用户输入分镜脚本}}", trimmedUser);
  }
  return `${template.trim()}\n\n## 5. 角色设定\n${trimmedUser}`;
}

/** 兼容旧调用：按占位符出现顺序从 primary / secondary 推导各槽 */
export function buildImagePrompt(template: string, primary: string, secondary?: string): string {
  const occ = extractPromptPlaceholderOccurrences(template);
  if (occ.length === 0) {
    return buildImagePromptLegacyNoPlaceholders(template, primary, secondary);
  }
  const tp = primary.trim();
  const ts = (secondary ?? "").trim();
  const slots = occ.map((tok) => slotValueForLegacyDualToken(tok, tp, ts));
  return buildImagePromptFromSlots(template, slots);
}
