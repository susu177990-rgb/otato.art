import { BAKED_LLM_SETTINGS } from "../lib/baked-api-defaults";
import { OPENAI_AGENT_TOOLS } from "../lib/chat/agent";
import { parseAssistantChoice, sendChatCompletionRaw, messageToOpenAiMessage } from "../lib/chat/completion";
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
    parts: [{ type: "text", text: "你是助手。用户要图时必须调用 generate_image。" }],
  };
  const user: ChatMessage = {
    id: "u",
    role: "user",
    createdAt: 2,
    parts: [{ type: "text", text: "【生图指令·必须执行】\n\n画一只猫" }],
  };

  const r1 = await sendChatCompletionRaw(cfg, [sys, user], {
    tools: OPENAI_AGENT_TOOLS,
    tool_choice: "auto",
  });
  const p1 = parseAssistantChoice(r1);
  console.log("round1 text:", p1.contentText?.slice(0, 60));
  console.log("round1 tools:", p1.toolCalls);

  if (p1.toolCalls.length === 0) {
    console.log("no tools, exit");
    return;
  }

  const asst: ChatMessage = {
    id: "a1",
    role: "assistant",
    createdAt: 3,
    parts: p1.contentText ? [{ type: "text", text: p1.contentText }] : [],
    toolCalls: p1.toolCalls,
  };
  const toolMsg: ChatMessage = {
    id: "t1",
    role: "tool",
    createdAt: 4,
    parts: [{ type: "text", text: JSON.stringify({ success: true, kind: "image", media_url: "https://example.com/x.png" }) }],
    toolCallId: p1.toolCalls[0]!.id,
  };

  const apiMsgs = [sys, user, asst, toolMsg].map(messageToOpenAiMessage);
  console.log("payload messages:", JSON.stringify(apiMsgs, null, 2).slice(0, 800));

  const r2 = await sendChatCompletionRaw(cfg, [sys, user, asst, toolMsg]);
  const p2 = parseAssistantChoice(r2);
  console.log("round2 text:", p2.contentText?.slice(0, 200));
  console.log("round2 tools:", p2.toolCalls.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
