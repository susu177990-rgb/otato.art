import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptApiKey } from "@/lib/api-key-crypto";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";
import {
  DEFAULT_API_USAGE_MODE,
  type ApiUsageMode,
  type ApiUsageSource,
  type WorkspaceSnapshot,
} from "@/lib/db/workspace-settings-store";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { mergeImageSettings, type GptImageQuality, type ImageModelId, type ImageModelSettings } from "@/lib/image-workspace";
import { normalizeLlmSettings } from "@/lib/llm-models";
import type { Settings, LlmModelConfig } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergeVideoSettings, VIDEO_MODEL_ORDER, type VideoModelId, type VideoModelSettings } from "@/lib/video-workspace";

type UserApiSettingsRow = {
  llm?: unknown;
  image_models?: unknown;
  video_models?: unknown;
  api_usage_mode?: unknown;
  public_api_access?: unknown;
};

type SnapshotVisibility = "client" | "server";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function apiUsageSource(value: unknown): ApiUsageSource {
  return value === "user" ? "user" : "site";
}

function normalizeApiUsageMode(raw: unknown): ApiUsageMode {
  if (!isObject(raw)) return DEFAULT_API_USAGE_MODE;
  return {
    llm: apiUsageSource(raw.llm),
    image: apiUsageSource(raw.image),
    video: apiUsageSource(raw.video),
  };
}

function normalizePublicApiAccess(raw: unknown): Record<string, unknown> {
  return isObject(raw) ? raw : {};
}

function imagePreferences(raw: unknown): { gptImageQuality?: GptImageQuality } {
  if (!isObject(raw) || !isObject(raw.__preferences)) return {};
  const q = raw.__preferences.gptImageQuality;
  return q === "auto" || q === "low" || q === "medium" || q === "high" ? { gptImageQuality: q } : {};
}

function videoPreferences(raw: unknown): Pick<ReturnType<typeof mergeVideoSettings>, "uiDefaults"> | Record<string, never> {
  if (!isObject(raw) || !isObject(raw.__preferences)) return {};
  return { uiDefaults: mergeVideoSettings({ uiDefaults: raw.__preferences.uiDefaults }).uiDefaults };
}

function userLlmWithSecrets(row: unknown, fallbackSettings: Settings): Settings {
  const settings = normalizeLlmSettings(row ?? fallbackSettings);
  const rawKeys = rawModelApiKeys(row);
  const models = Object.fromEntries(
    Object.entries(settings.models).map(([id, model]) => [
      id,
      {
        ...model,
        apiUrl: model.apiUrl || fallbackSettings.models[id]?.apiUrl || fallbackSettings.apiUrl,
        modelName: model.modelName || fallbackSettings.models[id]?.modelName || fallbackSettings.model,
        apiKey: readStoredApiKey(rawKeys[id] ?? model.apiKey) || fallbackSettings.models[id]?.apiKey || fallbackSettings.apiKey,
      },
    ]),
  ) as Record<string, LlmModelConfig>;
  const defaultModel = models[settings.defaultModelId] ?? Object.values(models)[0];
  return {
    ...settings,
    models,
    apiUrl: defaultModel?.apiUrl ?? settings.apiUrl,
    apiKey: defaultModel?.apiKey ?? settings.apiKey,
    model: defaultModel?.modelName ?? settings.model,
  };
}

function rawModelApiKeys(row: unknown): Record<string, string> {
  if (!isObject(row) || !isObject(row.models)) return {};
  return Object.fromEntries(
    Object.entries(row.models).map(([id, value]) => [
      id,
      isObject(value) ? text(value.apiKey) : "",
    ]),
  );
}

function storedModelApiKey(row: unknown, modelId: string): string {
  if (!isObject(row) || !isObject(row.models)) return "";
  const model = row.models[modelId];
  return isObject(model) ? text(model.apiKey) : "";
}

function storedApiKeyFromRecord(row: unknown, modelId: string): string {
  if (!isObject(row)) return "";
  const model = row[modelId];
  return isObject(model) ? text(model.apiKey) : "";
}

function readStoredApiKey(value: string): string {
  if (!value) return "";
  try {
    return decryptApiKey(value);
  } catch {
    return "";
  }
}

function resolveApiKeyForSave(value: string, existingStored: string): string {
  if (value === API_KEY_CONFIGURED_PLACEHOLDER || !value.trim()) {
    return value === API_KEY_CONFIGURED_PLACEHOLDER
      ? readStoredApiKey(existingStored)
      : "";
  }
  return value;
}

