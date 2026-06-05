import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
import {
  VIDEO_MODEL_ORDER,
  VIDEO_MODEL_REGISTRY,
  getVideoModelDefinition,
} from "@/lib/video-model-registry";
import type {
  UnifiedVideoReference,
  VideoAspectRatio,
  VideoCapabilitySet,
  VideoGenerationModeId,
  VideoModelDefinition,
  VideoModelId,
  VideoProviderOptions,
  VideoResolution,
} from "@/lib/video-core";
import { VIDEO_GENERATION_MODES, VIDEO_MODE_LABELS } from "@/lib/video-core";

export * from "@/lib/video-core";
export { VIDEO_MODEL_ORDER, VIDEO_GENERATION_MODES, VIDEO_MODE_LABELS, getVideoModelDefinition };

export type UiVideoModeId = "start_end_frame" | "multi_image_reference";

export const UI_VIDEO_MODES: ReadonlyArray<{ id: UiVideoModeId; label: string }> = [
  { id: "start_end_frame", label: "首尾帧" },
  { id: "multi_image_reference", label: "多图参考" },
];

export function inferEffectiveVideoMode(
  uiModeId: UiVideoModeId | string,
  hasStartFrame: boolean,
  hasEndFrame: boolean,
): { modeId: VideoGenerationModeId; error?: string } {
  if (uiModeId === "multi_image_reference") {
    return { modeId: "multi_image_reference" };
  }
  // Default to "start_end_frame" branch for anything else
  if (!hasStartFrame && !hasEndFrame) return { modeId: "text_to_video" };
  if (hasEndFrame && !hasStartFrame) return { modeId: "start_end_frame", error: "请先连接或上传首帧图，再连接或上传尾帧图。" };
  if (hasStartFrame && !hasEndFrame) return { modeId: "start_frame" };
  return { modeId: "start_end_frame" };
}

export type VideoPromptModeId =
  | "free";

export const VIDEO_MODES: ReadonlyArray<{ id: VideoPromptModeId; label: string }> = [
  { id: "free", label: "自由模式" },
];



export interface VideoModelSettings {
  id: VideoModelId;
  label: string;
  baseUrl: string;
  apiKey: string;
  apiModelName: string;
  enabled: boolean;
  providerOptions: VideoProviderOptions;
}

export interface CustomVideoMode {
  id: string;
  label: string;
}

export interface VideoWorkspaceSettings {
  prompts: Record<string, string>;
  models: Record<VideoModelId, VideoModelSettings>;
  customModes: CustomVideoMode[];
  coverImageUrlByMode: Record<string, string>;
  uiDefaults: {
    defaultModelId: VideoModelId;
    defaultModeByModel: Partial<Record<VideoModelId, VideoGenerationModeId>>;
    defaultAspectRatio: VideoAspectRatio;
    defaultDurationSeconds: number;
    defaultResolution: VideoResolution;
  };
}

type LegacyVideoModelId = "seedance-2.0" | "seedance-2.0-fast";
type LegacyVideoModelSettings = {
  id?: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
};

type LegacyVideoWorkspaceSettings = {
  prompts?: Record<string, string>;
  models?: Record<LegacyVideoModelId, LegacyVideoModelSettings>;
  customModes?: Array<{ id?: string; label?: string }>;
  customPresets?: unknown;
  presets?: unknown;
  coverImageUrlByMode?: unknown;
};

function defaultModelSettings(modelId: VideoModelId): VideoModelSettings {
  const model = VIDEO_MODEL_REGISTRY[modelId];
  return {
    id: modelId,
    label: model.label,
    baseUrl: "",
    apiKey: "",
    apiModelName: model.defaultApiModelName,
    enabled: true,
    providerOptions: {},
  };
}

