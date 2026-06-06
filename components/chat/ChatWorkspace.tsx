"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useSearchParams } from "next/navigation";
import { ChatPromptPresetRail } from "@/components/chat/ChatPromptPresetRail";
import { ChatSessionRail } from "@/components/chat/ChatSessionRail";
import { ChatSkillRail } from "@/components/chat/ChatSkillRail";
import { SkillFormPanel } from "@/components/skill-form/SkillFormPanel";
import { CHAT_MAX_ATTACHMENT_BYTES } from "@/lib/chat/completion";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import type {
  ChatAttachment,
  ChatAttachmentKind,
  ChatMode,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  SkillFormRunResult,
  SkillPackRecord,
} from "@/lib/chat/types";
import {
  createChatConversation,
  deleteChatConversationApi,
  fetchChatConversation,
  fetchChatConversations,
  saveChatConversation,
  sendChatAgentTurn,
} from "@/lib/chat-api-client";
import { buildChatEmptyGuideMarkdown, buildChatPromptPresetGuideMarkdown } from "@/lib/chat/chat-empty-guide";
import { skillPackHasFormInterface } from "@/lib/chat/skill-pack";
import { fetchSitePromptPresets } from "@/lib/prompt-preset-api-client";
import { fetchSiteSkillPacks, runSkillFormApi } from "@/lib/skill-packs-api-client";
import type { ImageModelId } from "@/lib/image-workspace";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./chat-workspace.module.css";

type ParsedToolMedia = {
  text: string;
  mediaUrl: string;
  isVideo: boolean;
};

function attachmentKindFromFile(file: File): ChatAttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function parseToolMedia(text: string): ParsedToolMedia | null {
  let parsed: {
    success?: boolean;
    media_url?: string;
    kind?: string;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return null;
  }
  if (!parsed.success || !parsed.media_url || typeof parsed.media_url !== "string") {
    return null;
  }

  const mediaUrl = parsed.media_url;
  const isVideo =
    parsed.kind === "video" ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaUrl) ||
    mediaUrl.startsWith("data:video");
  return { text, mediaUrl, isVideo };
}

function ToolResultBody({ text }: { text: string }) {
  let parsed: { success?: boolean; error?: string } | null = null;
  try {
    parsed = JSON.parse(text) as { success?: boolean; error?: string };
  } catch {
    parsed = null;
  }

  if (parsed?.success === false) {
    return (
      <p className={styles.toolError}>
        生图失败：{parsed.error || "未知错误"}
      </p>
    );
  }

  const media = parseToolMedia(text);
  if (media) {
    return (
      <div className={styles.toolResult}>
        {media.isVideo ? (
          <video src={media.mediaUrl} controls className={styles.toolMedia} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.mediaUrl} alt="生图结果" className={styles.toolMedia} />
        )}
      </div>
    );
  }
  return <pre className={styles.toolJson}>{text}</pre>;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className={[shellStyles.bubbleRow, shellStyles.bubbleRowUser].join(" ")}>
        <div className={shellStyles.bubbleUser}>
          {msg.parts.map((p, i) =>
            p.type === "text" ? (
              <p key={i} className={styles.msgText}>
                {p.text}
              </p>
            ) : (
              <p key={i} className={styles.attachMeta}>
                📎 {p.attachment.name}
              </p>
            ),
          )}
        </div>
      </div>
    );
  }

  if (msg.role === "assistant") {
    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return (
      <div className={[shellStyles.bubbleRow, shellStyles.bubbleRowAssistant].join(" ")}>
        <div className={shellStyles.bubbleAssistant}>
          {text ? <ChatMarkdown markdown={text} /> : msg.toolCalls?.length ? (
            <p className={styles.sending}>正在调用工具…</p>
          ) : null}
          {msg.toolCalls?.map((tc) => (
            <details key={tc.id} className={styles.toolCall}>
              <summary>工具 · {tc.name}</summary>
              <pre className={styles.toolArgs}>{tc.arguments}</pre>
            </details>
          ))}
        </div>
      </div>
    );
  }

  if (msg.role === "tool") {
    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    let label = "工具结果";
    try {
      const j = JSON.parse(text) as { success?: boolean };
      if (j.success) label = "生图结果";
    } catch {
      /* ignore */
    }
    return (
      <div className={[shellStyles.bubbleRow, shellStyles.bubbleRowAssistant].join(" ")}>
        <div className={[shellStyles.bubbleAssistant, styles.toolBubble].join(" ")}>
          <p className={styles.toolLabel}>{label}</p>
          <ToolResultBody text={text} />
        </div>
      </div>
    );
  }

  return null;
}

