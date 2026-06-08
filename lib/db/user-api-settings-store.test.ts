import { describe, expect, it } from "vitest";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { DEFAULT_VIDEO_SETTINGS } from "@/lib/video-workspace";
import { userApiSettingsStoreTestInternals } from "@/lib/db/user-api-settings-store";

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
});
