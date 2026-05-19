"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { Message, Settings } from "@/lib/types";
import { stripThinkingForDisplay } from "@/lib/strip-thinking";
import { isImeCompositionKeyEvent } from "@/lib/ime-enter";
import MessageBubble from "./MessageBubble";
import { useMessagesScrollEnd } from "@/hooks/useMessagesScrollEnd";
import { syncComposerTextareaHeight } from "@/lib/composer-autosize";
import shellStyles from "@/app/shared/shell.module.css";
import { BRAND_NAME } from "@/lib/branding";
import styles from "./chat-window.module.css";

export type ChatWindowHandle = {
  /** 以当前对话为上下文代发一条 user 并请求助手回复；返回助手回复文本（空字符串表示失败） */
  sendUserMessage: (text: string) => Promise<string>;
};

interface Props {
  settings: Settings;
  messages: Message[];
  projectId: string | null;
  /** 工程侧状态摘要，注入系统提示 */
  projectContext?: string;
  onOpenSettings: () => void;
  onMessagesChange: (messages: Message[]) => void;
  onAssistantDone: (fullReply: string, messagesSnapshot: Message[]) => void;
  /** 非空时：在对话为空且满足内部校验时自动代发一条 user 消息（仅一次） */
  autoKickoffUserMessage?: string | null;
  /** 流式请求中状态，供全流程条禁用按钮 */
  onLoadingChange?: (loading: boolean) => void;
}

const ChatWindow = forwardRef<ChatWindowHandle, Props>(function ChatWindow(
  {
    settings,
    messages,
    projectId,
    projectContext,
    onOpenSettings,
    onMessagesChange,
    onAssistantDone,
    autoKickoffUserMessage,
    onLoadingChange,
  },
  ref
) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesScrollRef = useMessagesScrollEnd(messages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoKickoffOnceRef = useRef(false);
  const messagesRef = useRef(messages);
  const isLoadingRef = useRef(isLoading);

  messagesRef.current = messages;
  isLoadingRef.current = isLoading;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    syncComposerTextareaHeight(textareaRef.current, input);
  }, [input, projectId]);

  useEffect(() => {
    autoKickoffOnceRef.current = false;
  }, [projectId]);

  const runChatRound = useCallback(
    async (userText: string, baseMessages: Message[]): Promise<string> => {
      const trimmed = userText.trim();
      if (!trimmed) return "";

      if (!settings.apiKey) {
        onOpenSettings();
        return "";
      }
      if (!projectId) return "";

      setIsLoading(true);
      const userMsg: Message = { role: "user", content: trimmed };
      const newMessages = [...baseMessages, userMsg];
      onMessagesChange(newMessages);

      onMessagesChange([...newMessages, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            settings,
            projectContext: projectContext?.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "未知错误" }));
          const errMessages = [
            ...newMessages,
            { role: "assistant" as const, content: `**错误**: ${err.error || res.statusText}` },
          ];
          onMessagesChange(errMessages);
          return "";
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
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
            const data = trimmedLine.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                const visible = stripThinkingForDisplay(accumulated);
                onMessagesChange([...newMessages, { role: "assistant", content: visible }]);
              }
            } catch {
              // skip
            }
          }
        }

        const replyText = stripThinkingForDisplay(accumulated) || "(模型未返回任何内容)";
        const finalMessages: Message[] = [...newMessages, { role: "assistant", content: replyText }];
        onMessagesChange(finalMessages);

        onAssistantDone(replyText, finalMessages);
        return replyText;
      } catch (err) {
        const errContent = `**请求失败**: ${err instanceof Error ? err.message : String(err)}`;
        onMessagesChange([...newMessages, { role: "assistant" as const, content: errContent }]);
        return "";
      } finally {
        setIsLoading(false);
      }
    },
    [settings, projectId, projectContext, onMessagesChange, onAssistantDone, onOpenSettings]
  );

  useImperativeHandle(
    ref,
    () => ({
      sendUserMessage: async (text: string): Promise<string> => {
        const trimmed = text.trim();
        if (!trimmed) return "";
        if (!settings.apiKey) {
          onOpenSettings();
          return "";
        }
        if (!projectId) return "";
        if (isLoadingRef.current) return "";
        return runChatRound(trimmed, messagesRef.current);
      },
    }),
    [settings.apiKey, projectId, runChatRound, onOpenSettings]
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }

    if (!projectId) return;

    setInput("");
    await runChatRound(text, messages);
  }

  useEffect(() => {
    const msg = autoKickoffUserMessage?.trim();
    if (!msg) return;
    if (!projectId || !settings.apiKey) return;
    if (messages.length > 0) return;
    if (isLoading) return;
    if (autoKickoffOnceRef.current) return;
    autoKickoffOnceRef.current = true;
    void runChatRound(msg, []);
  }, [autoKickoffUserMessage, projectId, settings.apiKey, messages.length, isLoading, runChatRound]);

  function handleClear() {
    onMessagesChange([]);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (isImeCompositionKeyEvent(e)) return;
    e.preventDefault();
    void handleSend();
  }

  const showEmptyHint = messages.length === 0;
  const emptySub =
    isLoading && autoKickoffUserMessage
      ? "正在生成 STAGE 1 剧情梗概草案…"
      : projectId
        ? "发送灵感或大纲，开始创作"
        : "请先选择一个项目";

  return (
    <div className={styles.shell}>
      <div ref={messagesScrollRef} className={styles.messages}>
        {showEmptyHint && (
          <div className={styles.empty}>
            <div>
              <h2 className={styles.emptyTitle}>{BRAND_NAME}</h2>
              <p className={shellStyles.helpText}>{emptySub}</p>
            </div>
          </div>
        )}
        <div className={styles.messageList}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
      </div>

      <div className={styles.inputBar}>
        <div className={styles.inputRow}>
          <button
            type="button"
            onClick={handleClear}
            className={shellStyles.iconBtn}
            title="清空对话"
            aria-label="清空对话"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!projectId}
            placeholder={projectId ? "输入灵感、大纲或网文原文…" : "请先选择项目"}
            className={[shellStyles.textareaComposer, styles.inputArea].join(" ")}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim() || !projectId}
            className={styles.sendBtn}
            aria-label="发送"
            title="发送"
          >
            {isLoading ? (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" className={styles.spin}>
                <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChatWindow;