export function ChatWorkspace() {
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversationId");
  const { settings: llmSettings, workspaceReady, imageWorkspace } = useApiSettings();
  const [summaries, setSummaries] = useState<ChatConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [skillPacks, setSkillPacks] = useState<SkillPackRecord[]>([]);
  const [chatPromptPresets, setChatPromptPresets] = useState<SitePromptPreset[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedImageModelId, setSelectedImageModelId] = useState<ImageModelId>("gpt-image-2");
  const [selectedLlmModelId, setSelectedLlmModelId] = useState<string>(llmSettings.defaultModelId);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [skillRunResult, setSkillRunResult] = useState<SkillFormRunResult | null>(null);
  const [isRunningSkillForm, setIsRunningSkillForm] = useState(false);
  const [lastSkillPayload, setLastSkillPayload] = useState<unknown>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  activeIdRef.current = activeId;

  const conversationMatchesActive = Boolean(activeId && conversation?.id === activeId);
  const threadVisible =
    conversationMatchesActive || Boolean(isSending && conversation && activeId === conversation.id);

  const loadSkillPacks = useCallback(async () => {
    const { skillPacks: packs } = await fetchSiteSkillPacks();
    setSkillPacks(packs);
  }, []);

  const loadLists = useCallback(async () => {
    const [convs, packsRes, promptPresets] = await Promise.all([
      fetchChatConversations(),
      fetchSiteSkillPacks(),
      fetchSitePromptPresets("chat"),
    ]);
    setSummaries(convs);
    setSkillPacks(packsRes.skillPacks);
    setChatPromptPresets(promptPresets);
    if (requestedConversationId && convs.some((conv) => conv.id === requestedConversationId)) {
      setActiveId(requestedConversationId);
    } else if (!activeId && convs[0]) {
      setActiveId(convs[0].id);
    }
  }, [activeId, requestedConversationId]);

  useEffect(() => {
    if (!workspaceReady) return;
    void loadLists().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [workspaceReady, loadLists]);

  useEffect(() => {
    if (!workspaceReady) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void Promise.all([loadSkillPacks(), fetchSitePromptPresets("chat").then(setChatPromptPresets)]).catch(() => {});
      }
    };
    const onFocus = () => {
      void Promise.all([loadSkillPacks(), fetchSitePromptPresets("chat").then(setChatPromptPresets)]).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceReady, loadSkillPacks]);

  useEffect(() => {
    setInputText("");
    setPendingAttachments([]);
    setError(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setConversation(null);
      setIsLoadingConversation(false);
      return;
    }

    const loadId = activeId;
    let cancelled = false;

    setConversation((prev) => {
      if (prev?.id === loadId) return prev;
      return null;
    });
    setIsLoadingConversation(true);

    void fetchChatConversation(loadId)
      .then((c) => {
        if (cancelled || activeIdRef.current !== loadId || c.id !== loadId) return;
        setConversation((prev) => {
          if (prev?.id === c.id && prev.updatedAt > c.updatedAt) return prev;
          return c;
        });
      })
      .catch((e) => {
        if (!cancelled && activeIdRef.current === loadId) {
          setError(e instanceof Error ? e.message : "加载会话失败");
        }
      })
      .finally(() => {
        if (!cancelled && activeIdRef.current === loadId) {
          setIsLoadingConversation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (conversation?.preferredImageModelId) {
      setSelectedImageModelId(conversation.preferredImageModelId);
    } else if (!activeId) {
      setSelectedImageModelId("gpt-image-2");
    }
  }, [conversation?.preferredImageModelId, activeId]);

  useEffect(() => {
    if (conversation?.preferredLlmModelId) {
      setSelectedLlmModelId(conversation.preferredLlmModelId);
    } else {
      setSelectedLlmModelId(llmSettings.defaultModelId);
    }
  }, [conversation?.preferredLlmModelId, llmSettings.defaultModelId]);

  const handleImageModelChange = (id: ImageModelId) => {
    setSelectedImageModelId(id);
    if (!conversation || conversation.id !== activeIdRef.current) return;
    const updated = { ...conversation, preferredImageModelId: id, updatedAt: Date.now() };
    setConversation(updated);
    void saveChatConversation(updated).catch((e) =>
      setError(e instanceof Error ? e.message : "保存生图模型选择失败"),
    );
  };

  const handleLlmModelChange = (id: string) => {
    setSelectedLlmModelId(id);
    if (!conversation || conversation.id !== activeIdRef.current) return;
    const updated = { ...conversation, preferredLlmModelId: id, updatedAt: Date.now() };
    setConversation(updated);
    void saveChatConversation(updated).catch((e) =>
      setError(e instanceof Error ? e.message : "保存对话模型选择失败"),
    );
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages, isSending]);

  const selectedSkillPackId = conversationMatchesActive
    ? (conversation?.selectedSkillPackId ?? null)
    : null;
  const selectedChatPresetId = conversationMatchesActive ? (conversation?.selectedChatPresetId ?? null) : null;
  const chatMode: ChatMode = conversationMatchesActive ? conversation?.chatMode ?? "prompt" : "prompt";

  const selectedPack = useMemo(
    () => skillPacks.find((p) => p.id === selectedSkillPackId) ?? null,
    [skillPacks, selectedSkillPackId],
  );
  const selectedPromptPreset = useMemo(
    () => chatPromptPresets.find((preset) => preset.id === selectedChatPresetId) ?? null,
    [chatPromptPresets, selectedChatPresetId],
  );
  const isSkillMode = chatMode === "skill";
  const isFormMode = Boolean(isSkillMode && selectedPack && skillPackHasFormInterface(selectedPack));

  const emptyGuideMarkdown = useMemo(() => {
    if (isSkillMode) {
      if (!selectedSkillPackId) return buildChatEmptyGuideMarkdown(null);
      const pack = skillPacks.find((p) => p.id === selectedSkillPackId);
      return buildChatEmptyGuideMarkdown(pack);
    }
    return buildChatPromptPresetGuideMarkdown(selectedPromptPreset);
  }, [isSkillMode, selectedSkillPackId, skillPacks, selectedPromptPreset]);

  useEffect(() => {
    setSkillRunResult(null);
    setError(null);
  }, [selectedSkillPackId, selectedChatPresetId, chatMode, activeId]);

  const handleSkillFormSubmit = async (payload: unknown) => {
    if (!selectedPack?.inputSchema || isRunningSkillForm) return;
    setError(null);
    setIsRunningSkillForm(true);
    try {
      const result = await runSkillFormApi(selectedPack.id, payload, selectedImageModelId);
      setLastSkillPayload(payload);
      setSkillRunResult(result);
    } catch (e) {
      setSkillRunResult(null);
      setError(e instanceof Error ? e.message : "生成分镜失败");
    } finally {
      setIsRunningSkillForm(false);
    }
  };

  const handleSkillFormConfirmImage = async () => {
    if (!selectedPack?.inputSchema || isRunningSkillForm || !lastSkillPayload) return;
    const masterPrompt = skillRunResult?.master_prompt_markdown ?? skillRunResult?.master_prompt;
    if (!masterPrompt?.trim()) return;
    setError(null);
    setIsRunningSkillForm(true);
    try {
      const result = await runSkillFormApi(selectedPack.id, lastSkillPayload, selectedImageModelId, {
        action: "generate",
        masterPrompt,
      });
      setSkillRunResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成分镜失败");
    } finally {
      setIsRunningSkillForm(false);
    }
  };

  const selectSkillPack = async (packId: string | null) => {
    if (isSavingSkill) return;
    setError(null);
    setIsSavingSkill(true);
    let convId = activeIdRef.current;
    let conv = conversation?.id === convId ? conversation : null;

    if (!convId) {
      const created = await createChatConversation();
      convId = created.id;
      conv = created;
      activeIdRef.current = created.id;
      setActiveId(created.id);
      setSummaries((prev) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt }, ...prev]);
    }

    if (!conv) {
      conv = await fetchChatConversation(convId);
    }

    const targetId = convId;
    const updated = {
      ...conv,
      chatMode: "skill" as ChatMode,
      selectedSkillPackId: packId,
      updatedAt: Date.now(),
    };
    if (activeIdRef.current === targetId) {
      setConversation(updated);
    }

    try {
      const saved = await saveChatConversation(updated);
      if (activeIdRef.current === saved.id) {
        setConversation(saved);
      }
    } catch (e) {
      if (activeIdRef.current === convId) setConversation(conv);
      throw e;
    } finally {
      setIsSavingSkill(false);
    }
  };

  const selectChatPromptPreset = async (presetId: string | null) => {
    if (isSavingSkill) return;
    setError(null);
    setIsSavingSkill(true);
    let convId = activeIdRef.current;
    let conv = conversation?.id === convId ? conversation : null;

    if (!convId) {
      const created = await createChatConversation();
      convId = created.id;
      conv = created;
      activeIdRef.current = created.id;
      setActiveId(created.id);
      setSummaries((prev) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt }, ...prev]);
    }

    if (!conv) {
      conv = await fetchChatConversation(convId);
    }

    const targetId = convId;
    const updated = {
      ...conv,
      chatMode: "prompt" as ChatMode,
      selectedChatPresetId: presetId,
      updatedAt: Date.now(),
    };
    if (activeIdRef.current === targetId) {
      setConversation(updated);
    }

    try {
      const saved = await saveChatConversation(updated);
      if (activeIdRef.current === saved.id) {
        setConversation(saved);
      }
    } catch (e) {
      if (activeIdRef.current === convId) setConversation(conv);
      throw e;
    } finally {
      setIsSavingSkill(false);
    }
  };

  const setChatModeValue = async (nextMode: ChatMode) => {
    if (isSavingSkill) return;
    setError(null);
    setIsSavingSkill(true);
    let convId = activeIdRef.current;
    let conv = conversation?.id === convId ? conversation : null;

    if (!convId) {
      const created = await createChatConversation();
      convId = created.id;
      conv = created;
      activeIdRef.current = created.id;
      setActiveId(created.id);
      setSummaries((prev) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt }, ...prev]);
    }

    if (!conv) {
      conv = await fetchChatConversation(convId);
    }

    const updated = {
      ...conv,
      chatMode: nextMode,
      updatedAt: Date.now(),
    };
    if (activeIdRef.current === convId) {
      setConversation(updated);
    }

    try {
      const saved = await saveChatConversation(updated);
      if (activeIdRef.current === saved.id) {
        setConversation(saved);
      }
    } catch (e) {
      if (activeIdRef.current === convId) setConversation(conv);
      throw e;
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleNewChat = async () => {
    const c = await createChatConversation();
    activeIdRef.current = c.id;
    setSummaries((prev) => [{ id: c.id, title: c.title, updatedAt: c.updatedAt }, ...prev]);
    setActiveId(c.id);
    setConversation(c);
    setIsLoadingConversation(false);
    setError(null);
  };

  const handleDeleteConv = async (id: string) => {
    await deleteChatConversationApi(id);
    const next = summaries.filter((s) => s.id !== id);
    setSummaries(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
    }
  };

  const commitRename = async () => {
    if (!renamingId || !conversation || renamingId !== conversation.id) return;
    const title = renameDraft.trim() || "新对话";
    const updated = { ...conversation, title, updatedAt: Date.now() };
    const saved = await saveChatConversation(updated);
    setConversation(saved);
    setSummaries((prev) => prev.map((s) => (s.id === saved.id ? { ...s, title: saved.title, updatedAt: saved.updatedAt } : s)));
    setRenamingId(null);
  };

  const addAttachments = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > CHAT_MAX_ATTACHMENT_BYTES) {
        setError(`「${file.name}」超过 12MB，未添加`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      setPendingAttachments((prev) => [
        ...prev,
        {
          kind: attachmentKindFromFile(file),
          mime: file.type || "application/octet-stream",
          name: file.name || `file-${Date.now()}`,
          dataUrl,
        },
      ]);
    }
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    setError(null);
    setIsSending(true);

    const uid = `msg-${Date.now()}-u`;
    const userParts: ChatMessage["parts"] = [];
    if (trimmed) userParts.push({ type: "text", text: trimmed });
    for (const att of pendingAttachments) {
      const rid = `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      userParts.push({
        type: "attachment",
        attachment: { ...att, registryId: rid },
      });
    }

    const userMessage: ChatMessage = {
      id: uid,
      role: "user",
      createdAt: Date.now(),
      parts: userParts,
    };

    const imageModelForTurn = selectedImageModelId;
    setInputText("");
    setPendingAttachments([]);

    try {
      let convId = activeIdRef.current;
      let conv = conversation?.id === convId ? conversation : null;

      if (!convId || !conv) {
        const created = await createChatConversation();
        convId = created.id;
        conv = { ...created, preferredLlmModelId: selectedLlmModelId };
        activeIdRef.current = created.id;
        setSummaries((prev) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt }, ...prev]);
      }

      const sendConvId = convId;
      const optimistic: ChatConversation = {
        ...conv,
        messages: [...conv.messages, userMessage],
        preferredLlmModelId: conv.preferredLlmModelId ?? selectedLlmModelId,
        updatedAt: Date.now(),
      };
      setConversation(optimistic);
      if (activeId !== sendConvId) {
        setActiveId(sendConvId);
      }

      const updated = await sendChatAgentTurn(sendConvId, userMessage, imageModelForTurn, selectedLlmModelId);

      if (activeIdRef.current !== sendConvId) {
        setError("回复已生成，但你已切换到其他会话，请切回该会话查看。");
        return;
      }

      const hasAssistant = updated.messages.some(
        (m) =>
          m.role === "assistant" &&
          m.parts.some((p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0),
      );
      const hasTool = updated.messages.some((m) => m.role === "tool");
      if (!hasAssistant && !hasTool) {
        setError("模型未返回任何内容，请检查 设置 → LLM API 或更换模型后重试。");
        return;
      }

      setConversation(updated);
      setSummaries((prev) => {
        const row = { id: updated.id, title: updated.title, updatedAt: updated.updatedAt };
        const rest = prev.filter((s) => s.id !== updated.id);
        return [row, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.stage}>
      {isSkillMode ? (
        <ChatSkillRail
          skillPacks={skillPacks}
          selectedPackId={selectedSkillPackId}
          skillSwitchDisabled={isSavingSkill}
          onSelectPack={(id) =>
            void selectSkillPack(id).catch((e) =>
              setError(e instanceof Error ? e.message : "保存 Skill 选择失败"),
            )
          }
        />
      ) : (
        <ChatPromptPresetRail
          presets={chatPromptPresets}
          selectedPresetId={selectedChatPresetId}
          switchDisabled={isSavingSkill}
          onSelectPreset={(id) =>
            void selectChatPromptPreset(id).catch((e) =>
              setError(e instanceof Error ? e.message : "保存对话提示词预设失败"),
            )
          }
        />
      )}

      <div ref={scrollRef} className={[styles.messages, isFormMode ? styles.messagesForm : ""].filter(Boolean).join(" ")}>
        {isFormMode && selectedPack ? (
          conversationMatchesActive ? (
            <SkillFormPanel
              pack={selectedPack}
              result={skillRunResult}
              loading={isRunningSkillForm}
              error={error}
              onSubmit={(payload) => void handleSkillFormSubmit(payload)}
              onConfirmImage={() => void handleSkillFormConfirmImage()}
            />
          ) : activeId ? (
            <p className={styles.sending}>加载会话…</p>
          ) : null
        ) : isLoadingConversation && activeId && !threadVisible ? (
          <p className={styles.sending}>加载会话…</p>
        ) : !threadVisible ? null : !conversation?.messages.length ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyGuide}>
              <ChatMarkdown markdown={emptyGuideMarkdown} variant="guide" />
            </div>
          </div>
        ) : (
          <div className={styles.messageList}>
            {conversation.messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
          </div>
        )}
        {isSending && threadVisible && !isFormMode ? <p className={styles.sending}>思考中…</p> : null}
      </div>

      {!isFormMode ? (
        <ChatComposer
          inputText={inputText}
          onInputTextChange={setInputText}
          pendingAttachments={pendingAttachments}
          onAddFiles={addAttachments}
          onRemoveAttachment={(i) => setPendingAttachments((p) => p.filter((_, j) => j !== i))}
          isSending={isSending}
          onSend={handleSend}
          error={error}
          imageWorkspace={imageWorkspace}
          selectedImageModelId={selectedImageModelId}
          onImageModelChange={handleImageModelChange}
          llmSettings={llmSettings}
          selectedLlmModelId={selectedLlmModelId}
          onLlmModelChange={handleLlmModelChange}
          chatMode={chatMode}
          onSetChatMode={(mode) =>
            void setChatModeValue(mode).catch((e) =>
              setError(e instanceof Error ? e.message : "切换对话模式失败"),
            )
          }
        />
      ) : null}

      <ChatSessionRail
        summaries={summaries}
        activeId={activeId}
        renamingId={renamingId}
        renameDraft={renameDraft}
        onRenameDraftChange={setRenameDraft}
        onSelect={setActiveId}
        onNew={() => void handleNewChat()}
        onStartRename={(id, title) => {
          setRenamingId(id);
          setRenameDraft(title);
        }}
        onCommitRename={() => void commitRename()}
        onDelete={(id) => void handleDeleteConv(id)}
      />
    </div>
  );
}
