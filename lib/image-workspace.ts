import { ANIME2D_CHARACTER_ASSET_PROMPT } from "@/lib/image-prompts/anime2d-character-asset";
import { CG3D_CHARACTER_ASSET_PROMPT } from "@/lib/image-prompts/cg3d-character-asset";
import { PHOTOREAL_PORTRAIT_FOUR_VIEW_PROMPT } from "@/lib/image-prompts/photoreal-portrait-four-view";
import { ANIME_STORYBOARD_GENERATE_PROMPT } from "@/lib/image-prompts/anime-storyboard-generate";
import { FILM_STORYBOARD_GENERATE_PROMPT } from "@/lib/image-prompts/film-storyboard-generate";
import { STORYBOARD_CONTINUATION_PROMPT } from "@/lib/image-prompts/storyboard-continuation";
import { PROP_ASSET_GRID_PROMPT } from "@/lib/image-prompts/prop-asset-grid";
import { BAKED_IMAGE_MODEL_DEFAULTS, BAKED_LLM_SETTINGS } from "@/lib/baked-api-defaults";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
export type ImageModeId =
  | "free"
  | "real-character-asset"
  | "photoreal-portrait-four-view"
  | "anime2d-character-asset"
  | "cg3d-character-asset"
  | "prop-asset"
  | "storyboard-continuation"
  | "anime-storyboard-generate"
  | "film-storyboard-generate";

