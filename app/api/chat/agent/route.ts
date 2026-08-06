import { NextResponse } from "next/server";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import { effectiveAgentImageModelId } from "@/lib/chat/image-model-catalog";
import { llmToChatApiConfig } from "@/lib/chat-settings";
import type { ImageModelId } from "@/lib/image-workspace";
import { runAgentChatTurn } from "@/lib/chat/agent";
import { normalizeChatError, ChatServiceError } from "@/lib/chat/errors";
import { parseChatUserMessage } from "@/lib/chat/request-validation";
import { deriveConversationTitleFromFirstMessage } from "@/lib/chat/conversation-title";
import type { ChatAttachment, ChatMessagePart, SkillPackRecord } from "@/lib/chat/types";
import { appendChatConversationTurn, getChatConversation } from "@/lib/db/chat-store";
import {
  claimChatTurn,
  markChatTurnCompleted,
  markChatTurnFailed,
  markChatTurnFinalizing,
} from "@/lib/db/chat-turn-store";
import { listSitePromptPresetsByKind } from "@/lib/db/prompt-preset-store";
import { listSiteSkillPacks } from "@/lib/db/site-skill-store";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { projectIdFromRequest } from "@/lib/db/project-scope";

export const maxDuration = 300;

function getSkillMarkdownBlocks(
  selectedSkillPackId: string | null | undefined,
  allPacks: SkillPackRecord[],
): string[] {
  const packId = selectedSkillPackId;
  if (!packId) return [];
  const pack = allPacks.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.skills.map(
    (s) => `### Skill「${s.name}」（包: ${pack.title}）\n\n${s.markdown}`,
  );
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

type AgentBody = {
  conversationId: string;
  userMessage: unknown;
  preferredImageModelId?: ImageModelId;
  preferredLlmModelId?: string;
  projectId?: string | null;
};

export async function POST(req: Request) {
  let claimedTurn: { id: string } | null = null;
  let ownsClaim = false;
  let resultPersisted = false;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as AgentBody | null;
    if (!body?.conversationId || !body.userMessage) {
      return NextResponse.json({ error: "conversationId 与 userMessage 必填" }, { status: 400 });
    }
    const userMessage = parseChatUserMessage(body.userMessage);

    const projectId = projectIdFromRequest(req, body.projectId);
    const scope = projectId === undefined ? {} : { projectId };
    const conv = await getChatConversation(supabase, user.id, body.conversationId, scope);
    if (!conv) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

    const claim = await claimChatTurn(supabase, user.id, conv.id, userMessage.id);
    claimedTurn = claim.turn;
    ownsClaim = claim.claimed;

    const registryEntries = userMessage.parts
      .filter((part): part is Extract<ChatMessagePart, { type: "attachment" }> => part.type === "attachment")
      .map((part) => {
        const attachment: ChatAttachment = part.attachment;
        return {
          id: attachment.registryId!,
          messageId: userMessage.id,
          name: attachment.name,
          mime: attachment.mime,
          kind: attachment.kind,
          createdAt: Date.now(),
          dataUrl: attachment.dataUrl,
        };
      });

    const preferredLlmModelId = body.preferredLlmModelId?.trim() || conv.preferredLlmModelId || null;
    const preferredImageModelId = effectiveAgentImageModelId(
      body.preferredImageModelId,
      conv.preferredImageModelId,
    );
    const title = conv.messages.length === 0
      ? deriveConversationTitleFromFirstMessage(
        userMessage.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("")
          .trim(),
      )
      : null;

    const finalize = async (resultMessages: NonNullable<typeof claim.turn.resultMessages>) => {
      await appendChatConversationTurn(supabase, {
        conversationId: conv.id,
        userMessage,
        responseMessages: resultMessages,
        newAttachments: registryEntries,
        title,
        preferredLlmModelId,
        preferredImageModelId,
      });
      await markChatTurnCompleted(supabase, claim.turn.id);
      const conversation = await getChatConversation(supabase, user.id, conv.id, scope);
      if (!conversation) throw new Error("conversation_missing_after_append");
      return NextResponse.json({ conversation, newMessages: resultMessages });
    };

    if (!claim.claimed) {
      if ((claim.turn.status === "finalizing" || claim.turn.status === "completed") && claim.turn.resultMessages) {
        return await finalize(claim.turn.resultMessages);
      }
      if (claim.turn.status === "pending") {
        throw new ChatServiceError("CHAT_TURN_RUNNING", 409, "这条消息正在生成中，请勿重复发送。");
      }
      throw new ChatServiceError("CHAT_TURN_FAILED", 409, "这条消息已失败，请重新发送一条新消息。");
    }

    const snapshot = await getWorkspaceSnapshot(supabase);
    const chatApiConfig = llmToChatApiConfig(snapshot.llm, preferredLlmModelId);
    let skillBlocks: string[] = [];
    let chatPromptPresetBlock: string | null = null;
    if (conv.chatMode === "skill" && conv.selectedSkillPackId) {
      skillBlocks = getSkillMarkdownBlocks(conv.selectedSkillPackId, await listSiteSkillPacks(supabase));
    } else if (conv.chatMode === "prompt" && conv.selectedChatPresetId) {
      chatPromptPresetBlock = getChatPromptPresetBlock(
        conv.selectedChatPresetId,
        await listSitePromptPresetsByKind(supabase, "chat"),
      );
    }

    const messagesForApi = [...conv.messages, userMessage];
    const mergedAttachments = [...(conv.attachments || []), ...registryEntries];

    const newMsgs = await runAgentChatTurn({
      chatApiConfig,
      imageWorkspace: snapshot.imageWorkspace,
      defaultImageModelId: preferredImageModelId,
      conversationMessages: messagesForApi,
      skillMarkdownBlocks: skillBlocks,
      chatPromptPresetBlock,
      conversationAttachments: mergedAttachments,
      supabase,
      userId: user.id,
      projectId,
    });

    await markChatTurnFinalizing(supabase, claim.turn.id, newMsgs);
    resultPersisted = true;
    return await finalize(newMsgs);
  } catch (e) {
    const error = normalizeChatError(e);
    if (claimedTurn && ownsClaim && !resultPersisted) {
      try {
        const supabase = await createSupabaseServerClient();
        await markChatTurnFailed(supabase, claimedTurn.id, error.detail || error.message);
      } catch (markError) {
        console.error("[chat/agent mark failed]", markError);
      }
    }
    console.error("[chat/agent POST]", error.code, error.detail || error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
}
