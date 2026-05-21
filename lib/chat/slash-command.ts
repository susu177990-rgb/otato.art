import type { ChatMessage } from "@/lib/chat/types";

/** 这些 Slash 指令必须走真实 generate_image，不能只出文字 */
const SLASH_IMAGE_COMMANDS = new Set(["/grid", "/grid-all"]);

export function extractLeadingSlashCommand(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;

    const headText = m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!headText) continue;

    const firstLine = headText.split("\n")[0]?.trim() ?? "";
    const firstToken = firstLine.split(/\s+/)[0] ?? "";
    if (!firstToken.startsWith("/")) continue;

    return firstToken.replace(/\/{2,}/g, "/").toLowerCase();
  }
  return null;
}

export function slashCommandRequiresGenerateImage(cmd: string | null): boolean {
  if (!cmd) return false;
  return SLASH_IMAGE_COMMANDS.has(cmd);
}
