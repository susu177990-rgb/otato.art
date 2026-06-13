import { describe, expect, it } from "vitest";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { DEFAULT_VIDEO_SETTINGS } from "@/lib/video-workspace";
import { userApiSettingsStoreTestInternals } from "@/lib/db/user-api-settings-store";

process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";

describe("user API settings client snapshots", () => {
  it("does not present global API keys as user-saved keys", () => {
    const globalSnapshot = {
      llm: {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "sk-global-llm",
          },
        },
      },
      imageWorkspace: {
        ...DEFAULT_IMAGE_SETTINGS,
        models: {
          ...DEFAULT_IMAGE_SETTINGS.models,
          "gpt-image-2": {
            ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
            apiKey: "sk-global-image",
          },
        },
      },
      videoWorkspace: {
        ...DEFAULT_VIDEO_SETTINGS,
        models: {
          ...DEFAULT_VIDEO_SETTINGS.models,
          "seedance-2.0": {
            ...DEFAULT_VIDEO_SETTINGS.models["seedance-2.0"],
            apiKey: "sk-global-video",
          },
        },
      },
    };

    const clientSnapshot = userApiSettingsStoreTestInternals.userWorkspaceDefaultsForClient(globalSnapshot);

    expect(clientSnapshot.llm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("");
    expect(clientSnapshot.imageWorkspace.models["gpt-image-2"].apiKey).toBe("");
    expect(clientSnapshot.videoWorkspace.models["seedance-2.0"].apiKey).toBe("");
  });

  it("shows the saved placeholder only for user-owned LLM keys", () => {
    const clientLlm = userApiSettingsStoreTestInternals.userLlmForClient(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "enc:v1:user-key",
          },
        },
      },
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "sk-global-llm",
          },
        },
      },
    );

    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe(API_KEY_CONFIGURED_PLACEHOLDER);
  });

  it("keeps admin-added site LLM models visible when a user has older LLM settings", () => {
    const siteSettings = {
      ...DEFAULT_SETTINGS,
      defaultModelId: "admin-new-model",
      models: {
        [DEFAULT_SETTINGS.defaultModelId]: {
          ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
          apiKey: "sk-global-default",
        },
        "admin-new-model": {
          id: "admin-new-model",
          label: "Admin New Model",
          modelName: "admin-new-model",
          enabled: true,
          apiUrl: "https://example.com/v1/chat/completions",
          apiKey: "sk-global-new",
        },
      },
      apiUrl: "https://example.com/v1/chat/completions",
      apiKey: "sk-global-new",
      model: "admin-new-model",
    };

    const clientLlm = userApiSettingsStoreTestInternals.clientSiteLlmWithUserKeys(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            label: "Old User Model",
            apiKey: "enc:v1:user-key",
          },
        },
      },
      siteSettings,
    );

    expect(Object.keys(clientLlm.models)).toEqual([DEFAULT_SETTINGS.defaultModelId, "admin-new-model"]);
    expect(clientLlm.defaultModelId).toBe("admin-new-model");
    expect(clientLlm.models["admin-new-model"].label).toBe("Admin New Model");
    expect(clientLlm.models["admin-new-model"].apiKey).toBe("");
    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe(API_KEY_CONFIGURED_PLACEHOLDER);
  });

  it("keeps a saved custom user LLM model visible when the LLM mode is user", () => {
    const savedLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        defaultModelId: "custom-user-model",
        models: {
          ...DEFAULT_SETTINGS.models,
          "custom-user-model": {
            id: "custom-user-model",
            label: "Custom User Model",
            modelName: "custom-user-model",
            enabled: true,
            apiUrl: "https://user.example.com/v1/chat/completions",
            apiKey: "sk-user-custom",
          },
        },
      },
      null,
    );

    const clientLlm = userApiSettingsStoreTestInternals.userLlmForClient(savedLlm, DEFAULT_SETTINGS);

    expect(clientLlm.defaultModelId).toBe("custom-user-model");
    expect(clientLlm.models["custom-user-model"].label).toBe("Custom User Model");
    expect(clientLlm.models["custom-user-model"].apiUrl).toBe("https://user.example.com/v1/chat/completions");
    expect(clientLlm.models["custom-user-model"].apiKey).toBe(API_KEY_CONFIGURED_PLACEHOLDER);
  });

  it("can overwrite an API key that was encrypted with an old environment key", async () => {
    const { encryptApiKey } = await import("@/lib/api-key-crypto");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "old-encryption-key";
    const existing = {
      ...DEFAULT_SETTINGS,
      models: {
        [DEFAULT_SETTINGS.defaultModelId]: {
          ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
          apiKey: encryptApiKey("sk-old-user-key"),
        },
      },
    };

    process.env.API_SETTINGS_ENCRYPTION_KEY = "new-encryption-key";
    const saved = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "sk-new-user-key",
          },
        },
      },
      existing,
    );

    const { decryptApiKey } = await import("@/lib/api-key-crypto");
    expect(decryptApiKey(saved.models[DEFAULT_SETTINGS.defaultModelId].apiKey)).toBe("sk-new-user-key");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";
  });

  it("shows a readable error when preserving an API key encrypted with an old environment key", async () => {
    const { encryptApiKey } = await import("@/lib/api-key-crypto");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "old-encryption-key";
    const existing = {
      ...DEFAULT_SETTINGS,
      models: {
        [DEFAULT_SETTINGS.defaultModelId]: {
          ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
          apiKey: encryptApiKey("sk-old-user-key"),
        },
      },
    };

    process.env.API_SETTINGS_ENCRYPTION_KEY = "new-encryption-key";
    expect(() =>
      userApiSettingsStoreTestInternals.mergeLlmForSave(
        {
          ...DEFAULT_SETTINGS,
          models: {
            [DEFAULT_SETTINGS.defaultModelId]: {
              ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
              apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
            },
          },
        },
        existing,
      ),
    ).toThrow("请重新输入新的 API Key 后再保存");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";
  });
});
