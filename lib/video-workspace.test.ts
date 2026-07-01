import { describe, expect, it } from "vitest";
import { isKnownVideoModeId, mergeVideoSettings } from "@/lib/video-workspace";

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
