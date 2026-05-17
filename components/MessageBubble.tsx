"use client";

import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS_GFM } from "@/lib/markdown-remark-plugins";
import type { Message } from "@/lib/types";
import { stripThinkingForDisplay } from "@/lib/strip-thinking";
import shellStyles from "@/app/shared/shell.module.css";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : stripThinkingForDisplay(message.content);

  return (
    <div
      className={[
        shellStyles.bubbleRow,
        isUser ? shellStyles.bubbleRowUser : shellStyles.bubbleRowAssistant,
      ].join(" ")}
    >
      <div className={isUser ? shellStyles.bubbleUser : shellStyles.bubbleAssistant}>
        {isUser ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{displayContent}</p>
        ) : (
          <div className="prose prose-xs prose-invert max-w-none prose-p:my-0.5 prose-headings:my-1 prose-headings:text-xs prose-li:my-0 prose-table:text-[11px] prose-th:px-2 prose-td:px-2 prose-pre:bg-zinc-900 prose-pre:text-[10px] prose-pre:border prose-pre:border-zinc-700">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS_GFM}>{displayContent}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