function userLlmForClient(row: unknown, fallbackSettings: Settings): Settings {
  const settings = normalizeLlmSettings(row ?? fallbackSettings);
  const rawKeys = rawModelApiKeys(row);
  const models = Object.fromEntries(
    Object.entries(settings.models).map(([id, model]) => [
      id,
      {
        ...model,
        apiUrl: model.apiUrl || fallbackSettings.models[id]?.apiUrl || fallbackSettings.apiUrl,
        modelName: model.modelName || fallbackSettings.models[id]?.modelName || fallbackSettings.model,
        apiKey: readStoredApiKey(rawKeys[id] ?? ""),
      },
    ]),
  ) as Record<string, LlmModelConfig>;
  const defaultModel = models[settings.defaultModelId] ?? Object.values(models)[0];
  return {
    ...settings,
    models,
    apiUrl: defaultModel?.apiUrl ?? settings.apiUrl,
    apiKey: defaultModel?.apiKey ?? settings.apiKey,
    model: defaultModel?.modelName ?? settings.model,
  };
}

function clientSiteLlmWithUserKeys(row: unknown, siteSettings: Settings): Settings {
  const userSettings = normalizeLlmSettings(row ?? {});
  const rawKeys = rawModelApiKeys(row);
  const models = Object.fromEntries(
    Object.entries(siteSettings.models).map(([id, model]) => {
      const userModel = userSettings.models[id];
      return [
        id,
        {
          ...model,
          apiKey: readStoredApiKey(rawKeys[id] ?? userModel?.apiKey ?? ""),
        },
      ];
    }),
  ) as Record<string, LlmModelConfig>;
  const defaultModel = models[siteSettings.defaultModelId] ?? Object.values(models)[0];
  return {
    ...siteSettings,
    models,
    apiKey: defaultModel?.apiKey ?? "",
    apiUrl: defaultModel?.apiUrl ?? siteSettings.apiUrl,
    model: defaultModel?.modelName ?? siteSettings.model,
  };
}

function mergeLlmForSave(incoming: unknown, existing: unknown): Settings {
  const incomingSettings = normalizeLlmSettings(incoming ?? DEFAULT_SETTINGS);
  const models = Object.fromEntries(
    Object.entries(incomingSettings.models).map(([id, model]) => {
      const nextKey = resolveApiKeyForSave(
        model.apiKey,
        storedModelApiKey(existing, id),
      );
      return [
        id,
        {
          ...model,
          apiKey: nextKey,
        },
      ];
    }),
  ) as Record<string, LlmModelConfig>;
  const defaultModel = models[incomingSettings.defaultModelId] ?? Object.values(models)[0];
  return {
    ...incomingSettings,
    models,
    apiUrl: defaultModel?.apiUrl ?? incomingSettings.apiUrl,
    apiKey: defaultModel?.apiKey ?? incomingSettings.apiKey,
    model: defaultModel?.modelName ?? incomingSettings.model,
  };
}

function sanitizeImageModelsForStorage(incoming: unknown, existing: unknown): Record<ImageModelId, ImageModelSettings> {
  const incomingSettings = mergeImageSettings({ models: incoming });
  return Object.fromEntries(
    Object.entries(incomingSettings.models).map(([id, model]) => {
      const modelId = id as ImageModelId;
      const nextKey = resolveApiKeyForSave(
        model.apiKey,
        storedApiKeyFromRecord(existing, modelId),
      );
      return [
        modelId,
        {
          ...model,
          apiKey: nextKey,
        },
      ];
    }),
  ) as Record<ImageModelId, ImageModelSettings>;
}

function sanitizeImageSettingsForStorage(incoming: unknown, existing: unknown): Record<string, unknown> {
  const incomingSettings = mergeImageSettings(incoming ?? {});
  return {
    ...sanitizeImageModelsForStorage(incomingSettings.models, existing),
    __preferences: {
      gptImageQuality: incomingSettings.gptImageQuality,
    },
  };
}

function decryptImageModels(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: readStoredApiKey(text(model.apiKey)),
        },
      ];
    }),
  );
}

function clientImageModels(raw: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(isObject(raw) ? raw : {}).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: readStoredApiKey(text(model.apiKey)),
        },
      ];
    }),
  );
}

function clearImageModelKeys(raw: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(isObject(raw) ? raw : {}).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: "",
        },
      ];
    }),
  );
}

