import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { effectiveAgentImageModelId } from "@/lib/chat/image-model-catalog";
import { llmToChatApiConfig } from "@/lib/chat-settings";
import { runAgentChatTurn } from "@/lib/chat/agent";
import { deriveConversationTitleFromFirstMessage } from "@/lib/chat/conversation-title";
import type { ChatConversation, ChatMessage, SkillPackRecord } from "@/lib/chat/types";
import { getCanvasBoard } from "@/lib/canvas/board-store";
import type { CanvasNode } from "@/lib/canvas/types";
import { appendChatConversationTurn, createChatConversation, getChatConversation } from "@/lib/db/chat-store";
import { listSitePromptPresetsByKind } from "@/lib/db/prompt-preset-store";
import { listSiteSkillPacks } from "@/lib/db/site-skill-store";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImageModelId } from "@/lib/image-workspace";
import { projectIdFromRequest, type ProjectScope } from "@/lib/db/project-scope";
import { classifyGenerationError } from "@/lib/generation-error-classifier";
import { ChatServiceError, normalizeChatError } from "@/lib/chat/errors";
import {
  claimChatTurn,
  markChatTurnCompleted,
  markChatTurnFailed,
  markChatTurnFinalizing,
} from "@/lib/db/chat-turn-store";

export const maxDuration = 300;

function generationErrorJson(message: string, code: string, status: number) {
  return {
    error: message,
    code,
    ...classifyGenerationError({ message, status }),
  };
}

type CanvasChatRunBody = {
  boardId?: unknown;
  nodeId?: unknown;
  userMessage?: unknown;
  preferredImageModelId?: ImageModelId;
  preferredLlmModelId?: string;
  projectId?: string | null;
};

function getSkillMarkdownBlocks(
  selectedSkillPackId: string | null | undefined,
  allPacks: SkillPackRecord[],
): string[] {
  const packId = selectedSkillPackId;
  if (!packId) return [];
  const pack = allPacks.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.skills.map((s) => `### Skill「${s.name}」（包: ${pack.title}）\n\n${s.markdown}`);
}

function getChatPromptPresetBlock(
  selectedChatPresetId: string | null | undefined,
  allPresets: SitePromptPreset[],
): string | null {
  if (!selectedChatPresetId) return null;
  const preset = allPresets.find((item) => item.id === selectedChatPresetId);
  if (!preset) return null;
  const prompt = preset.promptTemplate?.trim();
  if (!prompt) return null;
  return `### 对话提示词预设「${preset.title}」\n\n${prompt}`;
}

function textFromMessage(message: ChatMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function latestAssistantMarkdown(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const text = textFromMessage(msg);
    if (text) return text;
  }
  return "";
}

function latestAssistantMessageId(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role === "assistant") return msg.id;
  }
  return undefined;
}

function parseUserMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ChatMessage>;
  if (raw.role !== "user" || !Array.isArray(raw.parts)) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `msg-${Date.now()}-u`,
    role: "user",
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    parts: raw.parts.filter((part): part is ChatMessage["parts"][number] => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return false;
      const item = part as ChatMessage["parts"][number];
      return item.type === "text" && typeof item.text === "string";
    }),
  };
}

function mustBeTextNode(node: CanvasNode | undefined): CanvasNode {
  if (!node || node.type !== "text") {
    throw new Error("目标节点不是文本节点");
  }
  return node;
}

