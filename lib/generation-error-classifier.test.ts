import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  formatGenerationErrorForDisplay,
} from "@/lib/generation-error-classifier";

describe("generation error classifier", () => {
  it("classifies moderation and safety failures as content rejection", () => {
    expect(classifyGenerationError({
      message: "failed",
      upstreamBody: { data: { status: "failed", reason: "input_moderation" } },
    }).reasonCode).toBe("CONTENT_REJECTED");
  });

  it("keeps CRUN failed tasks without a reason as unknown provider failures", () => {
    const classified = classifyGenerationError({
      message: "CRUN 任务失败，未返回具体原因。",
      upstreamBody: { code: 200, message: "success", data: { status: "failed" } },
    });

    expect(classified.reasonCode).toBe("UNKNOWN_PROVIDER_FAILURE");
    expect(classified.userMessage).toContain("未返回具体原因");
  });

  it("classifies prompt validation errors as invalid prompt", () => {
    const classified = classifyGenerationError({
      status: 422,
      upstreamBody: {
        code: 422,
        message: "Missing Params or Type Error",
        errors: ["Value error, Invalid input for model z-image: prompt: String should have at most 800 characters"],
      },
    });
    expect(classified.reasonCode).toBe("INVALID_PROMPT");
    expect(classified.userMessage).toContain("prompt: String should have at most 800 characters");
  });

  it("extracts CRUN validation details from string upstream bodies", () => {
    const classified = classifyGenerationError({
      status: 422,
      upstreamBody: JSON.stringify({
        code: 422,
        message: "Missing Params or Type Error",
        errors: ["input.aspect_ratio must be one of the allowed values"],
      }),
    });

    expect(classified.reasonCode).toBe("INVALID_PROMPT");
    expect(classified.userMessage).toContain("aspect_ratio");
  });

  it("classifies auth and billing status codes", () => {
    expect(classifyGenerationError({ status: 401, message: "API key missing" }).reasonCode).toBe("AUTH_OR_KEY");
    expect(classifyGenerationError({ status: 402, message: "insufficient balance" }).reasonCode).toBe("QUOTA_OR_BILLING");
  });

  it("formats user-facing errors without technical details", () => {
    expect(formatGenerationErrorForDisplay({
      code: "IMAGE_UPSTREAM_POLL",
      reasonCode: "CONTENT_REJECTED",
      userMessage: "内容可能触发安全审核。",
    })).toBe("内容可能触发安全审核。（CONTENT_REJECTED）");

    expect(formatGenerationErrorForDisplay({ code: "IMAGE_UPSTREAM_POLL" })).toBe("IMAGE_UPSTREAM_POLL");
  });

  it("formats local account limits separately from upstream quota failures", () => {
    expect(formatGenerationErrorForDisplay({
      code: "too_many_pending_generations",
      reasonCode: "ACCOUNT_LIMIT",
      userMessage: "当前账号同时生成任务过多，请等待已有任务完成。",
    })).toBe("当前账号同时生成任务过多，请等待已有任务完成。（ACCOUNT_LIMIT）");
  });
});
