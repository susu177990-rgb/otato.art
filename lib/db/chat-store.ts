import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChatMode,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ConversationAttachmentEntry,
} from "@/lib/chat/types";
import {
  applyProjectScope,
  normalizePageLimit,
  type ProjectPage,
  type ProjectPageOptions,
  type ProjectScope,
} from "@/lib/db/project-scope";

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
  project_id?: string | null;
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
    projectId: row.project_id ?? null,
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
  scope: ProjectScope = {},
): Promise<ChatConversationSummary[]> {
  const query = applyProjectScope(
    supabase
    .from("chat_conversations")
      .select("id, project_id, title, updated_at")
      .eq("user_id", userId),
    scope,
  );
  const { data, error } = await query
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function listChatConversationsPage(
  supabase: SupabaseClient,
  userId: string,
  options: ProjectPageOptions = {},
): Promise<ProjectPage<ChatConversationSummary>> {
  const limit = normalizePageLimit(options.limit, 24);
  let query = applyProjectScope(
    supabase
      .from("chat_conversations")
      .select("id, project_id, title, updated_at")
      .eq("user_id", userId),
    options,
  );
  if (options.cursor) {
    query = query.or(
      `updated_at.lt.${options.cursor.timestamp},and(updated_at.eq.${options.cursor.timestamp},id.lt.${options.cursor.id})`,
    );
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;

  const rows = data ?? [];
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => ({
      id: row.id,
      projectId: row.project_id ?? null,
      title: row.title,
      updatedAt: new Date(row.updated_at).getTime(),
    })),
    nextCursor: rows.length > limit && last
      ? { timestamp: last.updated_at, id: last.id }
      : null,
  };
}

export async function getChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  scope: ProjectScope = {},
): Promise<ChatConversation | null> {
  const query = applyProjectScope(
    supabase
    .from("chat_conversations")
    .select(
        "id, project_id, title, messages, attachments, chat_mode, selected_skill_pack_id, selected_chat_preset_id, preferred_llm_model_id, enabled_skill_pack_ids, updated_at",
    )
    .eq("user_id", userId)
      .eq("id", id),
    scope,
  );
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToConversation(data);
}

export async function createChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  title = "新对话",
  scope: ProjectScope = {},
): Promise<ChatConversation> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("chat_conversations").insert({
    id,
    user_id: userId,
    project_id: scope.projectId ?? null,
    title,
    messages: [],
    attachments: [],
    chat_mode: "prompt",
    updated_at: now,
  });
  if (error) throw error;
  return {
    id,
    projectId: scope.projectId ?? null,
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
  scope: ProjectScope = {},
): Promise<void> {
  const projectId = scope.projectId !== undefined ? scope.projectId : conv.projectId;
  const query = applyProjectScope(
    supabase
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
      .eq("id", conv.id),
    projectId === undefined ? {} : { projectId },
  );
  const { error } = await query;

  if (error) throw error;
}

export async function deleteChatConversation(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  scope: ProjectScope = {},
): Promise<void> {
  const query = applyProjectScope(
    supabase.from("chat_conversations").delete().eq("user_id", userId).eq("id", id),
    scope,
  );
  const { error } = await query;
  if (error) throw error;
}
