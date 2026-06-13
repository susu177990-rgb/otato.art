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

  it("shows saved user-owned LLM keys to the owner", () => {
    const savedLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "sk-user-llm",
          },
        },
      },
      null,
    );
    const clientLlm = userApiSettingsStoreTestInternals.userLlmForClient(savedLlm, DEFAULT_SETTINGS);

    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("sk-user-llm");
    expect(savedLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("sk-user-llm");
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

    const savedLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            label: "Old User Model",
            apiKey: "sk-user-default",
          },
        },
      },
      null,
    );

    const clientLlm = userApiSettingsStoreTestInternals.clientSiteLlmWithUserKeys(
      savedLlm,
      siteSettings,
    );

    expect(Object.keys(clientLlm.models)).toEqual([DEFAULT_SETTINGS.defaultModelId, "admin-new-model"]);
    expect(clientLlm.defaultModelId).toBe("admin-new-model");
    expect(clientLlm.models["admin-new-model"].label).toBe("Admin New Model");
    expect(clientLlm.models["admin-new-model"].apiKey).toBe("");
    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("sk-user-default");
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
    expect(clientLlm.models["custom-user-model"].apiKey).toBe("sk-user-custom");
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

    expect(saved.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("sk-new-user-key");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";
  });

  it("treats an undecryptable legacy API key as empty instead of throwing", async () => {
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
            apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
          },
        },
      },
      existing,
    );

    const clientLlm = userApiSettingsStoreTestInternals.userLlmForClient(saved, DEFAULT_SETTINGS);
    expect(saved.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("");
    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("");
    process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";
  });

  it("can read a decryptable legacy encrypted API key", async () => {
    const { encryptApiKey } = await import("@/lib/api-key-crypto");
    const existing = {
      ...DEFAULT_SETTINGS,
      models: {
        [DEFAULT_SETTINGS.defaultModelId]: {
          ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
          apiKey: encryptApiKey("sk-legacy-user-key"),
        },
      },
    };

    const clientLlm = userApiSettingsStoreTestInternals.userLlmForClient(existing, DEFAULT_SETTINGS);

    expect(clientLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("sk-legacy-user-key");
  });

  it("clears an existing LLM API key when the submitted key is empty", () => {
    const existing = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "sk-existing-user-key",
          },
        },
      },
      null,
    );

    const saved = userApiSettingsStoreTestInternals.mergeLlmForSave(
      {
        ...DEFAULT_SETTINGS,
        models: {
          [DEFAULT_SETTINGS.defaultModelId]: {
            ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
            apiKey: "",
          },
        },
      },
      existing,
    );

    expect(saved.models[DEFAULT_SETTINGS.defaultModelId].apiKey).toBe("");
  });

  it("clears existing image and video API keys when the submitted key is empty", () => {
    const savedImage = userApiSettingsStoreTestInternals.sanitizeImageModelsForStorage(
      {
        "gpt-image-2": {
          ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
          apiKey: "sk-image-user",
        },
      },
      null,
    );
    const clearedImage = userApiSettingsStoreTestInternals.sanitizeImageModelsForStorage(
      {
        "gpt-image-2": {
          ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
          apiKey: "",
        },
      },
      savedImage,
    );
    expect(clearedImage["gpt-image-2"].apiKey).toBe("");

    const savedVideo = userApiSettingsStoreTestInternals.sanitizeVideoModelsForStorage(
      {
        "seedance-2.0": {
          ...DEFAULT_VIDEO_SETTINGS.models["seedance-2.0"],
          apiKey: "sk-video-user",
        },
      },
      null,
    );
    const clearedVideo = userApiSettingsStoreTestInternals.sanitizeVideoModelsForStorage(
      {
        "seedance-2.0": {
          ...DEFAULT_VIDEO_SETTINGS.models["seedance-2.0"],
          apiKey: "",
        },
      },
      savedVideo,
    );
    expect(clearedVideo["seedance-2.0"].apiKey).toBe("");
  });
});