export function defaultVideoModePrompt(id: VideoPromptModeId): string {
  switch (id) {
    case "free":
      return "";
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

export const DEFAULT_VIDEO_SETTINGS: VideoWorkspaceSettings = {
  customModes: [],
  coverImageUrlByMode: {},
  prompts: {
    free: "",
  },
  models: Object.fromEntries(
    VIDEO_MODEL_ORDER.map((id) => [id, defaultModelSettings(id)]),
  ) as Record<VideoModelId, VideoModelSettings>,
  uiDefaults: {
    defaultModelId: "seedance-2.0",
    defaultModeByModel: {
      "seedance-2.0": "text_to_video",
      "seedance-2.0-fast": "text_to_video",
      "seedance-1.5": "text_to_video",
      "kling-3.0": "text_to_video",
      "kling-2.6-motion": "motion_control",
      "veo-3.1": "text_to_video",
      "veo-3.1-fast": "text_to_video",
      "gemini-omni": "text_to_video",
    },
    defaultAspectRatio: "16:9",
    defaultDurationSeconds: 5,
    defaultResolution: "1080p",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeProviderOptions(value: unknown): VideoProviderOptions {
  if (!isObject(value)) return {};
  const out: VideoProviderOptions = {};
  for (const [key, raw] of Object.entries(value)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean" ||
      typeof raw === "undefined"
    ) {
      out[key] = raw;
    }
  }
  return out;
}

function coerceVideoModelSettings(modelId: VideoModelId, value: unknown): VideoModelSettings {
  const baked = defaultModelSettings(modelId);
  const row = isObject(value) ? value : {};
  return {
    id: modelId,
    label: pickNonEmptyTrimmed(row.label, baked.label),
    baseUrl: pickNonEmptyTrimmed(row.baseUrl, baked.baseUrl),
    apiKey: pickNonEmptyTrimmed(row.apiKey, baked.apiKey),
    apiModelName: pickNonEmptyTrimmed(row.apiModelName ?? row.modelName, baked.apiModelName),
    enabled: typeof row.enabled === "boolean" ? row.enabled : baked.enabled,
    providerOptions: sanitizeProviderOptions(row.providerOptions),
  };
}

function coercePromptsRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const builtInIds = new Set<string>(VIDEO_MODES.map((mode) => mode.id));
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      if (builtInIds.has(key) || key.startsWith("custom_video_")) {
        out[key] = raw;
      }
    }
  }
  return out;
}

function coerceCoverImageUrlByMode(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

function coerceVideoCustomModes(value: unknown): CustomVideoMode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CustomVideoMode[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const id = String(item.id ?? "").trim();
    const label = String(item.label ?? "").trim();
    if (!id || !id.startsWith("custom_video_") || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: label || id,
    });
  }
  return out;
}

function migrateCustomPresets(value: unknown): { modes: CustomVideoMode[]; prompts: Record<string, string> } {
  const modes: CustomVideoMode[] = [];
  const prompts: Record<string, string> = {};
  if (!Array.isArray(value)) return { modes, prompts };
  for (const item of value) {
    if (!isObject(item)) continue;
    const id = String(item.id ?? "").trim();
    const label = String(item.label ?? "").trim() || id;
    const promptTemplate = typeof item.promptTemplate === "string" ? item.promptTemplate : "";
    if (!id || !promptTemplate.trim()) continue;
    const nextId = id.startsWith("custom_video_") ? id : `custom_video_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    modes.push({ id: nextId, label });
    prompts[nextId] = promptTemplate;
  }
  return { modes, prompts };
}

function coerceUiDefaults(value: unknown): VideoWorkspaceSettings["uiDefaults"] {
  const row = isObject(value) ? value : {};
  const defaultModelId = VIDEO_MODEL_ORDER.includes(row.defaultModelId as VideoModelId)
    ? (row.defaultModelId as VideoModelId)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultModelId;
  const defaultModeByModel: Partial<Record<VideoModelId, VideoGenerationModeId>> = {
    ...DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultModeByModel,
  };
  if (isObject(row.defaultModeByModel)) {
    for (const modelId of VIDEO_MODEL_ORDER) {
      const modeId = row.defaultModeByModel[modelId];
      if (VIDEO_GENERATION_MODES.some((mode) => mode.id === modeId)) {
        defaultModeByModel[modelId] = modeId as VideoGenerationModeId;
      }
    }
  }
  const defaultAspectRatio = (
    ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21"] as VideoAspectRatio[]
  ).includes(row.defaultAspectRatio as VideoAspectRatio)
    ? (row.defaultAspectRatio as VideoAspectRatio)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultAspectRatio;
  const defaultDurationSeconds = Number(row.defaultDurationSeconds);
  const defaultResolution = (
    ["480p", "720p", "1080p", "4k"] as VideoResolution[]
  ).includes(row.defaultResolution as VideoResolution)
    ? (row.defaultResolution as VideoResolution)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultResolution;
  return {
    defaultModelId,
    defaultModeByModel,
    defaultAspectRatio,
    defaultDurationSeconds:
      Number.isFinite(defaultDurationSeconds) && defaultDurationSeconds > 0
        ? defaultDurationSeconds
        : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultDurationSeconds,
    defaultResolution,
  };
}

function migrateLegacyPrompts(value: LegacyVideoWorkspaceSettings): { modes: CustomVideoMode[]; prompts: Record<string, string> } {
  const prompts = isObject(value.prompts) ? value.prompts : {};
  const customModes = Array.isArray(value.customModes) ? value.customModes : [];
  const builtInIds = new Set<string>(VIDEO_MODES.map((mode) => mode.id));
  const modes: CustomVideoMode[] = [];
  const outPrompts: Record<string, string> = {};

  for (const [legacyModeId, promptTemplateRaw] of Object.entries(prompts)) {
    const promptTemplate = String(promptTemplateRaw ?? "");
    if (!promptTemplate.trim()) continue;
    if (builtInIds.has(legacyModeId)) continue;
    const customMode = customModes.find((item) => String(item?.id ?? "").trim() === legacyModeId);
    const id = legacyModeId.startsWith("custom_video_") ? legacyModeId : `custom_video_${legacyModeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    modes.push({
      id,
      label: String(customMode?.label ?? legacyModeId).trim() || legacyModeId,
    });
    outPrompts[id] = promptTemplate;
  }

  return { modes, prompts: outPrompts };
}

export function mergeVideoSettings(partial: unknown): VideoWorkspaceSettings {
  const p = isObject(partial) ? partial : {};
  const legacy = p as LegacyVideoWorkspaceSettings;

  const models = Object.fromEntries(
    VIDEO_MODEL_ORDER.map((id) => {
      const legacyValue =
        id === "seedance-2.0" || id === "seedance-2.0-fast"
          ? legacy.models?.[id as LegacyVideoModelId]
          : undefined;
      return [id, coerceVideoModelSettings(id, p.models && isObject(p.models) ? p.models[id] ?? legacyValue : legacyValue)];
    }),
  ) as Record<VideoModelId, VideoModelSettings>;

  const migratedLegacy = migrateLegacyPrompts(legacy);
  const migratedCustomPresets = migrateCustomPresets(p.customPresets);
  const prompts = {
    ...DEFAULT_VIDEO_SETTINGS.prompts,
    ...coercePromptsRecord(p.prompts),
    ...migratedLegacy.prompts,
    ...migratedCustomPresets.prompts,
  };
  const customModes = [
    ...coerceVideoCustomModes(p.customModes),
    ...migratedLegacy.modes,
    ...migratedCustomPresets.modes,
  ].filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);

  return {
    prompts,
    models,
    customModes,
    coverImageUrlByMode: coerceCoverImageUrlByMode(p.coverImageUrlByMode),
    uiDefaults: coerceUiDefaults(p.uiDefaults),
  };
}

