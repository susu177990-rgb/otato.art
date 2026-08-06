import { describe, expect, it } from "vitest";
import {
  getVideoReferenceConstraint,
  isKnownVideoModeId,
  mergeVideoSettings,
  validateVideoReferences,
} from "@/lib/video-workspace";

describe("video workspace prompt preset ids", () => {
  it("keeps prompt-library video preset ids valid for mode cover uploads", () => {
    const merged = mergeVideoSettings({
      customModes: [
        { id: "user_preset_video_abc123", label: "用户投稿" },
        { id: "community_submission_abc123", label: "审核发布" },
      ],
      prompts: {
        user_preset_video_abc123: "user video prompt",
        community_submission_abc123: "community video prompt",
      },
      coverImageUrlByMode: {
        user_preset_video_abc123: "https://example.com/user.gif",
        community_submission_abc123: "https://example.com/community.gif",
      },
    });

    expect(merged.customModes.map((mode) => mode.id)).toEqual([
      "user_preset_video_abc123",
      "community_submission_abc123",
    ]);
    expect(merged.prompts.user_preset_video_abc123).toBe("user video prompt");
    expect(merged.prompts.community_submission_abc123).toBe("community video prompt");
    expect(isKnownVideoModeId("community_submission_abc123", merged.customModes)).toBe(true);
    expect(isKnownVideoModeId("community_missing", merged.customModes)).toBe(false);
  });
});

describe("video reference constraints", () => {
  it("expresses exact motion control and frame slot capacities", () => {
    expect(getVideoReferenceConstraint("kling-2.6-motion", "motion_control")).toMatchObject({
      image: { min: 1, max: 1 },
      video: { min: 1, max: 1 },
      audio: { min: 0, max: 0 },
    });
    expect(getVideoReferenceConstraint("kling-3.0", "start_end_frame").image).toEqual({ min: 2, max: 2 });
  });

  it("expresses documented multi-reference limits per model and mode", () => {
    expect(getVideoReferenceConstraint("seedance-2.0", "multi_image_reference")).toEqual({
      image: { min: 0, max: 9 },
      video: { min: 0, max: 3 },
      audio: { min: 0, max: 3 },
      totalVideoDurationMax: 15,
      totalAudioDurationMax: 15,
    });
    expect(getVideoReferenceConstraint("happyhorse-1.0", "video_edit")).toMatchObject({
      image: { min: 0, max: 5 }, video: { min: 1, max: 1 },
    });
    expect(getVideoReferenceConstraint("veo-3.1-fast", "multi_image_reference").image).toEqual({ min: 1, max: 3 });
    expect(getVideoReferenceConstraint("grok-imagine", "multi_image_reference").image).toEqual({ min: 1, max: 7 });
    expect(getVideoReferenceConstraint("gemini-omni", "multi_image_reference")).toMatchObject({
      image: { min: 0, max: 7 }, video: { min: 0, max: 1 }, audio: { min: 0, max: 0 },
    });
  });

  it("enforces Seedance aggregate duration and required visual input", () => {
    expect(validateVideoReferences("seedance-2.0", "multi_image_reference", [
      { role: "video_reference", url: "https://example.com/a.mp4", durationSeconds: 8 },
      { role: "video_reference", url: "https://example.com/b.mp4", durationSeconds: 8 },
    ])).toEqual({ valid: false, error: "参考视频总时长不能超过 15 秒。" });
    expect(validateVideoReferences("seedance-2.0", "multi_image_reference", [
      { role: "audio_reference", url: "https://example.com/a.mp3", durationSeconds: 5 },
    ]).valid).toBe(false);
  });

  it("enforces Gemini conditional image cap when a video is present", () => {
    const references = [
      ...Array.from({ length: 6 }, (_, index) => ({ role: "image_reference" as const, url: `https://example.com/${index}.png` })),
      { role: "video_reference" as const, url: "https://example.com/ref.mp4" },
    ];
    expect(validateVideoReferences("gemini-omni", "multi_image_reference", references)).toEqual({
      valid: false,
      error: "Gemini Omni 带视频参考时最多支持 5 张参考图。",
      errorKind: "unsupported_capability",
    });
  });
});
