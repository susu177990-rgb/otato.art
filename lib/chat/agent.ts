import type { ChatApiConfig, ChatMessage, ConversationAttachmentEntry } from "@/lib/chat/types";
import { effectiveAgentImageModelId } from "@/lib/chat/image-model-catalog";
import type { ImageModelId, ImageWorkspaceSettings } from "@/lib/image-workspace";
import { buildAttachmentsById, compactMessagesForAgentApi } from "@/lib/chat/attachments";
import { parseAssistantChoice, sendChatCompletionRaw, validateMessagesForSend } from "@/lib/chat/completion";
import { executeAgentTool, type AgentToolContext } from "@/lib/chat/agent-tools";
import {
  applyImageIntentBoosterToLastUser,
  buildImageIntentBooster,
  buildFallbackGenerateImageArgs,
  detectImageGenerationIntent,
  openAiToolChoiceForImageIntent,
} from "@/lib/chat/image-intent";
import { applySlashBoosterToLastUser, extractSlashCommandBoosterFromMessages } from "@/lib/chat/slash-booster";

export const AGENT_MAX_ITERATIONS = 10;

export const OPENAI_AGENT_TOOLS: unknown[] = [
  {
    type: "function",
    function: {
      name: "list_saved_models",
      description:
        "列出当前可用于对话 Agent 的作图模型（不含密钥），对应设置页「生图 API」中的模型槽位。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_conversation_attachments",
      description:
        "列出当前对话中用户曾上传的附件索引（无二进制）。需要引用较早轮次用户发来的文件、图片时应先调用。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attachment",
      description:
        "根据 attachment_id 查看附件元数据与用法说明；generate_image 可直接使用 attachment_id 作为参考图引用。",
      parameters: {
        type: "object",
        properties: {
          attachment_id: {
            type: "string",
            description: "list_conversation_attachments 返回的 attachment_id",
          },
        },
        required: ["attachment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "调用作图 API 生成图片。preset_id 可省略（使用用户在对话栏选择的默认模型）。也可先 list_saved_models 查看可用模型。ref_image_urls 可为 http(s)、data URL，或本会话 attachment_id。",
      parameters: {
        type: "object",
        properties: {
          preset_id: {
            type: "string",
            description: "作图模型 id：gpt-image-2 | nano-banana-2 | nano-banana-pro；省略则用对话默认模型",
          },
          prompt: { type: "string", description: "图像描述提示词" },
          aspect_ratio: { type: "string", description: "如 auto, 1:1, 16:9 等" },
          image_size: { type: "string", description: "1K | 2K | 4K" },
          image_quality: { type: "string", description: "auto | low | medium | high（gpt-image 专用）" },
          ref_image_urls: {
            type: "array",
            items: { type: "string" },
            description: "参考图：URL、data:image...、或 attachment_id",
          },
        },
        required: ["prompt"],
      },
    },
  },
];

function buildAgentSystemText(
  skillBlocks: string[],
  defaultImageModel?: { id: ImageModelId; label: string },
): string {
  const skillsSection =
    skillBlocks.length === 0 ? "（当前未挂载 Skill 文档）" : skillBlocks.join("\n\n---\n\n");

  const imageDefaultLine = defaultImageModel
    ? `- 用户当前在对话栏选择的**默认生图模型**为 \`${defaultImageModel.id}\`（${defaultImageModel.label}）。调用 **generate_image** 时若未指定其它模型，请使用 \`preset_id: "${defaultImageModel.id}"\`（也可省略 preset_id）。`
    : `- 调用 **generate_image** 前可先 **list_saved_models** 确认 preset_id。`;

  return `你是 Gleam Media Studios 工作台内的对话 Agent。用户可能在 Skill 文档中定义了工作方式，请优先遵循 Skill 中的流程与约束。

## 工具使用约定
${imageDefaultLine}
- 用户提出作图、配图、分镜图、海报、插画等需求时，**必须**调用 **generate_image** 真实生图，禁止仅用文字描述「已生成」或编造图片链接。
- 若用户上传了参考图，或消息带有【生图指令·必须执行】前缀，**首轮回复必须先调用 generate_image**，再简短说明结果。
- **用户历史上传的附件**：较早轮次的图片/文件在模型上下文里可能已被压缩为占位说明。需要引用它们时，请先 **list_conversation_attachments**，再在 **generate_image** 的 **ref_image_urls** 中填入对应的 **attachment_id**。
- 工具返回 JSON：success 为 false 时向用户说明原因；success 且含 media_url 时汇总结果（不要编造 URL）。

## Skill 文档
${skillsSection}`;
}

export async function runAgentChatTurn(params: {
  chatApiConfig: ChatApiConfig;
  imageWorkspace: ImageWorkspaceSettings;
  defaultImageModelId: ImageModelId;
  conversationMessages: ChatMessage[];
  skillMarkdownBlocks: string[];
  conversationAttachments?: ConversationAttachmentEntry[];
  maxIterations?: number;
}): Promise<ChatMessage[]> {
  const {
    chatApiConfig,
    imageWorkspace,
    defaultImageModelId,
    conversationMessages,
    skillMarkdownBlocks,
    conversationAttachments,
    maxIterations = AGENT_MAX_ITERATIONS,
  } = params;

  const resolvedModelId = effectiveAgentImageModelId(undefined, defaultImageModelId);
  const modelLabel = imageWorkspace.models[resolvedModelId]?.label || resolvedModelId;

  const toolCtx: AgentToolContext = {
    attachmentsById: buildAttachmentsById(conversationAttachments),
    imageWorkspace,
    defaultImageModelId: resolvedModelId,
  };

  const slashBooster = extractSlashCommandBoosterFromMessages(conversationMessages);
  const imageIntent = slashBooster ? null : detectImageGenerationIntent(conversationMessages);
  const forceGenerateImage =
    Boolean(imageIntent?.active) && !slashBooster;

  const systemMsg: ChatMessage = {
    id: `sys-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "system",
    createdAt: Date.now(),
    parts: [
      {
        type: "text",
        text: buildAgentSystemText(skillMarkdownBlocks, { id: resolvedModelId, label: modelLabel }),
      },
    ],
  };

  const compacted = compactMessagesForAgentApi(conversationMessages.filter((m) => m.role !== "system"));
  const withSlash = applySlashBoosterToLastUser(compacted, slashBooster);
  const imageBooster = imageIntent?.active ? buildImageIntentBooster(imageIntent) : null;
  const history = applyImageIntentBoosterToLastUser(withSlash, imageBooster);

  let apiMessages: ChatMessage[] = [systemMsg, ...history];

  validateMessagesForSend(apiMessages);

  const appended: ChatMessage[] = [];

  for (let round = 0; round < maxIterations; round++) {
    const raw = await sendChatCompletionRaw(chatApiConfig, apiMessages, {
      tools: OPENAI_AGENT_TOOLS,
      tool_choice: openAiToolChoiceForImageIntent(forceGenerateImage && round === 0),
    });

    const { contentText, toolCalls } = parseAssistantChoice(raw);

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-ar-${round}-${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      createdAt: Date.now(),
      parts: contentText ? [{ type: "text", text: contentText }] : [],
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };

    let toolCallsToRun = toolCalls;
    if (toolCallsToRun.length === 0 && forceGenerateImage && round === 0) {
      const fallbackId = `call-fb-${Date.now()}`;
      const fallbackArgs = buildFallbackGenerateImageArgs(conversationMessages);
      toolCallsToRun = [{ id: fallbackId, name: "generate_image", arguments: fallbackArgs }];
      assistantMsg.toolCalls = toolCallsToRun;
    }

    appended.push(assistantMsg);
    apiMessages = [...apiMessages, assistantMsg];

    if (toolCallsToRun.length === 0) {
      break;
    }

    for (const tc of toolCallsToRun) {
      const resultStr = await executeAgentTool(tc.name, tc.arguments, toolCtx);
      const toolMsg: ChatMessage = {
        id: `msg-${Date.now()}-tool-${tc.id}`,
        role: "tool",
        createdAt: Date.now(),
        parts: [{ type: "text", text: resultStr }],
        toolCallId: tc.id,
      };
      appended.push(toolMsg);
      apiMessages = [...apiMessages, toolMsg];
    }
  }

  return appended;
}
