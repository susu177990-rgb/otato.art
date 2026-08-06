import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import { buildAgentSystemText, runAgentChatTurn } from "./agent";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAgentSystemText", () => {
  it("anchors the assistant to the product and keeps image generation explicit", () => {
    const text = buildAgentSystemText(["你是 Codex，一个本地编码 Agent。"], null);

    expect(text).toContain("oTATo Art 工作台内的画布与创作助手");
    expect(text).toContain("不是 Codex");
    expect(text).toContain("显式生图流程");
    expect(text).toContain("禁止声称已经生成图片");
  });

  it("injects only the active prompt source", () => {
    expect(buildAgentSystemText(["skill A"], null)).toContain("skill A");
    expect(buildAgentSystemText([], "preset A")).toContain("对话提示词预设\npreset A");
  });

  it("bounds oversized skill context", () => {
    const text = buildAgentSystemText(["A".repeat(80_000)], null);
    expect(text).toContain("系统已截断");
    expect(text.length).toBeLessThan(62_000);
  });
});

describe("runAgentChatTurn", () => {
  it("uses exactly one upstream LLM request for ordinary, skill, or preset text chat", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "测试回复" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    for (const promptSource of [
      { skillMarkdownBlocks: [] as string[], chatPromptPresetBlock: null },
      { skillMarkdownBlocks: ["保持简洁"], chatPromptPresetBlock: null },
      { skillMarkdownBlocks: [] as string[], chatPromptPresetBlock: "保持简洁" },
    ]) {
      fetchMock.mockClear();
      const result = await runAgentChatTurn({
        chatApiConfig: {
          presetId: "test",
          modelName: "test-model",
          endpointUrl: "https://example.com/v1/chat/completions",
          apiKey: "test-key",
        },
        imageWorkspace: DEFAULT_IMAGE_SETTINGS,
        defaultImageModelId: "gpt-image-2",
        conversationMessages: [{
          id: "u1",
          role: "user",
          createdAt: 1,
          parts: [{ type: "text", text: "测试回复1" }],
        }],
        ...promptSource,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result[0]).toMatchObject({ role: "assistant", parts: [{ type: "text", text: "测试回复" }] });
    }
  });
});