/** 作图页左侧模式顺序与展示名 */
export const IMAGE_MODES: ReadonlyArray<{ id: ImageModeId; label: string }> = [
  { id: "free", label: "自由模式" },
  { id: "real-character-asset", label: "真实角色资产" },
  { id: "photoreal-portrait-four-view", label: "真实人物肖像四视图" },
  { id: "anime2d-character-asset", label: "2D角色资产" },
  { id: "cg3d-character-asset", label: "3D角色资产" },
  { id: "prop-asset", label: "道具资产" },
  { id: "storyboard-continuation", label: "分镜延续" },
  { id: "anime-storyboard-generate", label: "动漫分镜生成" },
  { id: "film-storyboard-generate", label: "电影分镜生成" },
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

export const REAL_CHARACTER_ASSET_PROMPT = `# 任务目标：生成超写实真人角色视觉档案底图（全性别通用宫格版）
# 执行背景：基于多重参考图与下方“## 5. 角色设定”文本描述，生成极度真实的商业级角色基础设定图，用于后续角色一致性与换装生成。

## 1. 风格基调与摄影质感
* 风格基调：极度写实的电影级商业摄影与原相机直出质感结合。必须看起来是在高端专业影棚中拍摄的真人模特照片，杜绝任何CG感、AI绘画感、3D建模感或美颜滤镜感。
* 质感要求：重点展现极度自然的真实皮肤纹理（毛孔、微瑕疵、胡茬或绒毛、真实的肤色过渡）和发丝细节。严禁添加任何不真实的泛红或水光油腻感。
* 镜头透视：真实 iPhone 原相机直出感。摄影背景必须保持全景深清晰，杜绝背景虚化，维持绝对客观的真实镜头空间感。若涉及第一人称视角，必须严格隐藏拍摄设备。

## 2. 背景与光影设定
    * 环境：真实室内白墙背景，干净无杂物，无家具干扰。
    * 光线：柔和均匀白光，接近平光，干净自然，轻微立体感，清楚表现五官骨相、白嫩肤质和上半身曲线，不要硬光，不要脏阴影，不要过曝。
    * 成像质感：Raw-style iPhone native camera photo, iPhone straight-out-of-camera look, realistic smartphone optics, natural skin texture, subtle sensor detail, real person photography, not CGI, not 3D, not illustration, not overly retouched.


## 3. 多重参考图融合指令
* 面部参考图分析执行：严格抓取并映射上传的面部参考图中的五官特征、骨相结构、肤色和年龄感。在宫格的所有画面中，人物必须是绝对的同一个人，保持百分之百的面部身份一致性。在后续使用强变化时，必须严格维持该角色的视觉基因。
* 服装参考图分析执行：严格复刻上传的服装参考图的具体设计款式、面料材质、颜色细节和整体版型。确保服装在正面半身、头部肖像以及全身的三视图（正面、侧面、背面）中的穿着效果是连贯且物理正确的。

## 4. 排版与构图标准
* 构图布局：4:3横屏画幅。采用精密的宫格构图结构：
    * 左侧大图，占画面约百分之四十：正面 waist-up 半身照主图，完整保留头顶，下边缘截取在肚脐下方到胯骨上方之间，人物站立身体摆正直视镜头，重点展示面部、肩颈线条与上半身服装比例。
    * 右上排宫格，面部肖像三视图：
\t1.  画面左侧：0度正视图（完全正面，直视镜头）
\t2.  画面中间：45度侧脸（微侧向左前方，展示面部立体感）
\t3.  画面右侧：90度正侧面（完全侧向左侧，展示侧颜剪影和下颌线）
    * 右下排宫格，全身三视图：
\t1.  画面左侧：正视图（全身，面向镜头）
\t2.  画面中间：侧视图（全身，90度转向侧面）
\t3.  画面右侧：后视图（全身，背对镜头）

## 5. 角色设定
{{用户输入}}`;

/** 各模式内置默认模版（自由模式为空）；合并缺键或代码回退时使用 */
export function defaultImageModePrompt(id: ImageModeId): string {
  switch (id) {
    case "free":
      return "";
    case "real-character-asset":
      return REAL_CHARACTER_ASSET_PROMPT;
    case "photoreal-portrait-four-view":
      return PHOTOREAL_PORTRAIT_FOUR_VIEW_PROMPT;
    case "anime2d-character-asset":
      return ANIME2D_CHARACTER_ASSET_PROMPT;
    case "cg3d-character-asset":
      return CG3D_CHARACTER_ASSET_PROMPT;
    case "prop-asset":
      return PROP_ASSET_GRID_PROMPT;
    case "storyboard-continuation":
      return STORYBOARD_CONTINUATION_PROMPT;
    case "anime-storyboard-generate":
      return ANIME_STORYBOARD_GENERATE_PROMPT;
    case "film-storyboard-generate":
      return FILM_STORYBOARD_GENERATE_PROMPT;
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

export interface ImageWorkspaceSettings {
  /** 内置 + 自定义模式的模版；自定义键为 {@link CustomImageMode.id} */
  prompts: Record<string, string>;
  models: Record<ImageModelId, ImageModelSettings>;
  /** gpt-image 模型请求质量；nano-banana 忽略 */
  gptImageQuality: GptImageQuality;
  /** 接在内置 {@link IMAGE_MODES} 之后展示 */
  customModes: CustomImageMode[];
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
  status: ImageGenerationStatus;
  error?: string;
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
  prompts: {
    "real-character-asset": REAL_CHARACTER_ASSET_PROMPT,
    "photoreal-portrait-four-view": PHOTOREAL_PORTRAIT_FOUR_VIEW_PROMPT,
    "anime2d-character-asset": ANIME2D_CHARACTER_ASSET_PROMPT,
    "cg3d-character-asset": CG3D_CHARACTER_ASSET_PROMPT,
    "prop-asset": PROP_ASSET_GRID_PROMPT,
    "storyboard-continuation": STORYBOARD_CONTINUATION_PROMPT,
    "anime-storyboard-generate": ANIME_STORYBOARD_GENERATE_PROMPT,
    "film-storyboard-generate": FILM_STORYBOARD_GENERATE_PROMPT,
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
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
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
export const IMAGE_MODE_DUAL_PLACEHOLDERS: Partial<Record<ImageModeId, ImageModeDualPlaceholders>> = {
  "anime-storyboard-generate": {
    left: "绘画风格与质感：线条、笔触、上色方式（如赛璐璐/厚涂）等",
    right: "本分镜剧本：动作、机位、情绪与透视（台词勿当成字幕画进画面）",
  },
  "film-storyboard-generate": {
    left: "真人胶片风格与质感：颗粒、调色、光线气质、镜头气质等",
    right: "本镜头分镜：动作、机位、情绪与透视（台词勿当成字幕画进画面）",
  },
};

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
