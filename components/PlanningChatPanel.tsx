"use client";

import { useState, useRef, useEffect } from "react";
import type { Message, Settings } from "@/lib/types";
import { stripThinkingForDisplay } from "@/lib/strip-thinking";
import MessageBubble from "./MessageBubble";
import { isImeCompositionKeyEvent } from "@/lib/ime-enter";
import { useMessagesScrollEnd } from "@/hooks/useMessagesScrollEnd";

interface Props {
  settings: Settings;
  messages: Message[];
  planningBootstrap: string;
  onOpenSettings: () => void;
  onMessagesChange: (messages: Message[]) => void;
  onAssistantDone: (fullReply: string, messagesSnapshot: Message[]) => void;
  /** 默认 /api/planning-chat；改编讨论用 /api/adaptation-discuss */
  chatEndpoint?: string;
  extraBody?: Record<string, unknown>;
  headerTitle?: string;
  emptyHint?: string;
  inputPlaceholder?: string;
  /**
   * default：可随页面增高；fixedScroll：固定视口高度，消息区内部滚动（改编讨论等）
   */
  layout?: "default" | "fixedScroll";
}

export default function PlanningChatPanel({
  settings,
  messages,
  planningBootstrap,
  onOpenSettings,
  onMessagesChange,
  onAssistantDone,
  chatEndpoint = "/api/planning-chat",
  extraBody,
  headerTitle = "策划对齐（规划师模式，不产出 STAGE 模板正文）",
  emptyHint = "描述你的顾虑或目标，与规划师对齐后再进入编剧室。",
  inputPlaceholder = "输入追问或补充…",
  layout = "default",
}: Props) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesScrollRef = useMessagesScrollEnd(messages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    onMessagesChange(newMessages);
    setInput("");
    setIsLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    onMessagesChange([...newMessages, assistantMsg]);

    try {
      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          settings,
          planningBootstrap,
          ...extraBody,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "未知错误" }));
        const errMessages = [
          ...newMessages,
          { role: "assistant" as const, content: `**错误**: ${err.error || res.statusText}` },
        ];
        onMessagesChange(errMessages);
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              const visible = stripThinkingForDisplay(accumulated);
              onMessagesChange([
                ...newMessages,
                { role: "assistant", content: visible },
              ]);
            }
          } catch {
            // skip
          }
        }
      }

      const replyText = stripThinkingForDisplay(accumulated) || "(模型未返回任何内容)";
      const finalMessages: Message[] = [
        ...newMessages,
        { role: "assistant", content: replyText },
      ];
      onMessagesChange(finalMessages);

      onAssistantDone(replyText, finalMessages);
    } catch (err) {
      const errContent = `**请求失败**: ${err instanceof Error ? err.message : String(err)}`;
      onMessagesChange([
        ...newMessages,
        { role: "assistant" as const, content: errContent },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isImeCompositionKeyEvent(e)) return;
    e.preventDefault();
    void handleSend();
  }

  const outerClass =
    layout === "fixedScroll"
      ? "flex h-[min(560px,64vh)] max-h-[64vh] w-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/40"
      : "flex min-h-[320px] flex-1 flex-col rounded-lg border border-zinc-700 bg-zinc-900/40";

  return (
    <div className={outerClass}>
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">{headerTitle}</div>
      <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-zinc-600">{emptyHint}</p>
        )}
        <div className="space-y-2">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-zinc-800 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={inputPlaceholder}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
