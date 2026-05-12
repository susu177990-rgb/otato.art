"use client";

import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS_GFM } from "@/lib/markdown-remark-plugins";
import type { Message } from "@/lib/types";
import { stripThinkingForDisplay } from "@/lib/strip-thinking";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : stripThinkingForDisplay(message.content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-zinc-800 text-zinc-200 border border-zinc-700"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayContent}</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <div className="prose prose-xs prose-invert max-w-none prose-p:my-0.5 prose-headings:my-1 prose-headings:text-xs prose-li:my-0 prose-table:text-[11px] prose-th:px-2 prose-td:px-2 prose-pre:bg-zinc-900 prose-pre:text-[10px] prose-pre:border prose-pre:border-zinc-700">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS_GFM}>{displayContent}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
