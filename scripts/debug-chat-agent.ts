import { DEFAULT_IMAGE_SETTINGS } from "../lib/image-workspace";
import { BAKED_LLM_SETTINGS } from "../lib/baked-api-defaults";
import { runAgentChatTurn } from "../lib/chat/agent";
import { parseAssistantChoice, sendChatCompletionRaw } from "../lib/chat/completion";
import type { ChatMessage } from "../lib/chat/types";

async function main() {
  const cfg = {
    presetId: "x",
    modelName: BAKED_LLM_SETTINGS.model,
    endpointUrl: BAKED_LLM_SETTINGS.apiUrl,
    apiKey: BAKED_LLM_SETTINGS.apiKey,
  };

  const sys: ChatMessage = {
    id: "s",
    role: "system",
    createdAt: 1,
    parts: [{ type: "text", text: "你是助手，简短中文回复。" }],
  };
  const user: ChatMessage = {
    id: "u",
    role: "user",
    createdAt: 2,
    parts: [{ type: "text", text: "你好，回复：收到" }],
  };

  const r1 = await sendChatCompletionRaw(cfg, [sys, user]);
  const p1 = parseAssistantChoice(r1);
  console.log("plain content:", p1.contentText);
  console.log("plain tools:", p1.toolCalls.length);

  const tools = [
    {
      type: "function",
      function: { name: "list_saved_models", parameters: { type: "object", properties: {} } },
    },
  ];
  const r2 = await sendChatCompletionRaw(cfg, [sys, user], { tools, tool_choice: "auto" });
  const p2 = parseAssistantChoice(r2);
  const msg = (r2.choices as Array<{ message?: Record<string, unknown> }>)?.[0]?.message;
  console.log("with-tools content:", p2.contentText);
  console.log("with-tools parsed tools:", p2.toolCalls.length);
  console.log("raw tool_calls:", JSON.stringify(msg?.tool_calls)?.slice(0, 400));

  const chatCfg = {
    presetId: "x",
    modelName: BAKED_LLM_SETTINGS.model,
    endpointUrl: BAKED_LLM_SETTINGS.apiUrl,
    apiKey: BAKED_LLM_SETTINGS.apiKey,
  };

  for (const label of ["你好", "/grid 生成第1页"]) {
    const userMsg: ChatMessage = {
      id: "u2",
      role: "user",
      createdAt: Date.now(),
      parts: [{ type: "text", text: label }],
    };
    const out = await runAgentChatTurn({
      chatApiConfig: chatCfg,
      imageWorkspace: DEFAULT_IMAGE_SETTINGS,
      defaultImageModelId: "gpt-image-2",
      conversationMessages: [userMsg],
      skillMarkdownBlocks: ["### Skill\n若用户发 /grid 请输出分镜文字，不要只说要调工具。"],
    });
    console.log(`\n--- agent turn: ${label} ---`);
    console.log("messages:", out.length);
    for (const m of out) {
      const text = m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .slice(0, 120);
      console.log(m.role, text || "(no text)", m.toolCalls?.map((t) => t.name).join(",") || "");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