function sanitizeVideoModelsForStorage(incoming: unknown, existing: unknown): Record<VideoModelId, VideoModelSettings> {
  const incomingSettings = mergeVideoSettings({ models: incoming });
  return Object.fromEntries(
    VIDEO_MODEL_ORDER.map((id) => {
      const model = incomingSettings.models[id];
      const nextKey = resolveApiKeyForSave(
        model.apiKey,
        storedApiKeyFromRecord(existing, id),
      );
      return [
        id,
        {
          ...model,
          apiKey: nextKey,
        },
      ];
    }),
  ) as Record<VideoModelId, VideoModelSettings>;
}

function sanitizeVideoSettingsForStorage(incoming: unknown, existing: unknown): Record<string, unknown> {
  const incomingSettings = mergeVideoSettings(incoming ?? {});
  return {
    ...sanitizeVideoModelsForStorage(incomingSettings.models, existing),
    __preferences: {
      uiDefaults: incomingSettings.uiDefaults,
    },
  };
}

export const userApiSettingsStoreTestInternals = {
  mergeLlmForSave,
  sanitizeImageModelsForStorage,
  sanitizeVideoModelsForStorage,
  sanitizeImageSettingsForStorage,
  sanitizeVideoSettingsForStorage,
  userWorkspaceDefaultsForClient,
  userLlmForClient,
  clientSiteLlmWithUserKeys,
  clientImageModels,
  clearImageModelKeys,
  clientVideoModels,
  clearVideoModelKeys,
};

function decryptVideoModels(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: readStoredApiKey(text(model.apiKey)),
        },
      ];
    }),
  );
}

function clientVideoModels(raw: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(isObject(raw) ? raw : {}).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: readStoredApiKey(text(model.apiKey)),
        },
      ];
    }),
  );
}

function clearVideoModelKeys(raw: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(isObject(raw) ? raw : {}).filter(([id]) => !id.startsWith("__")).map(([id, value]) => {
      const model = isObject(value) ? value : {};
      return [
        id,
        {
          ...model,
          apiKey: "",
        },
      ];
    }),
  );
}

function userWorkspaceDefaultsForClient(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const llmModels = Object.fromEntries(
    Object.entries(snapshot.llm.models).map(([id, model]) => [
      id,
      {
        ...model,
        apiKey: "",
      },
    ]),
  ) as Record<string, LlmModelConfig>;
  const llmDefault = llmModels[snapshot.llm.defaultModelId] ?? Object.values(llmModels)[0];
  return {
    llm: {
      ...snapshot.llm,
      models: llmModels,
      apiKey: llmDefault?.apiKey ?? "",
      apiUrl: llmDefault?.apiUrl ?? snapshot.llm.apiUrl,
      model: llmDefault?.modelName ?? snapshot.llm.model,
    },
    imageWorkspace: mergeImageSettings({
      ...snapshot.imageWorkspace,
      models: clearImageModelKeys(snapshot.imageWorkspace.models),
    }),
    videoWorkspace: mergeVideoSettings({
      ...snapshot.videoWorkspace,
      models: clearVideoModelKeys(snapshot.videoWorkspace.models),
    }),
    apiUsageMode: DEFAULT_API_USAGE_MODE,
    publicApiAccess: {},
  };
}

async function getUserApiSettingsRow(supabase: SupabaseClient, userId: string): Promise<UserApiSettingsRow | null> {
  const { data, error } = await supabase
    .from("user_api_settings")
    .select("llm, image_models, video_models, api_usage_mode, public_api_access")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserApiSettingsRow | null;
}

async function isPublicApiBlocked(userId: string): Promise<boolean> {
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("user_admin_profiles")
    .select("public_api_blocked")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (/user_admin_profiles|Could not find the table|schema cache/i.test(error.message)) return false;
    throw error;
  }
  return Boolean((data as { public_api_blocked?: unknown } | null)?.public_api_blocked);
}

