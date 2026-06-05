"use client";

import { useEffect, useRef } from "react";
import type { ChatAttachment } from "@/lib/chat/types";
import type { ChatMode } from "@/lib/chat/types";
import { IMAGE_MODEL_ORDER, type ImageModelId, type ImageWorkspaceSettings } from "@/lib/image-workspace";
import imageStyles from "@/app/image/image-page.module.css";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./chat-composer.module.css";

export function ChatComposer({
  inputText,
  onInputTextChange,
  pendingAttachments,
  onAddFiles,
  onRemoveAttachment,
  isSending,
  onSend,
  error,
  imageWorkspace,
  selectedImageModelId,
  onImageModelChange,
  chatMode,
  onSetChatMode,
}: {
  inputText: string;
  onInputTextChange: (value: string) => void;
  pendingAttachments: ChatAttachment[];
  onAddFiles: (files: FileList | File[]) => void | Promise<void>;
  onRemoveAttachment: (index: number) => void;
  isSending: boolean;
  onSend: () => void | Promise<void>;
  error: string | null;
  imageWorkspace: ImageWorkspaceSettings;
  selectedImageModelId: ImageModelId;
  onImageModelChange: (id: ImageModelId) => void;
  chatMode: ChatMode;
  onSetChatMode: (mode: ChatMode) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      const root = wrapRef.current;
      if (!root) return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
      if (active && !root.contains(active) && active !== document.body) return;
      e.preventDefault();
      void onAddFiles(files);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onAddFiles]);

  const canSend = Boolean(inputText.trim() || pendingAttachments.length > 0);

  return (
    <section ref={wrapRef} className={imageStyles.composerWrap}>
      {error ? <div className={imageStyles.error}>{error}</div> : null}

      <div
        className={imageStyles.composer}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) void onAddFiles(e.dataTransfer.files);
        }}
      >
        <div className={styles.inputShell}>
          {pendingAttachments.length > 0 ? (
            <div className={styles.attachRow}>
              {pendingAttachments.map((att, i) => (
                <div key={`${att.name}-${i}`} className={styles.attachChip}>
                  {att.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={att.dataUrl} alt={att.name} />
                  ) : att.kind === "video" ? (
                    <video src={att.dataUrl} className={styles.attachMedia} muted playsInline />
                  ) : (
                    <span className={styles.attachFileName} title={att.name}>
                      {att.name.length > 6 ? `${att.name.slice(0, 5)}…` : att.name}
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.attachRemove}
                    aria-label={`移除 ${att.name}`}
                    onClick={() => onRemoveAttachment(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <textarea
            value={inputText}
            disabled={isSending}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            aria-label="对话输入"
            className={[imageStyles.promptInput, styles.promptInput].join(" ")}
            onChange={(e) => onInputTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isSending && canSend) void onSend();
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files?.length) {
                e.preventDefault();
                void onAddFiles(files);
              }
            }}
          />
        </div>

        <div className={[imageStyles.toolbar, styles.toolbar].join(" ")}>
          <label className={styles.addBtn} aria-label="添加附件">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className={imageStyles.hiddenInput}
              disabled={isSending}
              onChange={(e) => {
                if (e.target.files?.length) void onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className={styles.addPlus}>+</span>
          </label>
          <div className={[shellStyles.segmented, shellStyles.segmentedComposer].join(" ")}>
            {(["prompt", "skill"] as const).map((mode) => {
              const active = chatMode === mode;
              const label = mode === "prompt" ? "常规模式" : "Skill 模式";
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void onSetChatMode(mode)}
                  className={[shellStyles.segmentedItem, active ? shellStyles.segmentedItemActive : ""].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className={styles.modelGroup}>
            <select
              value={selectedImageModelId}
              disabled={isSending}
              aria-label="生图模型"
              className={[imageStyles.composerSelect, styles.modelSelect].join(" ")}
              onChange={(e) => onImageModelChange(e.target.value as ImageModelId)}
            >
              {IMAGE_MODEL_ORDER.map((id) => (
                <option key={id} value={id}>
                  {imageWorkspace.models[id].label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.toolbarSpacer} />
          <button
            type="button"
            className={imageStyles.generate}
            disabled={isSending || !canSend}
            onClick={() => void onSend()}
          >
            {isSending ? "发送中" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}
