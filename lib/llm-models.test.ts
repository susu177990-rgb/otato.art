import { describe, expect, it } from "vitest";
import {
  normalizeLlmSettings,
  resolveLlmModel,
  resolveLlmModelId,
  setDefaultLlmModel,
} from "@/lib/llm-models";

const raw = {
  defaultModelId: "old-default",
  models: {
    "old-default": { id: "old-default", label: "旧模型", modelName: "old/model", enabled: false, apiUrl: "https://api", apiKey: "key" },
    "new-default": { id: "new-default", label: "新模型", modelName: "new/model", enabled: true, apiUrl: "https://api", apiKey: "key" },
  },
};

describe("LLM model resolution", () => {
  it("promotes an enabled model when the stored default was disabled", () => {
    const settings = normalizeLlmSettings(raw);
    expect(settings.defaultModelId).toBe("new-default");
    expect(settings.model).toBe("new/model");
  });

  it("falls back from stale or disabled conversation preferences", () => {
    const settings = normalizeLlmSettings(raw);
    expect(resolveLlmModelId(settings, "default-gpt-5-4")).toBe("new-default");
    expect(resolveLlmModelId(settings, "old-default")).toBe("new-default");
    expect(resolveLlmModel(settings, "default-gpt-5-4").label).toBe("新模型");
  });

  it("enables a disabled model when the admin makes it the default", () => {
    const settings = normalizeLlmSettings(raw);
    const selected = setDefaultLlmModel(settings, "old-default");

    expect(selected.defaultModelId).toBe("old-default");
    expect(selected.models["old-default"].enabled).toBe(true);
    expect(normalizeLlmSettings(selected).defaultModelId).toBe("old-default");
  });
});