export async function getUserWorkspaceSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options: { visibility: SnapshotVisibility },
): Promise<WorkspaceSnapshot> {
  const siteSnapshot = await getWorkspaceSnapshot(supabase);
  const row = await getUserApiSettingsRow(supabase, userId);
  const publicApiBlocked = await isPublicApiBlocked(userId);
  if (!row && !publicApiBlocked) return options.visibility === "server" ? siteSnapshot : userWorkspaceDefaultsForClient(siteSnapshot);
  if (!row && publicApiBlocked) {
    return {
      ...userWorkspaceDefaultsForClient(siteSnapshot),
      apiUsageMode: { llm: "user", image: "user", video: "user" },
      publicApiAccess: { blocked: true },
    };
  }

  const settingsRow = row ?? {};
  const apiUsageMode = publicApiBlocked
    ? { llm: "user" as const, image: "user" as const, video: "user" as const }
    : normalizeApiUsageMode(settingsRow.api_usage_mode);
  const publicApiAccess = normalizePublicApiAccess(settingsRow.public_api_access);
  const clientDefaults = options.visibility === "server" ? null : userWorkspaceDefaultsForClient(siteSnapshot);
  const llm = apiUsageMode.llm === "user"
    ? options.visibility === "server"
      ? userLlmWithSecrets(settingsRow.llm, siteSnapshot.llm)
      : userLlmForClient(settingsRow.llm, siteSnapshot.llm)
    : options.visibility === "server"
      ? siteSnapshot.llm
      : clientSiteLlmWithUserKeys(settingsRow.llm, siteSnapshot.llm);
  const imageModels =
    options.visibility === "server" ? decryptImageModels(settingsRow.image_models) : clientImageModels(settingsRow.image_models);
  const videoModels =
    options.visibility === "server" ? decryptVideoModels(settingsRow.video_models) : clientVideoModels(settingsRow.video_models);

  return {
    llm,
    imageWorkspace: apiUsageMode.image === "user" || options.visibility === "client"
      ? mergeImageSettings({
          ...siteSnapshot.imageWorkspace,
          ...imagePreferences(settingsRow.image_models),
          models: {
            ...(options.visibility === "server"
              ? siteSnapshot.imageWorkspace.models
              : clearImageModelKeys(siteSnapshot.imageWorkspace.models)),
            ...imageModels,
          },
        })
      : options.visibility === "server"
        ? siteSnapshot.imageWorkspace
        : clientDefaults?.imageWorkspace ?? userWorkspaceDefaultsForClient(siteSnapshot).imageWorkspace,
    videoWorkspace: apiUsageMode.video === "user" || options.visibility === "client"
      ? mergeVideoSettings({
          ...siteSnapshot.videoWorkspace,
          ...videoPreferences(settingsRow.video_models),
          models: {
            ...(options.visibility === "server"
              ? siteSnapshot.videoWorkspace.models
              : clearVideoModelKeys(siteSnapshot.videoWorkspace.models)),
            ...videoModels,
          },
        })
      : options.visibility === "server"
        ? siteSnapshot.videoWorkspace
        : clientDefaults?.videoWorkspace ?? userWorkspaceDefaultsForClient(siteSnapshot).videoWorkspace,
    apiUsageMode,
    publicApiAccess: publicApiBlocked ? { ...publicApiAccess, blocked: true } : publicApiAccess,
  };
}

export async function upsertUserApiSettings(
  supabase: SupabaseClient,
  userId: string,
  snapshot: {
    llm?: unknown;
    imageWorkspace?: unknown;
    videoWorkspace?: unknown;
    apiUsageMode?: unknown;
    publicApiAccess?: unknown;
  },
): Promise<void> {
  const existing = await getUserApiSettingsRow(supabase, userId);
  const llm = snapshot.llm === undefined ? existing?.llm ?? {} : mergeLlmForSave(snapshot.llm, existing?.llm);
  const imageModels = snapshot.imageWorkspace === undefined
    ? existing?.image_models ?? {}
    : sanitizeImageSettingsForStorage(mergeImageSettings(snapshot.imageWorkspace), existing?.image_models);
  const videoModels = snapshot.videoWorkspace === undefined
    ? existing?.video_models ?? {}
    : sanitizeVideoSettingsForStorage(mergeVideoSettings(snapshot.videoWorkspace), existing?.video_models);
  const apiUsageMode = (await isPublicApiBlocked(userId))
    ? { llm: "user" as const, image: "user" as const, video: "user" as const }
    : normalizeApiUsageMode(snapshot.apiUsageMode ?? existing?.api_usage_mode);
  const publicApiAccess = normalizePublicApiAccess(snapshot.publicApiAccess ?? existing?.public_api_access);

  const { error } = await supabase.from("user_api_settings").upsert(
    {
      user_id: userId,
      llm,
      image_models: imageModels,
      video_models: videoModels,
      api_usage_mode: apiUsageMode,
      public_api_access: publicApiAccess,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}
