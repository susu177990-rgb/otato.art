import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChatMode,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ConversationAttachmentEntry,
} from "@/lib/chat/types";
import type { ImageModelId } from "@/lib/image-workspace";
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

type ChatConversationRow = {
  id: string;
  project_id?: string | null;
  title: string;
  messages: unknown;
  attachments: unknown;
  chat_mode?: string | null;
  selected_skill_pack_id?: string | null;
  selected_chat_preset_id?: string | null;
  preferred_llm_model_id?: string | null;
  preferred_image_model_id?: string | null;
  revision?: number | null;
  enabled_skill_pack_ids: string[] | null;
  updated_at: string;
};

export function compactChatMessagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "attachment" || !part.attachment.registryId) return part;
      return {
        type: "attachment" as const,
        attachment: { ...part.attachment, dataUrl: "" },
      };
    }),
  }));
}

export function hydrateChatMessagesFromAttachments(
  messages: ChatMessage[],
  attachments: ConversationAttachmentEntry[],
): ChatMessage[] {
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "attachment" || part.attachment.dataUrl || !part.attachment.registryId) return part;
      const stored = byId.get(part.attachment.registryId);
      return stored
        ? { type: "attachment" as const, attachment: { ...part.attachment, dataUrl: stored.dataUrl } }
        : part;
    }),
  }));
}

function rowToConversation(row: ChatConversationRow): ChatConversation {
  const attachments = (Array.isArray(row.attachments) ? row.attachments : []) as ConversationAttachmentEntry[];
  const storedMessages = (Array.isArray(row.messages) ? row.messages : []) as ChatMessage[];
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime(),
    messages: hydrateChatMessagesFromAttachments(storedMessages, attachments),
    attachments,
    chatMode: normalizeChatMode(row.chat_mode),
    selectedSkillPackId: normalizeSelectedSkillPackId(row.selected_skill_pack_id, row.enabled_skill_pack_ids),
    selectedChatPresetId: normalizeSelectedChatPresetId(row.selected_chat_preset_id),
    preferredLlmModelId: row.preferred_llm_model_id?.trim() || null,
    preferredImageModelId: row.preferred_image_model_id?.trim() as ImageModelId | undefined,
    revision: typeof row.revision === "number" ? row.revision : 0,
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
  const selectConversation = (columns: string) => applyProjectScope(
    supabase
      .from("chat_conversations")
      .select(columns)
      .eq("user_id", userId)
      .eq("id", id),
    scope,
  ).maybeSingle();

  let { data, error } = await selectConversation(
    "id, project_id, title, messages, attachments, chat_mode, selected_skill_pack_id, selected_chat_preset_id, preferred_llm_model_id, preferred_image_model_id, enabled_skill_pack_ids, revision, updated_at",
  );
  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ data, error } = await selectConversation(
      "id, project_id, title, messages, attachments, chat_mode, selected_skill_pack_id, selected_chat_preset_id, preferred_llm_model_id, enabled_skill_pack_ids, updated_at",
    ));
  }

  if (error) throw error;
  if (!data) return null;
  return rowToConversation(data as unknown as ChatConversationRow);
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
    preferredImageModelId: undefined,
    revision: 0,
    attachments: [],
  };
}

export type ChatConversationMetadataPatch = Pick<
  ChatConversation,
  "title" | "chatMode" | "selectedSkillPackId" | "selectedChatPresetId" | "preferredLlmModelId" | "preferredImageModelId"
>;

export async function updateChatConversationMetadata(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  patch: Partial<ChatConversationMetadataPatch>,
  scope: ProjectScope = {},
): Promise<void> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) values.title = patch.title.trim() || "新对话";
  if (patch.chatMode !== undefined) values.chat_mode = patch.chatMode === "skill" ? "skill" : "prompt";
  if (patch.selectedSkillPackId !== undefined) {
    values.selected_skill_pack_id = patch.selectedSkillPackId?.trim() || null;
    values.enabled_skill_pack_ids = patch.selectedSkillPackId?.trim() ? [patch.selectedSkillPackId.trim()] : null;
  }
  if (patch.selectedChatPresetId !== undefined) {
    values.selected_chat_preset_id = patch.selectedChatPresetId?.trim() || null;
  }
  if (patch.preferredLlmModelId !== undefined) {
    values.preferred_llm_model_id = patch.preferredLlmModelId?.trim() || null;
  }
  if (patch.preferredImageModelId !== undefined) {
    values.preferred_image_model_id = patch.preferredImageModelId?.trim() || null;
  }

  const update = () => applyProjectScope(
    supabase
      .from("chat_conversations")
      .update(values)
      .eq("user_id", userId)
      .eq("id", conversationId),
    scope,
  );
  let { error } = await update();
  if ((error?.code === "42703" || error?.code === "PGRST204") && "preferred_image_model_id" in values) {
    delete values.preferred_image_model_id;
    ({ error } = await update());
  }

  if (error) throw error;
}

export async function appendChatConversationTurn(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    userMessage: ChatMessage;
    responseMessages: ChatMessage[];
    newAttachments?: ConversationAttachmentEntry[];
    title?: string | null;
    preferredLlmModelId?: string | null;
    preferredImageModelId?: ImageModelId;
  },
): Promise<void> {
  const { data, error } = await supabase.rpc("append_chat_conversation_turn", {
    p_conversation_id: input.conversationId,
    p_user_message: compactChatMessagesForStorage([input.userMessage])[0],
    p_response_messages: compactChatMessagesForStorage(input.responseMessages),
    p_new_attachments: input.newAttachments ?? [],
    p_title: input.title ?? null,
    p_preferred_llm_model_id: input.preferredLlmModelId ?? null,
    p_preferred_image_model_id: input.preferredImageModelId ?? null,
  });
  if (error?.code === "PGRST202" || error?.code === "42883") {
    const { data: existing, error: readError } = await supabase
      .from("chat_conversations")
      .select("messages, attachments")
      .eq("id", input.conversationId)
      .single();
    if (readError || !existing) throw readError ?? error;
    const existingMessages = Array.isArray(existing.messages) ? existing.messages as ChatMessage[] : [];
    const alreadyAppended = existingMessages.some((message) => message.id === input.userMessage.id);
    if (alreadyAppended) return;
    const { error: fallbackError } = await supabase
      .from("chat_conversations")
      .update({
        messages: [
          ...existingMessages,
          compactChatMessagesForStorage([input.userMessage])[0],
          ...compactChatMessagesForStorage(input.responseMessages),
        ],
        attachments: [
          ...(Array.isArray(existing.attachments) ? existing.attachments : []),
          ...(input.newAttachments ?? []),
        ],
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.preferredLlmModelId?.trim() ? { preferred_llm_model_id: input.preferredLlmModelId.trim() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.conversationId);
    if (fallbackError) throw fallbackError;
    return;
  }
  if (error) throw error;
  if (data !== true) throw new Error("chat_conversation_append_failed");
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
