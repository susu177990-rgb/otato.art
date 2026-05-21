/** 首条用户消息生成会话标题：避免把 /grid 等 Slash 指令当成标题 */
export function deriveConversationTitleFromFirstMessage(text: string): string | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;

  const firstLine = (trimmed.split("\n")[0] ?? "").trim();
  const firstToken = (firstLine.split(/\s+/)[0] ?? "").trim();
  if (/^\/[a-zA-Z][\w-]*$/.test(firstToken)) return "新对话";

  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine;
}