async function resolveConversation(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  sourceNode: CanvasNode;
  userMessage: ChatMessage;
  scope: ProjectScope;
}): Promise<ChatConversation> {
  const existingId = params.sourceNode.metadata?.chatConversationId?.trim();
  if (existingId) {
    const existing = await getChatConversation(params.supabase, params.userId, existingId, params.scope);
    if (existing) return existing;
  }

  const title = deriveConversationTitleFromFirstMessage(textFromMessage(params.userMessage)) || params.sourceNode.title || "画布对话节点";
  return createChatConversation(params.supabase, params.userId, randomUUID(), title, params.scope);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(generationErrorJson("请先登录后再运行画布对话节点", "canvas_chat_auth_required", 401), { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CanvasChatRunBody;
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    const projectId = projectIdFromRequest(req, body.projectId);
    const requestedScope = projectId === undefined ? {} : { projectId };
    const userMessage = parseUserMessage(body.userMessage);
    if (!boardId || !nodeId || !userMessage || userMessage.parts.length === 0) {
      return Response.json(generationErrorJson("缺少 boardId、nodeId 或有效 userMessage", "canvas_chat_missing_input", 400), { status: 400 });
    }

    const board = await getCanvasBoard(supabase, boardId, requestedScope);
    if (!board) {
      return Response.json(generationErrorJson("画布不存在", "canvas_chat_board_not_found", 404), { status: 404 });
    }
    const scope: ProjectScope = { projectId: board.projectId ?? null };
    const sourceNode = mustBeTextNode(board.nodes.find((node) => node.id === nodeId));

    const conv = await resolveConversation({ supabase, userId: user.id, sourceNode, userMessage, scope });
    const turnClaim = await claimChatTurn(supabase, user.id, conv.id, userMessage.id);
    const snapshot = await getWorkspaceSnapshot(supabase);
    const preferredLlmModelId = typeof body.preferredLlmModelId === "string" && body.preferredLlmModelId.trim()
      ? body.preferredLlmModelId.trim()
      : conv.preferredLlmModelId || null;
    const chatApiConfig = llmToChatApiConfig(snapshot.llm, preferredLlmModelId);
    const skillBlocks = conv.chatMode === "skill" && conv.selectedSkillPackId
      ? getSkillMarkdownBlocks(conv.selectedSkillPackId, await listSiteSkillPacks(supabase))
      : [];
    const chatPromptPresetBlock = conv.chatMode === "prompt" && conv.selectedChatPresetId
      ? getChatPromptPresetBlock(conv.selectedChatPresetId, await listSitePromptPresetsByKind(supabase, "chat"))
      : null;
    const preferredImageModelId = effectiveAgentImageModelId(body.preferredImageModelId, conv.preferredImageModelId);
    const messagesForApi: ChatMessage[] = [...conv.messages, userMessage];

    let newMessages: ChatMessage[];
    if (!turnClaim.claimed) {
      if ((turnClaim.turn.status === "finalizing" || turnClaim.turn.status === "completed") && turnClaim.turn.resultMessages) {
        newMessages = turnClaim.turn.resultMessages;
      } else if (turnClaim.turn.status === "pending") {
        throw new ChatServiceError("CHAT_TURN_RUNNING", 409, "这个画布对话任务正在运行，请勿重复提交。");
      } else {
        throw new ChatServiceError("CHAT_TURN_FAILED", 409, "这个画布对话任务已失败，请重新运行。");
      }
    } else {
      try {
        newMessages = await runAgentChatTurn({
          chatApiConfig,
          imageWorkspace: snapshot.imageWorkspace,
          defaultImageModelId: preferredImageModelId,
          conversationMessages: messagesForApi,
          skillMarkdownBlocks: skillBlocks,
          chatPromptPresetBlock,
          conversationAttachments: conv.attachments ?? [],
          supabase,
          userId: user.id,
          projectId: board.projectId ?? null,
        });
        await markChatTurnFinalizing(supabase, turnClaim.turn.id, newMessages);
      } catch (runError) {
        await markChatTurnFailed(
          supabase,
          turnClaim.turn.id,
          runError instanceof Error ? runError.message : String(runError),
        );
        throw runError;
      }
    }

    const title = conv.messages.length === 0
      ? deriveConversationTitleFromFirstMessage(textFromMessage(userMessage))
      : null;
    await appendChatConversationTurn(supabase, {
      conversationId: conv.id,
      userMessage,
      responseMessages: newMessages,
      title,
      preferredImageModelId,
      preferredLlmModelId,
    });
    await markChatTurnCompleted(supabase, turnClaim.turn.id);
    const updatedConversation = await getChatConversation(supabase, user.id, conv.id, scope);
    if (!updatedConversation) throw new Error("conversation_missing_after_append");
    const previewMarkdown = latestAssistantMarkdown(updatedConversation.messages);

    const sourceNodeNext: CanvasNode = {
      ...sourceNode,
      metadata: {
        ...sourceNode.metadata,
        textMode: "chat",
        chatConversationId: updatedConversation.id,
        chatInput: "",
        chatStatus: "success",
        chatLastError: undefined,
        chatPreferredImageModelId: preferredImageModelId,
        chatLastAssistantMessageId: latestAssistantMessageId(updatedConversation.messages),
        chatPreviewMarkdown: previewMarkdown,
        text: previewMarkdown || sourceNode.metadata?.text || "",
      },
    };

    return Response.json({
      sourceNode: sourceNodeNext,
      conversation: updatedConversation,
    });
  } catch (error) {
    const normalized = normalizeChatError(error);
    console.error("[canvas/chat-run POST]", normalized.code, normalized.detail || normalized.message);
    return Response.json(
      generationErrorJson(normalized.message, normalized.code, normalized.status),
      { status: normalized.status },
    );
  }
}
