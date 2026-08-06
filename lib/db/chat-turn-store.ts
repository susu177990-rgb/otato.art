import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage } from "@/lib/chat/types";

export type ChatTurnRequestStatus = "pending" | "finalizing" | "completed" | "failed";

export type ChatTurnRequest = {
  id: string;
  conversationId: string;
  userMessageId: string;
  status: ChatTurnRequestStatus;
  resultMessages: ChatMessage[] | null;
  error: string | null;
};

type ChatTurnRequestRow = {
  id: string;
  conversation_id: string;
  user_message_id: string;
  status: ChatTurnRequestStatus;
  result_messages: unknown;
  error: string | null;
};

function rowToTurn(row: ChatTurnRequestRow): ChatTurnRequest {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userMessageId: row.user_message_id,
    status: row.status,
    resultMessages: Array.isArray(row.result_messages) ? row.result_messages as ChatMessage[] : null,
    error: row.error,
  };
}

function isTurnTableUnavailable(code: string | undefined): boolean {
  return code === "PGRST205" || code === "42P01";
}

export async function claimChatTurn(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  userMessageId: string,
): Promise<{ claimed: boolean; turn: ChatTurnRequest }> {
  const { data, error } = await supabase
    .from("chat_turn_requests")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      user_message_id: userMessageId,
      status: "pending",
    })
    .select("id, conversation_id, user_message_id, status, result_messages, error")
    .single();

  if (!error && data) return { claimed: true, turn: rowToTurn(data as ChatTurnRequestRow) };
  if (isTurnTableUnavailable(error?.code)) {
    return {
      claimed: true,
      turn: {
        id: `legacy:${conversationId}:${userMessageId}`,
        conversationId,
        userMessageId,
        status: "pending",
        resultMessages: null,
        error: null,
      },
    };
  }
  if (error?.code !== "23505") throw error;

  const { data: existing, error: readError } = await supabase
    .from("chat_turn_requests")
    .select("id, conversation_id, user_message_id, status, result_messages, error")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .eq("user_message_id", userMessageId)
    .single();
  if (readError || !existing) throw readError ?? new Error("chat_turn_claim_failed");
  return { claimed: false, turn: rowToTurn(existing as ChatTurnRequestRow) };
}

export async function markChatTurnFinalizing(
  supabase: SupabaseClient,
  turnId: string,
  resultMessages: ChatMessage[],
): Promise<void> {
  if (turnId.startsWith("legacy:")) return;
  const { error } = await supabase
    .from("chat_turn_requests")
    .update({
      status: "finalizing",
      result_messages: resultMessages,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", turnId);
  if (error) throw error;
}

export async function markChatTurnCompleted(supabase: SupabaseClient, turnId: string): Promise<void> {
  if (turnId.startsWith("legacy:")) return;
  const { error } = await supabase
    .from("chat_turn_requests")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", turnId);
  if (error) throw error;
}

export async function markChatTurnFailed(
  supabase: SupabaseClient,
  turnId: string,
  errorMessage: string,
): Promise<void> {
  if (turnId.startsWith("legacy:")) return;
  const { error } = await supabase
    .from("chat_turn_requests")
    .update({
      status: "failed",
      error: errorMessage.slice(0, 1_000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", turnId)
    .eq("status", "pending");
  if (error) throw error;
}
