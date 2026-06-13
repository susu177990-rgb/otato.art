import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import { DEFAULT_API_USAGE_MODE, type WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { testPersonalApiConnection } from "@/lib/personal-api-test";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { DEFAULT_VIDEO_SETTINGS } from "@/lib/video-workspace";

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    llm: DEFAULT_SETTINGS,
    imageWorkspace: DEFAULT_IMAGE_SETTINGS,
    videoWorkspace: DEFAULT_VIDEO_SETTINGS,
    apiUsageMode: DEFAULT_API_USAGE_MODE,
    publicApiAccess: {},
    ...overrides,
  };
}

describe("personal API test diagnostics", () => {
  it("requires the selected module to be in personal API mode", async () => {
    const result = await testPersonalApiConnection(snapshot(), {
      module: "image",
      modelId: "gpt-image-2",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("API_MODE_NOT_USER");
    expect(result.module).toBe("image");
  });

  it("returns a stable incomplete-config code for missing image API keys", async () => {
    const result = await testPersonalApiConnection(
      snapshot({
        apiUsageMode: { llm: "site", image: "user", video: "site" },
        imageWorkspace: {
          ...DEFAULT_IMAGE_SETTINGS,
          models: {
            ...DEFAULT_IMAGE_SETTINGS.models,
            "gpt-image-2": {
              ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
              endpointUrl: "https://relay.example.com/v1/images?token=secret",
              apiKey: "",
              modelName: "gpt-image-2",
            },
          },
        },
      }),
      { module: "image", modelId: "gpt-image-2" },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("MODEL_CONFIG_INCOMPLETE");
    expect(result.safeEndpoint).toBe("https://relay.example.com/v1/images");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("validates video config without submitting a generation job", async () => {
    const result = await testPersonalApiConnection(
      snapshot({
        apiUsageMode: { llm: "site", image: "site", video: "user" },
        videoWorkspace: {
          ...DEFAULT_VIDEO_SETTINGS,
          models: {
            ...DEFAULT_VIDEO_SETTINGS.models,
            "seedance-2.0": {
              ...DEFAULT_VIDEO_SETTINGS.models["seedance-2.0"],
              baseUrl: "https://video.example.com/v1",
              apiKey: "sk-video-user",
              apiModelName: "seedance-2.0",
            },
          },
        },
      }),
      { module: "video", modelId: "seedance-2.0" },
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe("CONFIG_READY");
    expect(result.message).toContain("未提交真实视频任务");
  });
});
