import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChatMode,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ConversationAttachmentEntry,
} from "@/lib/chat/types";

function normalizeChatMode(mode: string | null | undefined): ChatMode {
  return mode === "skill" ? "skill" : "prompt";
}

function normalizeSelectedSkillPackId(
  selectedId: string | null | undefined,
  legacyIds: string[] | null | undefined,
): string | null {
  if (selectedId?.trim()) return selectedId.trim();
  const legacy = legacyIds?.[0]?.trim();
  return legacy || null;
}

function normalizeSelectedChatPresetId(selectedId: string | null | undefined): string | null {
  return selectedId?.trim() || null;
}

function rowToConversation(row: {
  id: string;
  title: string;
  messages: unknown;
  attachments: unknown;
  chat_mode?: string | null;
  selected_skill_pack_id?: string | null;
  selected_chat_preset_id?: string | null;
  preferred_llm_model_id?: string | null;
  enabled_skill_pack_ids: string[] | null;
  updated_at: string;
}): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime(),
    messages: (Array.isArray(row.messages) ? row.messages : []) as ChatMessage[],
    attachments: (Array.isArray(row.attachments) ? row.attachments : []) as ConversationAttachmentEntry[],
    chatMode: normalizeChatMode(row.chat_mode),
    selectedSkillPackId: normalizeSelectedSkillPackId(row.selected_skill_pack_id, row.enabled_skill_pack_ids),
    selectedChatPresetId: normalizeSelectedChatPresetId(row.selected_chat_preset_id),
    preferredLlmModelId: row.preferred_llm_model_id?.trim() || null,
  };
}

export async function listChatConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChatConversationSummary[]> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function getChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select(
      "id, title, messages, attachments, chat_mode, selected_skill_pack_id, selected_chat_preset_id, preferred_llm_model_id, enabled_skill_pack_ids, updated_at",
    )
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToConversation(data);
}

export async function createChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  title = "新对话",
): Promise<ChatConversation> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("chat_conversations").insert({
    id,
    user_id: userId,
    title,
    messages: [],
    attachments: [],
    chat_mode: "prompt",
    updated_at: now,
  });
  if (error) throw error;
  return {
    id,
    title,
    updatedAt: Date.now(),
    messages: [],
    chatMode: "prompt",
    selectedSkillPackId: null,
    selectedChatPresetId: null,
    preferredLlmModelId: null,
    attachments: [],
  };
}

export async function saveChatConversation(
  supabase: SupabaseClient,
  userId: string,
  conv: ChatConversation,
): Promise<void> {
  const { error } = await supabase
    .from("chat_conversations")
    .update({
      title: conv.title,
      messages: conv.messages,
      attachments: conv.attachments ?? [],
      chat_mode: conv.chatMode === "skill" ? "skill" : "prompt",
      selected_skill_pack_id: conv.selectedSkillPackId?.trim() || null,
      selected_chat_preset_id: conv.selectedChatPresetId?.trim() || null,
      preferred_llm_model_id: conv.preferredLlmModelId?.trim() || null,
      enabled_skill_pack_ids: conv.selectedSkillPackId?.trim() ? [conv.selectedSkillPackId.trim()] : null,
      updated_at: new Date(conv.updatedAt).toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", conv.id);

  if (error) throw error;
}

export async function deleteChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("chat_conversations").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
