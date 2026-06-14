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
import { createChatConversation, getChatConversation, saveChatConversation } from "@/lib/db/chat-store";
import { listSitePromptPresetsByKind } from "@/lib/db/prompt-preset-store";
import { listSiteSkillPacks } from "@/lib/db/site-skill-store";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImageModelId } from "@/lib/image-workspace";
import { projectIdFromRequest, type ProjectScope } from "@/lib/db/project-scope";

export const maxDuration = 300;

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
      return Response.json({ error: "请先登录后再运行画布对话节点" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CanvasChatRunBody;
    const boardId = typeof body.boardId === "string" ? body.boardId.trim() : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    const projectId = projectIdFromRequest(req, body.projectId);
    const scope = projectId === undefined ? {} : { projectId };
    const userMessage = parseUserMessage(body.userMessage);
    if (!boardId || !nodeId || !userMessage || userMessage.parts.length === 0) {
      return Response.json({ error: "缺少 boardId、nodeId 或有效 userMessage" }, { status: 400 });
    }

    const board = await getCanvasBoard(supabase, boardId, scope);
    if (!board) {
      return Response.json({ error: "画布不存在" }, { status: 404 });
    }
    const sourceNode = mustBeTextNode(board.nodes.find((node) => node.id === nodeId));

    const conv = await resolveConversation({ supabase, userId: user.id, sourceNode, userMessage, scope });
    const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
    const preferredLlmModelId = typeof body.preferredLlmModelId === "string" && body.preferredLlmModelId.trim()
      ? body.preferredLlmModelId.trim()
      : conv.preferredLlmModelId || null;
    const chatApiConfig = llmToChatApiConfig(snapshot.llm, preferredLlmModelId);
    const skillPacks = await listSiteSkillPacks(supabase);
    const chatPromptPresets = await listSitePromptPresetsByKind(supabase, "chat");

    const skillBlocks = conv.chatMode === "skill" ? getSkillMarkdownBlocks(conv.selectedSkillPackId, skillPacks) : [];
    const chatPromptPresetBlock =
      conv.chatMode === "prompt" ? getChatPromptPresetBlock(conv.selectedChatPresetId, chatPromptPresets) : null;
    const preferredImageModelId = effectiveAgentImageModelId(body.preferredImageModelId, conv.preferredImageModelId);
    const messagesForApi: ChatMessage[] = [...conv.messages, userMessage];

    const newMessages = await runAgentChatTurn({
      chatApiConfig,
      imageWorkspace: snapshot.imageWorkspace,
      defaultImageModelId: preferredImageModelId,
      conversationMessages: messagesForApi,
      skillMarkdownBlocks: skillBlocks,
      chatPromptPresetBlock,
      conversationAttachments: conv.attachments ?? [],
      supabase,
      userId: user.id,
    });

    const updatedConversation: ChatConversation = {
      ...conv,
      messages: [...messagesForApi, ...newMessages],
      preferredImageModelId,
      preferredLlmModelId,
      updatedAt: Date.now(),
    };

    if (conv.messages.length === 0) {
      const title = deriveConversationTitleFromFirstMessage(textFromMessage(userMessage));
      if (title) updatedConversation.title = title;
    }

    await saveChatConversation(supabase, user.id, updatedConversation, scope);
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
    const message = error instanceof Error ? error.message : "无线画布对话失败";
    console.error("[canvas/chat-run POST]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
