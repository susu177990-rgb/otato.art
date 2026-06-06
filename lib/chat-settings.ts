import type { ChatApiConfig } from "@/lib/chat/types";
import type { Settings } from "@/lib/types";
import { resolveLlmModel } from "@/lib/llm-models";

/** 对话模式与编剧室等共用全站 LLM API（site_settings.llm）。 */
export function llmToChatApiConfig(llm: Settings, preferredLlmModelId?: string | null): ChatApiConfig {
  const model = resolveLlmModel(llm, preferredLlmModelId);
  return {
    presetId: `site-llm:${model.id}`,
    modelId: model.id,
    modelLabel: model.label,
    modelName: model.modelName,
    endpointUrl: model.apiUrl,
    apiKey: model.apiKey,
  };
}
