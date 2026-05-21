import { NextResponse } from "next/server";
import { effectiveAgentImageModelId } from "@/lib/chat/image-model-catalog";
import { llmToChatApiConfig } from "@/lib/chat-settings";
import type { ImageModelId } from "@/lib/image-workspace";
import { runAgentChatTurn } from "@/lib/chat/agent";
import { deriveConversationTitleFromFirstMessage } from "@/lib/chat/conversation-title";
import type { ChatAttachment, ChatMessage, ChatMessagePart, SkillPackRecord } from "@/lib/chat/types";
import { getChatConversation, saveChatConversation } from "@/lib/db/chat-store";
import { listSiteSkillPacks } from "@/lib/db/site-skill-store";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 300;

function getSkillMarkdownBlocks(
  enabledIds: string[] | undefined,
  allPacks: SkillPackRecord[],
): string[] {
  const packId = enabledIds?.[0];
  if (!packId) return [];
  const pack = allPacks.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.skills.map(
    (s) => `### Skill「${s.name}」（包: ${pack.title}）\n\n${s.markdown}`,
  );
}

type AgentBody = {
  conversationId: string;
  userMessage: ChatMessage;
  preferredImageModelId?: ImageModelId;
};

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json()) as AgentBody;
    if (!body.conversationId || !body.userMessage) {
      return NextResponse.json({ error: "conversationId 与 userMessage 必填" }, { status: 400 });
    }

    const conv = await getChatConversation(supabase, user.id, body.conversationId);
    if (!conv) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

    const snapshot = await getWorkspaceSnapshot(supabase);
    const chatApiConfig = llmToChatApiConfig(snapshot.llm);
    const skillPacks = await listSiteSkillPacks(supabase);
    const skillBlocks = getSkillMarkdownBlocks(conv.enabledSkillPackIds, skillPacks);

    const registryEntries = body.userMessage.parts
      .filter((p): p is Extract<ChatMessagePart, { type: "attachment" }> => p.type === "attachment")
      .map((p) => {
        const att: ChatAttachment = p.attachment;
        return {
          id: att.registryId || `att-${Date.now()}`,
          messageId: body.userMessage.id,
          name: att.name,
          mime: att.mime,
          kind: att.kind,
          createdAt: Date.now(),
          dataUrl: att.dataUrl,
        };
      });

    const messagesForApi: ChatMessage[] = [...conv.messages, body.userMessage];
    const mergedAttachments = [...(conv.attachments || []), ...registryEntries];

    const preferredImageModelId = effectiveAgentImageModelId(
      body.preferredImageModelId,
      conv.preferredImageModelId,
    );

    const newMsgs = await runAgentChatTurn({
      chatApiConfig,
      imageWorkspace: snapshot.imageWorkspace,
      defaultImageModelId: preferredImageModelId,
      conversationMessages: messagesForApi,
      skillMarkdownBlocks: skillBlocks,
      conversationAttachments: mergedAttachments,
      supabase,
      userId: user.id,
    });

    const updated: typeof conv = {
      ...conv,
      messages: [...messagesForApi, ...newMsgs],
      attachments: mergedAttachments,
      preferredImageModelId,
      updatedAt: Date.now(),
    };

    if (conv.messages.length === 0) {
      const text = body.userMessage.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim();
      const title = deriveConversationTitleFromFirstMessage(text);
      if (title) updated.title = title;
    }

    await saveChatConversation(supabase, user.id, updated);

    return NextResponse.json({
      conversation: updated,
      newMessages: newMsgs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "agent_failed";
    console.error("[chat/agent POST]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
