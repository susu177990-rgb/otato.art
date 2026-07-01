import { describe, expect, it } from "vitest";
import {
  GROK_IMAGINE_I2I_PROMPT_MAX_LENGTH,
  GROK_IMAGINE_I2I_ASPECT_RATIO_ORDER,
  GROK_IMAGINE_T2I_ASPECT_RATIO_ORDER,
  GROK_IMAGINE_T2I_PROMPT_MAX_LENGTH,
  GPT_IMAGE_2_PROMPT_MAX_LENGTH,
  GPT_IMAGE_2_PREMIUM_ASPECT_RATIO_ORDER,
  GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES,
  NANO_BANANA_PROMPT_MAX_LENGTH,
  Z_IMAGE_PROMPT_MAX_LENGTH,
  imageAspectRatiosForContext,
  imagePromptMaxLengthForContext,
  imageReferenceLimitForContext,
  imageSupportsAspectRatioForContext,
  isKnownImageModeId,
  mergeImageSettings,
  normalizeImageAspectRatioForContext,
} from "@/lib/image-workspace";

describe("image workspace model capabilities", () => {
  it("limits Grok Imagine text-to-image ratios when there are no references", () => {
    expect(imageAspectRatiosForContext("grok-imagine-i2i", 0)).toEqual(GROK_IMAGINE_T2I_ASPECT_RATIO_ORDER);
  });

  it("falls back to 1:1 for unsupported Grok Imagine text-to-image ratios", () => {
    expect(normalizeImageAspectRatioForContext("auto", "grok-imagine-i2i", 0)).toBe("1:1");
    expect(normalizeImageAspectRatioForContext("4:3", "grok-imagine-i2i", 0)).toBe("1:1");
    expect(normalizeImageAspectRatioForContext("21:9", "grok-imagine-i2i", 0)).toBe("1:1");
  });

  it("limits Grok Imagine image-to-image ratios to the provider-supported set", () => {
    expect(imageAspectRatiosForContext("grok-imagine-i2i", 1)).toEqual(GROK_IMAGINE_I2I_ASPECT_RATIO_ORDER);
    expect(imageAspectRatiosForContext("grok-imagine-i2i", 1)).not.toContain("9:16");
    expect(normalizeImageAspectRatioForContext("9:16", "grok-imagine-i2i", 1)).toBe("9:16");
    expect(imageSupportsAspectRatioForContext("grok-imagine-i2i", 1)).toBe(false);
    expect(imageAspectRatiosForContext("grok-imagine-i2i", 0)).toContain("9:16");
    expect(imageSupportsAspectRatioForContext("grok-imagine-i2i", 0)).toBe(true);
  });

  it("uses Grok Imagine prompt limits based on reference count", () => {
    expect(imagePromptMaxLengthForContext("grok-imagine-i2i", 0)).toBe(GROK_IMAGINE_T2I_PROMPT_MAX_LENGTH);
    expect(imagePromptMaxLengthForContext("grok-imagine-i2i", 1)).toBe(GROK_IMAGINE_I2I_PROMPT_MAX_LENGTH);
    expect(imagePromptMaxLengthForContext("z-image", 0)).toBe(Z_IMAGE_PROMPT_MAX_LENGTH);
    expect(imagePromptMaxLengthForContext("gpt-image-2", 0)).toBe(GPT_IMAGE_2_PROMPT_MAX_LENGTH);
    expect(imagePromptMaxLengthForContext("nano-banana-2", 0)).toBe(NANO_BANANA_PROMPT_MAX_LENGTH);
    expect(imagePromptMaxLengthForContext("nano-banana-pro", 0)).toBe(NANO_BANANA_PROMPT_MAX_LENGTH);
  });

  it("uses the full GPT Image 2 Premium ratio and reference limits", () => {
    expect(imageAspectRatiosForContext("gpt-image-2", 0)).toEqual(GPT_IMAGE_2_PREMIUM_ASPECT_RATIO_ORDER);
    expect(imageAspectRatiosForContext("gpt-image-2", 0)).toContain("5:4");
    expect(imageAspectRatiosForContext("gpt-image-2", 0)).toContain("4:5");
    expect(imageAspectRatiosForContext("gpt-image-2", 0)).toContain("9:21");
    expect(imageReferenceLimitForContext("gpt-image-2")).toBe(GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES);
  });

  it("normalizes missing or legacy auto GPT Image quality to low", () => {
    expect(mergeImageSettings({}).gptImageQuality).toBe("low");
    expect(mergeImageSettings({ gptImageQuality: "auto" }).gptImageQuality).toBe("low");
    expect(mergeImageSettings({ gptImageQuality: "medium" }).gptImageQuality).toBe("medium");
    expect(mergeImageSettings({ gptImageQuality: "high" }).gptImageQuality).toBe("high");
  });

  it("normalizes Crun GPT Image 2 variants to premium", () => {
    expect(mergeImageSettings({}).models["gpt-image-2"].modelName).toBe("openai/gpt-image-2-premium");
    expect(mergeImageSettings({
      models: {
        "gpt-image-2": { modelName: "openai/gpt-image-2" },
      },
    }).models["gpt-image-2"].modelName).toBe("openai/gpt-image-2-premium");
    expect(mergeImageSettings({
      models: {
        "gpt-image-2": { modelName: "openai/gpt-image-2-stable" },
      },
    }).models["gpt-image-2"].modelName).toBe("openai/gpt-image-2-premium");
  });

  it("keeps prompt-library image preset ids valid for mode cover uploads", () => {
    const merged = mergeImageSettings({
      customModes: [
        { id: "user_preset_image_abc123", label: "用户投稿" },
        { id: "community_submission_abc123", label: "审核发布" },
      ],
      prompts: {
        user_preset_image_abc123: "user prompt",
        community_submission_abc123: "community prompt",
      },
      coverImageUrlByMode: {
        user_preset_image_abc123: "https://example.com/user.webp",
        community_submission_abc123: "https://example.com/community.webp",
      },
    });

    expect(merged.customModes.map((mode) => mode.id)).toEqual([
      "user_preset_image_abc123",
      "community_submission_abc123",
    ]);
    expect(merged.prompts.user_preset_image_abc123).toBe("user prompt");
    expect(merged.prompts.community_submission_abc123).toBe("community prompt");
    expect(isKnownImageModeId("community_submission_abc123", merged.customModes)).toBe(true);
    expect(isKnownImageModeId("community_missing", merged.customModes)).toBe(false);
  });
});
