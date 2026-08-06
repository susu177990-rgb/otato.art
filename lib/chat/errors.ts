export class ChatServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ChatServiceError";
  }
}

export function normalizeChatError(error: unknown): ChatServiceError {
  if (error instanceof ChatServiceError) return error;
  const message = error instanceof Error ? error.message : String(error || "chat_failed");
  return new ChatServiceError("CHAT_FAILED", 500, "对话请求失败，请稍后重试。", message);
}
