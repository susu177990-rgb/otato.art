import { BAKED_LLM_SETTINGS } from "@/lib/baked-api-defaults";
import {
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_SETTINGS,
  type LlmModelConfig,
  type Settings,
} from "@/lib/types";

type LegacySettings = {
  apiUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
};

export const LEGACY_MIGRATED_MODEL_ID = "legacy-default";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeModelId(value: unknown, fallback: string): string {
  const raw = text(value);
  return raw || fallback;
}

function normalizeModelLabel(value: unknown, fallback: string): string {
  const raw = text(value);
  return raw || fallback;
}

function normalizeLlmModelConfig(
  id: string,
  value: unknown,
  fallback: LlmModelConfig,
): LlmModelConfig {
  const row = value && typeof value === "object" ? (value as Partial<LlmModelConfig>) : {};
  const modelName = text(row.modelName) || fallback.modelName;
  let label = normalizeModelLabel(row.label, fallback.label);
  if (label === "默认模型" || !label) {
    label = modelName;
  }
  return {
    id,
    label,
    modelName,
    enabled: row.enabled !== false,
    apiUrl: text(row.apiUrl),
    apiKey: text(row.apiKey),
  };
}

function migrateLegacySettings(value: LegacySettings): Settings {
  const apiUrl = text(value.apiUrl) || BAKED_LLM_SETTINGS.apiUrl;
  const apiKey = text(value.apiKey) || BAKED_LLM_SETTINGS.apiKey;
  const modelName = text(value.model) || BAKED_LLM_SETTINGS.model;
  return {
    defaultModelId: LEGACY_MIGRATED_MODEL_ID,
    models: {
      [LEGACY_MIGRATED_MODEL_ID]: {
        id: LEGACY_MIGRATED_MODEL_ID,
        label: modelName,
        modelName,
        enabled: true,
        apiUrl,
        apiKey,
      },
    },
    apiUrl,
    apiKey,
    model: modelName,
  };
}

export function normalizeLlmSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_SETTINGS;
  }

  const row = value as Partial<Settings>;
  const maybeLegacy = value as LegacySettings;
  if (!("models" in row) && ("apiUrl" in maybeLegacy || "apiKey" in maybeLegacy || "model" in maybeLegacy)) {
    return migrateLegacySettings(maybeLegacy);
  }
  const sourceModels = row.models && typeof row.models === "object" ? row.models : {};
  const defaults = DEFAULT_SETTINGS.models;
  const models = Object.fromEntries(
    Object.entries(sourceModels).map(([key, item]) => {
      const fallback = defaults[key] ?? {
        id: key,
        label: key === DEFAULT_LLM_MODEL_ID ? BAKED_LLM_SETTINGS.model : "未命名模型",
        modelName: BAKED_LLM_SETTINGS.model,
        enabled: true,
        apiUrl: BAKED_LLM_SETTINGS.apiUrl,
        apiKey: BAKED_LLM_SETTINGS.apiKey,
      };
      return [key, normalizeLlmModelConfig(key, item, fallback)];
    }),
  ) as Record<string, LlmModelConfig>;

  if (Object.keys(models).length === 0) {
    models[DEFAULT_LLM_MODEL_ID] = DEFAULT_SETTINGS.models[DEFAULT_LLM_MODEL_ID];
  }

  const normalizedDefaultModelId = normalizeModelId(
    row.defaultModelId,
    Object.keys(models)[0] ?? DEFAULT_LLM_MODEL_ID,
  );

  if (!models[normalizedDefaultModelId]) {
    models[normalizedDefaultModelId] = {
      id: normalizedDefaultModelId,
      label: BAKED_LLM_SETTINGS.model,
      modelName: BAKED_LLM_SETTINGS.model,
      enabled: true,
      apiUrl: BAKED_LLM_SETTINGS.apiUrl,
      apiKey: BAKED_LLM_SETTINGS.apiKey,
    };
  }

  const resolvedDefault = models[normalizedDefaultModelId];

  return {
    defaultModelId: normalizedDefaultModelId,
    models,
    apiUrl: resolvedDefault.apiUrl,
    apiKey: resolvedDefault.apiKey,
    model: resolvedDefault.modelName,
  };
}

export function resolveLlmModel(settings: Settings, preferredModelId?: string | null): LlmModelConfig {
  const requestedId = text(preferredModelId);
  const requested = requestedId ? settings.models[requestedId] : undefined;
  const fallback = settings.models[settings.defaultModelId] ?? Object.values(settings.models)[0] ?? DEFAULT_SETTINGS.models[DEFAULT_LLM_MODEL_ID];
  return requested && requested.enabled ? requested : fallback;
}
