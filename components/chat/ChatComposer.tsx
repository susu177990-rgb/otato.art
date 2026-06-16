"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ChatAttachment } from "@/lib/chat/types";
import type { ChatMode } from "@/lib/chat/types";
import { IMAGE_MODEL_ORDER, type ImageModelId, type ImageWorkspaceSettings } from "@/lib/image-workspace";
import type { Settings } from "@/lib/types";
import imageStyles from "@/app/image/image-page.module.css";
import { WorkspaceModeDock } from "@/components/workspace/WorkspaceModeDock";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./chat-composer.module.css";

type MenuAnchor = { left: number; top: number; width: number; height: number };
type ModelPickerKind = "llm" | "image";
type ModelPickerMenuState = { kind: ModelPickerKind; anchor: MenuAnchor } | null;

function menuAnchorFromElement(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

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
  llmSettings,
  selectedLlmModelId,
  onLlmModelChange,
  chatMode,
  onSetChatMode,
  showAttachments = true,
  showChatMode = true,
  extraActions = null,
  className,
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
  llmSettings: Settings;
  selectedLlmModelId: string;
  onLlmModelChange: (id: string) => void;
  chatMode: ChatMode;
  onSetChatMode: (mode: ChatMode) => void | Promise<void>;
  showAttachments?: boolean;
  showChatMode?: boolean;
  extraActions?: React.ReactNode;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const [modelPickerMenu, setModelPickerMenu] = useState<ModelPickerMenuState>(null);
  const [portalMounted, setPortalMounted] = useState(false);

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

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!modelPickerMenu) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setModelPickerMenu(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modelPickerMenu]);

  const canSend = Boolean(inputText.trim() || pendingAttachments.length > 0);
  const enabledLlmModels = Object.values(llmSettings.models).filter((model) => model.enabled);
  const selectedLlmModelLabel = enabledLlmModels.find((model) => model.id === selectedLlmModelId)?.label ?? selectedLlmModelId;
  const selectedImageModelLabel = imageWorkspace.models[selectedImageModelId]?.label ?? selectedImageModelId;
  const modelPickerOptions = modelPickerMenu
    ? modelPickerMenu.kind === "llm"
      ? enabledLlmModels.map((model) => ({
          id: model.id,
          label: model.label,
          active: selectedLlmModelId === model.id,
          onSelect: () => onLlmModelChange(model.id),
        }))
      : IMAGE_MODEL_ORDER.map((id) => ({
          id,
          label: imageWorkspace.models[id].label,
          active: selectedImageModelId === id,
          onSelect: () => onImageModelChange(id),
        }))
    : [];

  return (
    <section ref={wrapRef} className={[imageStyles.composerWrap, className ?? ""].join(" ")}>
      {error ? <div className={imageStyles.error}>{error}</div> : null}

      <div className={imageStyles.composerDock}>
        <div className={styles.attachmentDock} />
        <WorkspaceModeDock />
      </div>

      <div
        className={[imageStyles.composer, styles.composer].join(" ")}
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
          {showAttachments ? (
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
          ) : null}
          {showChatMode ? (
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
          ) : null}
          <div className={styles.modelGroup}>
            <button
              type="button"
              disabled={isSending}
              aria-label="对话模型"
              aria-haspopup="menu"
              aria-expanded={modelPickerMenu?.kind === "llm"}
              className={styles.modelPickerButton}
              onClick={(event) => {
                const anchor = menuAnchorFromElement(event.currentTarget);
                setModelPickerMenu((current) => current?.kind === "llm" ? null : { kind: "llm", anchor });
              }}
            >
              <span className={styles.modelPickerLabel}>{selectedLlmModelLabel}</span>
            </button>
            <button
              type="button"
              disabled={isSending}
              aria-label="生图模型"
              aria-haspopup="menu"
              aria-expanded={modelPickerMenu?.kind === "image"}
              className={styles.modelPickerButton}
              onClick={(event) => {
                const anchor = menuAnchorFromElement(event.currentTarget);
                setModelPickerMenu((current) => current?.kind === "image" ? null : { kind: "image", anchor });
              }}
            >
              <span className={styles.modelPickerLabel}>{selectedImageModelLabel}</span>
            </button>
          </div>
          <div className={styles.toolbarSpacer} />
          {extraActions}
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
      {portalMounted && modelPickerMenu
        ? createPortal(
            <>
              <button
                type="button"
                className={styles.modelPickerBackdrop}
                aria-label="关闭模型菜单"
                onClick={() => setModelPickerMenu(null)}
              />
              <div
                className={styles.modelPickerMenu}
                style={{
                  left: modelPickerMenu.anchor.left + modelPickerMenu.anchor.width / 2,
                  top: modelPickerMenu.anchor.top,
                } as CSSProperties}
                role="menu"
              >
                {modelPickerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={[styles.modelPickerOption, option.active ? styles.modelPickerOptionActive : ""].filter(Boolean).join(" ")}
                    role="menuitemradio"
                    aria-checked={option.active}
                    onClick={() => {
                      option.onSelect();
                      setModelPickerMenu(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
    </section>
  );
}
