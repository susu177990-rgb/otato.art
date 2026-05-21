import type { ImageModelId } from "@/lib/image-workspace";
import type { ChatConversation, ChatConversationSummary, ChatMessage } from "@/lib/chat/types";

async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error?.trim() || fallback;
}

export async function fetchChatConversations(): Promise<ChatConversationSummary[]> {
  const res = await fetch("/api/chat/conversations", { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "无法加载会话列表"));
  const data = (await res.json()) as { conversations: ChatConversationSummary[] };
  return data.conversations;
}

export async function createChatConversation(title?: string): Promise<ChatConversation> {
  const res = await fetch("/api/chat/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法创建会话"));
  const data = (await res.json()) as { conversation: ChatConversation };
  return data.conversation;
}

export async function fetchChatConversation(id: string): Promise<ChatConversation> {
  const res = await fetch(`/api/chat/conversations/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "无法加载会话"));
  const data = (await res.json()) as { conversation: ChatConversation };
  return data.conversation;
}

export async function saveChatConversation(conv: ChatConversation): Promise<ChatConversation> {
  const res = await fetch(`/api/chat/conversations/${conv.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conv),
  });
  if (!res.ok) throw new Error("无法保存会话");
  const data = (await res.json()) as { conversation: ChatConversation };
  return data.conversation;
}

export async function deleteChatConversationApi(id: string): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("无法删除会话");
}

const CHAT_AGENT_TIMEOUT_MS = 300_000;

export async function sendChatAgentTurn(
  conversationId: string,
  userMessage: ChatMessage,
  preferredImageModelId?: ImageModelId,
): Promise<ChatConversation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_AGENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/chat/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, userMessage, preferredImageModelId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "发送失败");
    }
    const data = (await res.json()) as { conversation: ChatConversation };
    return data.conversation;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("请求超时（超过 5 分钟）。若挂载了 Skill 生图或多轮工具，请稍后重试或换更短消息。");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