export function extractPromptPlaceholderOccurrences(tpl: string): string[] {
  return tpl.match(/\{\{[^}]+\}\}/g) ?? [];
}

export function placeholderInnerHint(token: string): string {
  const trimmed = token.trim();
  const m = trimmed.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return m?.[1]?.trim() ?? "";
}

export function composerSlotCountForTemplate(template: string): number {
  return Math.max(1, extractPromptPlaceholderOccurrences(template).length);
}

export function buildVideoPromptFromSlots(template: string, slotInputs: string[]): string {
  if (!template.trim()) return slotInputs.join("\n\n").trim();
  let i = 0;
  return template.replace(/\{\{[^}]+\}\}/g, () => slotInputs[i++] ?? "");
}

export function getVideoCapabilities(modelId: VideoModelId): VideoCapabilitySet {
  return getVideoModelDefinition(modelId).capabilities;
}

export function summarizeVideoReferences(references: UnifiedVideoReference[]): string[] {
  return references.map((item, index) => `${index + 1}. ${item.role}:${item.label ?? item.url}`);
}

export function defaultModeForModel(settings: VideoWorkspaceSettings, modelId: VideoModelId): VideoGenerationModeId {
  const configured = settings.uiDefaults.defaultModeByModel[modelId];
  if (configured && getVideoCapabilities(modelId).supportedModes.includes(configured)) return configured;
  return getVideoCapabilities(modelId).supportedModes[0] ?? "text_to_video";
}

export function newCustomVideoPresetId(): string {
  return `custom_video_${crypto.randomUUID()}`;
}

export const newCustomVideoModeId = newCustomVideoPresetId;

const CUSTOM_VIDEO_MODE_ID_RE = /^custom_video_[a-zA-Z0-9_-]+$/;

export function isKnownVideoModeId(modeId: string, customModes: CustomVideoMode[] = []): boolean {
  const id = modeId.trim();
  if (!id || id === "free") return false;
  if (VIDEO_MODES.some((mode) => mode.id === id)) return true;
  return CUSTOM_VIDEO_MODE_ID_RE.test(id) && customModes.some((mode) => mode.id === id);
}

export function describeModelCapability(model: VideoModelDefinition): string {
  return model.capabilities.supportedModes.map((modeId) => VIDEO_MODE_LABELS[modeId]).join(" / ");
}
